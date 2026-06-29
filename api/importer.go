package main

import (
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// defaultImportURL is the public MeshCore node directory map.meshcore.io
// publishes (~50k manually-submitted / one-time-scanned nodes). We mirror it
// hourly into our own table so those nodes can be shown on the map alongside —
// but kept strictly separate from — our own live-observed nodes.
const defaultImportURL = "https://map.meshcore.io/api/v1/nodes?binary=0&short=0"

// ImportedNode is one node from the external map.meshcore.io directory, stored
// verbatim with every field the upstream API exposes. It is intentionally a
// distinct type from NodeRecord: this data is third-party and of unknown
// quality, so it never flows into the live node registry.
type ImportedNode struct {
	PublicKey    string          `json:"public_key"`
	Type         int             `json:"type"`
	AdvName      string          `json:"adv_name"`
	LastAdvert   string          `json:"last_advert"`
	AdvLat       float64         `json:"adv_lat"`
	AdvLon       float64         `json:"adv_lon"`
	InsertedDate string          `json:"inserted_date"`
	UpdatedDate  string          `json:"updated_date"`
	Params       json.RawMessage `json:"params"`
	Link         string          `json:"link"`
	Source       string          `json:"source"`
	InsertedBy   string          `json:"inserted_by"`
	UpdatedBy    string          `json:"updated_by"`

	lastAt int64 // last_advert parsed to unix seconds, precomputed by cacheDerived
}

// cacheDerived parses last_advert into unix seconds once, on the single build
// goroutine, so the shared snapshot can be read concurrently without a data race.
func (n *ImportedNode) cacheDerived() {
	n.lastAt = 0
	if n.LastAdvert == "" {
		return
	}
	if t, err := time.Parse(time.RFC3339, n.LastAdvert); err == nil {
		n.lastAt = t.Unix()
	}
}

// lastAdvertUnix returns last_advert as unix seconds (precomputed; 0 if absent).
func (n *ImportedNode) lastAdvertUnix() int64 { return n.lastAt }

// historySig is a content hash over the publish-relevant fields of a node — name,
// type, location, link, source, who submitted/updated it and when. last_advert is
// deliberately excluded: it moves on almost every sync and does not represent a
// new "publish". Two snapshots with the same sig are the same publish.
func (n *ImportedNode) historySig() string {
	h := sha256.New()
	fmt.Fprintf(h, "%d\x1f%s\x1f%.6f\x1f%.6f\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s",
		n.Type, n.AdvName, n.AdvLat, n.AdvLon, n.InsertedDate, n.UpdatedDate,
		n.Link, n.Source, n.InsertedBy, n.UpdatedBy)
	h.Write(n.Params)
	return hex.EncodeToString(h.Sum(nil))
}

// ImportedSnapshot is one captured map.meshcore.io publish, as served by the
// per-node "map publishes" endpoint. It mirrors an ImportedNode row plus the
// capture timestamps that bound when we observed that exact snapshot.
type ImportedSnapshot struct {
	Type            int             `json:"type"`
	TypeName        string          `json:"typeName"`
	AdvName         string          `json:"advName"`
	LastAdvert      string          `json:"lastAdvert,omitempty"`
	LastAdvertAt    int64           `json:"lastAdvertAt"`
	AdvLat          float64         `json:"advLat,omitempty"`
	AdvLon          float64         `json:"advLon,omitempty"`
	HasGPS          bool            `json:"hasGps"`
	InsertedDate    string          `json:"insertedDate,omitempty"`
	UpdatedDate     string          `json:"updatedDate,omitempty"`
	Params          json.RawMessage `json:"params,omitempty"`
	Link            string          `json:"link,omitempty"`
	Source          string          `json:"source,omitempty"`
	InsertedBy      string          `json:"insertedBy,omitempty"`
	UpdatedBy       string          `json:"updatedBy,omitempty"`
	FirstCapturedAt int64           `json:"firstCapturedAt"`
	LastCapturedAt  int64           `json:"lastCapturedAt"`
}

// snapshot renders the node's current in-memory record as an ImportedSnapshot,
// used as a fallback when the durable history table is unavailable.
func (n *ImportedNode) snapshot() ImportedSnapshot {
	return ImportedSnapshot{
		Type:         n.Type,
		TypeName:     nodeTypeName(byte(n.Type)),
		AdvName:      n.AdvName,
		LastAdvert:   n.LastAdvert,
		LastAdvertAt: n.lastAdvertUnix(),
		AdvLat:       n.AdvLat,
		AdvLon:       n.AdvLon,
		HasGPS:       n.hasCoords(),
		InsertedDate: n.InsertedDate,
		UpdatedDate:  n.UpdatedDate,
		Params:       n.Params,
		Link:         n.Link,
		Source:       n.Source,
		InsertedBy:   n.InsertedBy,
		UpdatedBy:    n.UpdatedBy,
	}
}

// ImportRegistry holds the latest mirror of the external node directory. The
// record slice is replaced wholesale on each successful sync (copy-on-write), so
// a reader that captured the previous slice keeps a consistent view without
// holding the lock during a map scan.
type ImportRegistry struct {
	mu      sync.Mutex
	records []*ImportedNode
}

func newImportRegistry() *ImportRegistry {
	return &ImportRegistry{records: []*ImportedNode{}}
}

// Replace swaps in a freshly built record set.
func (ir *ImportRegistry) Replace(records []*ImportedNode) {
	ir.mu.Lock()
	ir.records = records
	ir.mu.Unlock()
}

// Records returns the current snapshot slice. The slice is never mutated in
// place (Replace builds a new one), so callers may read it lock-free afterwards.
func (ir *ImportRegistry) Records() []*ImportedNode {
	ir.mu.Lock()
	defer ir.mu.Unlock()
	return ir.records
}

func (ir *ImportRegistry) Len() int {
	ir.mu.Lock()
	defer ir.mu.Unlock()
	return len(ir.records)
}

// ForPubKey returns the current imported record(s) for one public key. Upstream
// keys nodes uniquely, so this is normally zero or one, but the feed is
// third-party so duplicates are returned as-is rather than silently collapsed.
func (ir *ImportRegistry) ForPubKey(pubkey string) []*ImportedNode {
	ir.mu.Lock()
	records := ir.records
	ir.mu.Unlock()
	var out []*ImportedNode
	for _, n := range records {
		if n.PublicKey == pubkey {
			out = append(out, n)
		}
	}
	return out
}

// Has reports whether the imported directory currently contains this public key.
func (ir *ImportRegistry) Has(pubkey string) bool {
	ir.mu.Lock()
	records := ir.records
	ir.mu.Unlock()
	for _, n := range records {
		if n.PublicKey == pubkey {
			return true
		}
	}
	return false
}

// Importer periodically fetches the external directory and refreshes the
// registry plus, when configured, the durable mirror table.
type Importer struct {
	url      string
	interval time.Duration
	registry *ImportRegistry
	db       *DB
	client   *http.Client
}

func newImporter(url string, interval time.Duration, registry *ImportRegistry, db *DB) *Importer {
	return &Importer{
		url:      url,
		interval: interval,
		registry: registry,
		db:       db,
		client:   &http.Client{Timeout: 120 * time.Second},
	}
}

// Run syncs once immediately, then on the configured interval until ctx ends.
func (im *Importer) Run(ctx context.Context) {
	if err := im.syncOnce(ctx); err != nil && ctx.Err() == nil {
		log.Printf("[import] initial sync: %v", err)
	}
	ticker := time.NewTicker(im.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := im.syncOnce(ctx); err != nil && ctx.Err() == nil {
				log.Printf("[import] sync: %v", err)
			}
		}
	}
}

