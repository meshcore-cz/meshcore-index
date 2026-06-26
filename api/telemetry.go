package main

import (
	"net/http"
	"strconv"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// version is the build version reported via meshcore_build_info. Override at
// build time with -ldflags "-X main.version=...".
var version = "dev"

// Metrics holds every Prometheus collector the service exposes. It is created
// once in main and threaded through the server, collectors and DB flush loop.
// The exposition format is plain Prometheus text, so it scrapes identically
// under VictoriaMetrics.
//
// Cardinality is kept bounded deliberately (see the design notes): labels are
// limited to network, payload_type, analyzer, normalized API route, method,
// status code and a small fixed set of operation/reason names. Per-packet
// identifiers (pubkey, content hash, packet id, observer id, resolved path) are
// never used as labels.
//
// All methods are nil-safe so tests can pass a nil *Metrics and skip telemetry.
type Metrics struct {
	reg *prometheus.Registry

	// --- ingest / packet flow ---
	packetsReceived *prometheus.CounterVec // network, payload_type
	observations    *prometheus.CounterVec // network
	decodeErrors    *prometheus.CounterVec // reason

	// --- analyzer connections ---
	analyzerConnected  *prometheus.GaugeVec   // network, analyzer (1 connected, 0 not)
	analyzerReconnects *prometheus.CounterVec // network, analyzer
	analyzerLastPacket *prometheus.GaugeVec   // network, analyzer (unix seconds)

	// --- persistence (SQLite flush loop) ---
	dbFlushDuration *prometheus.HistogramVec // op
	dbFlushErrors   *prometheus.CounterVec   // op
	dbRowsWritten   *prometheus.CounterVec   // op

	// --- API performance ---
	apiRequests        *prometheus.CounterVec   // route, method, code
	apiRequestDuration *prometheus.HistogramVec // route, method
	apiResponseSize    *prometheus.HistogramVec // route
	apiInFlight        prometheus.Gauge
}

// apiDurationBuckets target a fast read-only JSON API: sub-millisecond up to a
// few seconds (the map "all nodes" payload is the slow outlier).
var apiDurationBuckets = []float64{
	0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
}

// responseSizeBuckets span a few hundred bytes (health) up to multi-MB (map).
var responseSizeBuckets = prometheus.ExponentialBuckets(256, 4, 9) // 256B .. ~16MB

// dbFlushBuckets cover a quick SQLite write up to a slow batch.
var dbFlushBuckets = []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5}

// NewMetrics builds a fresh registry with the Go runtime and process collectors
// plus all service collectors registered. A dedicated (non-default) registry
// keeps tests isolated and avoids global duplicate-registration panics.
func NewMetrics() *Metrics {
	reg := prometheus.NewRegistry()
	factory := promauto.With(reg)

	m := &Metrics{reg: reg}

	m.packetsReceived = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_packets_received_total",
		Help: "Packets received from analyzers, before deduplication.",
	}, []string{"network", "payload_type"})

	m.observations = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_observations_total",
		Help: "Packet observations processed (each analyzer report of a packet).",
	}, []string{"network"})

	m.decodeErrors = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_packets_decode_errors_total",
		Help: "Packets dropped because they could not be decoded, by reason.",
	}, []string{"reason"})

	m.analyzerConnected = factory.NewGaugeVec(prometheus.GaugeOpts{
		Name: "meshcore_analyzer_connected",
		Help: "Whether the analyzer WebSocket is currently connected (1) or not (0).",
	}, []string{"network", "analyzer"})

	m.analyzerReconnects = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_analyzer_reconnects_total",
		Help: "Number of times an analyzer connection was (re)established.",
	}, []string{"network", "analyzer"})

	m.analyzerLastPacket = factory.NewGaugeVec(prometheus.GaugeOpts{
		Name: "meshcore_analyzer_last_packet_timestamp_seconds",
		Help: "Unix timestamp of the last packet received from the analyzer.",
	}, []string{"network", "analyzer"})

	m.dbFlushDuration = factory.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "meshcore_db_flush_duration_seconds",
		Help:    "Duration of a SQLite persistence flush, by operation.",
		Buckets: dbFlushBuckets,
	}, []string{"op"})

	m.dbFlushErrors = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_db_flush_errors_total",
		Help: "SQLite persistence flush errors, by operation.",
	}, []string{"op"})

	m.dbRowsWritten = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_db_rows_written_total",
		Help: "Rows written to SQLite, by operation.",
	}, []string{"op"})

	m.apiRequests = factory.NewCounterVec(prometheus.CounterOpts{
		Name: "meshcore_api_requests_total",
		Help: "HTTP API requests, by normalized route, method and status code.",
	}, []string{"route", "method", "code"})

	m.apiRequestDuration = factory.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "meshcore_api_request_duration_seconds",
		Help:    "HTTP API request latency, by normalized route and method.",
		Buckets: apiDurationBuckets,
	}, []string{"route", "method"})

	m.apiResponseSize = factory.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "meshcore_api_response_size_bytes",
		Help:    "HTTP API response body size in bytes (uncompressed), by route.",
		Buckets: responseSizeBuckets,
	}, []string{"route"})

	m.apiInFlight = factory.NewGauge(prometheus.GaugeOpts{
		Name: "meshcore_api_requests_in_flight",
		Help: "HTTP API requests currently being served.",
	})

	// Runtime and process health, plus a build-info marker.
	reg.MustRegister(
		collectors.NewGoCollector(),
		collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}),
	)
	buildInfo := factory.NewGaugeVec(prometheus.GaugeOpts{
		Name: "meshcore_build_info",
		Help: "Build information; constant 1 with version label.",
	}, []string{"version"})
	buildInfo.WithLabelValues(version).Set(1)

	return m
}

// handler serves the Prometheus text exposition for this registry.
func (m *Metrics) handler() http.Handler {
	return promhttp.HandlerFor(m.reg, promhttp.HandlerOpts{})
}

// --- nil-safe recording helpers ---

func (m *Metrics) recordPacket(network, payloadType string) {
	if m == nil {
		return
	}
	if payloadType == "" {
		payloadType = "unknown"
	}
	m.packetsReceived.WithLabelValues(network, payloadType).Inc()
	m.observations.WithLabelValues(network).Inc()
}

func (m *Metrics) recordDecodeError(reason string) {
	if m == nil {
		return
	}
	m.decodeErrors.WithLabelValues(reason).Inc()
}

// initAnalyzer pre-creates the gauge series for a known analyzer so it reports
// 0 (disconnected) before the first connection attempt instead of being absent.
func (m *Metrics) initAnalyzer(network, analyzer string) {
	if m == nil {
		return
	}
	m.analyzerConnected.WithLabelValues(network, analyzer).Set(0)
}

func (m *Metrics) setAnalyzerConnected(network, analyzer string, connected bool) {
	if m == nil {
		return
	}
	v := 0.0
	if connected {
		v = 1
	}
	m.analyzerConnected.WithLabelValues(network, analyzer).Set(v)
}

func (m *Metrics) incAnalyzerReconnect(network, analyzer string) {
	if m == nil {
		return
	}
	m.analyzerReconnects.WithLabelValues(network, analyzer).Inc()
}

func (m *Metrics) setAnalyzerLastPacket(network, analyzer string, unix int64) {
	if m == nil {
		return
	}
	m.analyzerLastPacket.WithLabelValues(network, analyzer).Set(float64(unix))
}

// observeDBFlush records the duration, row count and error outcome of one
// persistence operation.
func (m *Metrics) observeDBFlush(op string, rows int, dur time.Duration, err error) {
	if m == nil {
		return
	}
	m.dbFlushDuration.WithLabelValues(op).Observe(dur.Seconds())
	if err != nil {
		m.dbFlushErrors.WithLabelValues(op).Inc()
		return
	}
	if rows > 0 {
		m.dbRowsWritten.WithLabelValues(op).Add(float64(rows))
	}
}

// statusRecorder captures the response status code and body size for API
// instrumentation. It wraps whatever ResponseWriter the middleware chain passes
// (including the gzip writer), so the recorded size is the uncompressed body.
type statusRecorder struct {
	http.ResponseWriter
	status      int
	bytes       int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if !r.wroteHeader {
		r.status = http.StatusOK
		r.wroteHeader = true
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// instrument wraps a handler with the API performance metrics under a fixed,
// normalized route label (e.g. "/api/networks/:id"), so per-request path
// variables never explode label cardinality.
func (s *Server) instrument(route string, h http.HandlerFunc) http.HandlerFunc {
	m := s.metrics
	if m == nil {
		return h
	}
	return func(w http.ResponseWriter, r *http.Request) {
		m.apiInFlight.Inc()
		defer m.apiInFlight.Dec()

		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		h(rec, r)
		dur := time.Since(start).Seconds()

		m.apiRequests.WithLabelValues(route, r.Method, strconv.Itoa(rec.status)).Inc()
		m.apiRequestDuration.WithLabelValues(route, r.Method).Observe(dur)
		m.apiResponseSize.WithLabelValues(route).Observe(float64(rec.bytes))
	}
}