// syncOnce fetches the directory, rebuilds the in-memory registry, and persists
// the mirror table.
func (im *Importer) syncOnce(ctx context.Context) error {
	records, err := im.fetch(ctx)
	if err != nil {
		return err
	}
	im.registry.Replace(records)
	log.Printf("[import] synced %d node(s) from %s", len(records), im.url)
	if im.db != nil {
		now := nowUnix()
		if err := im.db.SaveImportedNodes(records, now); err != nil {
			return fmt.Errorf("persisting imported nodes: %w", err)
		}
		if err := im.db.SaveImportedNodeHistory(records, now); err != nil {
			return fmt.Errorf("persisting imported node history: %w", err)
		}
	}
	return nil
}

// fetch downloads and decodes the directory, requesting gzip explicitly and
// decompressing the response ourselves.
func (im *Importer) fetch(ctx context.Context) ([]*ImportedNode, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, im.url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("User-Agent", browserUA)
	req.Header.Set("Accept", "application/json")

	resp, err := im.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	var body io.Reader = resp.Body
	// We set Accept-Encoding manually, so Go's transport won't auto-decompress.
	if resp.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("gzip: %w", err)
		}
		defer gz.Close()
		body = gz
	}

	var nodes []*ImportedNode
	if err := json.NewDecoder(body).Decode(&nodes); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}
	for _, n := range nodes {
		n.cacheDerived()
	}
	return nodes, nil
}
