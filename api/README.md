# MeshCore Ninja API

A small Go service that connects to every [CoreScope](https://github.com/Kpa-clawbot/CoreScope)
analyzer declared in the repo's `data/networks/*/network.yaml` files, counts
live mesh activity, and serves rollups over a read-only REST API the frontend
polls.

## What it measures

For each analyzer (and aggregated per network, deduplicated across a network's
analyzers):

- **Unique packets** — distinct MeshCore packets, deduplicated by CoreScope
  content hash (route-independent; the same packet seen via different paths or
  by different observers counts once).
- **Observations** — distinct `(observer, content hash)` pairs, so a single
  observer hearing the same flooded packet across multiple relays — or several
  observers on one network reporting it — isn't double counted.
- **Observers** — distinct observer nodes seen.
- **Nodes** — distinct mesh nodes seen recently, by public key: every node on a
  packet's resolved path (sender + relays) plus the observers themselves. Aged
  out by the same TTL as observers, so it's a "nodes active recently" gauge.
- **pkt/m** — unique packets seen in the trailing 60-second window (packets per
  minute).
- **Payload-type breakdown** — unique packets per type (`ADVERT`, `TXT_MSG`,
  `PATH`, …), named via [`meshpkt`](https://github.com/meshcore-cz/meshpkt).
- **Connection status** — per analyzer, plus connected/total counts per network.

It reads the live stream from each analyzer's WebSocket (`{"type":"packet",…}`
frames) and uses the analyzer-provided content `hash` as the dedup key.

### Nodes & adverts

ADVERT packets carry node identity. For each one the service decodes the wire
bytes (`raw_hex`) with `meshpkt` to recover the node's public key, name, type
(chat/repeater/room/sensor), and GPS location, then maintains a **global**
(cross-network) registry:

- **Node registry** — one permanent row per node, keyed by public key. The first
  advert inserts it; every later advert refreshes the name/type/location and
  advances `lastAdvertAt` and `advertCount`. Rows are never aged out — it's a
  durable node directory.
- **Networks** — each node carries the set of networks it has been heard on. The
  same node can be observed on more than one network, so this is a growing enum,
  not a single value.
- **Latest adverts** — each node keeps its own rolling list of its most recent 10
  adverts (newest first), each entry tagged with the network and observer that
  reported it. This list is served by the API and is reloaded on startup from the
  history table below.

The node overview is kept in memory and flushed to SQLite (one `nodes` row per
node, with the network set as a JSON column) on the same `--persist-interval` as
the counters. In addition, **every** advert is appended to a separate, append-only
`adverts` history table (one row per advert, ordered by arrival `id`), so the full
advert history is available in SQL for analytics — not just the last 10 per node.
On startup the per-node rolling list is repopulated from this table.

### Observers

Separately, the service tracks the **latest activity of each observer** (the mesh
node that reported a packet to an analyzer). Every observed packet upserts a
global `observers` row, keyed by observer id, carrying its name, first/last
activity, a running report count, and the set of networks it has reported on.
Observers are never aged out here — unlike the per-scope observer gauge, this is a
durable activity log. It flushes to SQLite on its own shorter interval
(`--observer-persist-interval`, default `12s`) so "latest activity" stays close to
real time.

## Run

```bash
cd api
go run . --data ../data --addr :8080
```

Or run the published container image:

```bash
docker run --rm -p 8080:8080 -v meshcore-ninja-api:/app/state \
  ghcr.io/meshcore-cz/meshcore-ninja-api:latest
```

The image bakes in the repo `data/` tree at `/app/data`, listens on `:8080`,
and stores SQLite state at `/app/state/meshcore.db` by default. Override the
command arguments to use a mounted data directory or different flags.

Flags:

| flag | default | meaning |
|------|---------|---------|
| `--addr` | `:8080` | HTTP listen address |
| `--data` | `../data` | path to the repo's `data/` directory |
| `--allow-origin` | `*` | `Access-Control-Allow-Origin` value |
| `--dedup-window` | `15m` | how long a content hash counts as already-seen |
| `--observer-ttl` | `1h` | drop observers/nodes idle longer than this |
| `--db` | `meshcore.db` | SQLite file for persisting counters across restarts; empty = in-memory only |
| `--persist-interval` | `20s` | how often to flush counters/nodes to `--db` |
| `--observer-persist-interval` | `12s` | how often to flush observer activity to `--db` |
| `--import-url` | `https://map.meshcore.io/api/v1/nodes?binary=0&short=0` | external node directory to mirror; empty disables |
| `--import-interval` | `1h` | how often to sync the external node directory |

Dedup/observer/node maps are swept every minute to stay bounded. Analyzer
connections reconnect with exponential backoff (1s→30s); non-CoreScope or
unreachable URLs are retried harmlessly.

### Persistence

Counters persist to `meshcore.db` by default, using the pure-Go
[`modernc.org/sqlite`](https://modernc.org/sqlite) driver (no cgo). Every
`--persist-interval` (and once on shutdown) each scope's durable state —
cumulative totals, payload-type breakdown, and the node/observer sets — is
upserted as one row per scope, so totals and gauges continue across restarts.
The short-lived dedup maps and the pkt/m rate window are not persisted; they
rebuild on their own within their windows. Pass `--db ""` to disable persistence
and keep counters in-memory only.

## Endpoints

- `GET /api/health` — `{ok, networks, analyzers, analyzersConnected, time}`
- `GET /api/networks` — `{networks: [networkSummary]}` — used by the Networks list.
- `GET /api/networks/{id}` — network detail with `payloadTypes` and a per-analyzer
  breakdown — used by the network detail page.
- `GET /api/nodes` — `{nodes: [nodeView]}` — the global node registry, newest
  advert first. Each node carries its `networks` set and its own rolling
  `latestAdverts` list.
- `GET /api/observers` — `{observers: [observerView]}` — the global observer
  activity table, most recently active first. Each entry has `observerId`, `name`,
  `firstSeen`, `lastSeen`, `observations`, and `networks`.
- `GET /api/map` — a GeoJSON `FeatureCollection` for one map viewport, powering
  [map.meshcore.ninja](https://map.meshcore.ninja). It aggregates dense areas into
  **cluster** features at low zoom and returns **individual node** features when
  searching or zoomed in (`zoom >= 10`), so the client only ever loads what the
  current viewport needs. Served with `Cache-Control: public, max-age=30`.

`GET /api/map` query params (all optional):

| param | example | meaning |
|-------|---------|---------|
| `bbox` | `-25,34,45,72` | viewport `west,south,east,north` in degrees (ignored when `q` is set) |
| `zoom` | `5` | map zoom level; controls cluster granularity and the cluster→node cutoff |
| `types` | `1,2,3,4` | node types to include — `1`=chat, `2`=repeater, `3`=room, `4`=sensor |
| `networks` | `meshcore-cz,eu-uk-narrow` | network IDs to include |
| `active` | `24h` \| `7d` \| `30d` | keep only nodes whose last advert is within the window |
| `since` | `1782000000` | same, as an explicit unix-seconds threshold (overrides `active`) |
| `q` | `repeater` | name substring (case-insensitive) or pubkey hex prefix; searches globally and returns individual nodes |
| `limit` | `3000` | cap on individual node features returned |

Each feature is a GeoJSON `Point`. **Cluster** features carry
`{cluster: true, count, dominantType, types: {repeater: n, …}, bbox}` (the `bbox`
lets the client zoom to the cluster's extent on click). **Node** features carry
`{cluster: false, pubkey, name, type, typeName, lastAdvertAt, advertCount, networks}`.
The collection also reports `zoom`, `returned`, and `capped` (true when `limit`
truncated the result).

### Imported nodes (external directory mirror)

Separately from the live-observed registry, the service mirrors the public
[map.meshcore.io](https://map.meshcore.io) node directory (~50k
manually-submitted / scanned nodes) every `--import-interval` into its own
`imported_nodes` SQLite table, storing every upstream field verbatim
(`public_key`, `type`, `adv_name`, `last_advert`, `adv_lat`/`adv_lon`, `params`,
`link`, `source`, `inserted_by`/`updated_by`, …). This third-party data is kept
**strictly separate** from the live `nodes` registry — it never feeds the
counters, observers, or advert history.

These nodes are merged into `/api/map` results, tagged `imported: true` (with the
upstream `source`) so the frontend can render them at reduced opacity and toggle
them off. They are deduped against the live registry by public key — a
live-observed node always wins — and null-island (`0,0`) entries are dropped. The
mirror is restored from `--db` on startup so the map has data before the first
sync completes; pass `--import-url ""` to disable the mirror entirely.

`networkSummary`:

```json
{
  "id": "meshcore-cz", "name": "Czech Republic",
  "pktPerMin": 6, "uniquePackets": 6, "observations": 58, "observers": 26,
  "nodes": 74, "analyzersTotal": 3, "analyzersConnected": 2, "lastPacketAt": 1782057222
}
```

`lastPacketAt` / `connectedSince` are unix seconds (0 = never).

`nodeView` (from `/api/nodes`):

```json
{
  "pubkey": "a1b2…", "name": "Repeater One", "type": 2, "typeName": "repeater",
  "hasGps": true, "lat": 50.1, "lon": 14.4,
  "firstAdvertAt": 1782000000, "lastAdvertAt": 1782057222,
  "advertCount": 12, "networks": ["meshcore-cz", "eu-uk-narrow"],
  "observerName": "Observer One",
  "latestAdverts": [
    {
      "name": "Repeater One", "type": 2, "typeName": "repeater",
      "hasGps": true, "lat": 50.1, "lon": 14.4,
      "advertTime": 1782057200, "at": 1782057222,
      "networkId": "meshcore-cz", "observerName": "Observer One"
    }
  ]
}
```

Each `latestAdverts` entry is one advert for that node (newest first, capped at
10), where `advertTime` is the advert's own broadcast timestamp and `at` is when
we received it.

## Metrics (Prometheus / VictoriaMetrics)

The service exposes operational telemetry in Prometheus text exposition format at:

- `GET /metrics`

It scrapes identically under VictoriaMetrics (`vmagent`/`vmscrape`) — no
Prometheus server required. The endpoint reports the **health of the collector
and the API itself**, not individual packets, so labels are deliberately
low-cardinality: per-packet identifiers (pubkey, content hash, observer id,
packet id, resolved path) are never used as labels.

Service metrics:

| metric | type | labels | meaning |
|--------|------|--------|---------|
| `meshcore_packets_received_total` | counter | `network`, `payload_type` | packets received from analyzers (pre-dedup) |
| `meshcore_observations_total` | counter | `network` | packet observations processed |
| `meshcore_packets_decode_errors_total` | counter | `reason` | packets dropped as undecodable (`envelope_json`, `packet_json`, `empty_hash`, `advert_hex`, `advert_packet`, `advert_payload`) |
| `meshcore_analyzer_connected` | gauge | `network`, `analyzer` | analyzer WebSocket connected (1) / not (0) |
| `meshcore_analyzer_reconnects_total` | counter | `network`, `analyzer` | times the connection was (re)established |
| `meshcore_analyzer_last_packet_timestamp_seconds` | gauge | `network`, `analyzer` | unix time of the last packet from the analyzer |
| `meshcore_db_flush_duration_seconds` | histogram | `op` | SQLite flush latency (`counters`, `nodes`, `adverts`, `links`, `observers`) |
| `meshcore_db_flush_errors_total` | counter | `op` | SQLite flush errors |
| `meshcore_db_rows_written_total` | counter | `op` | rows written to SQLite |
| `meshcore_api_requests_total` | counter | `route`, `method`, `code` | HTTP API requests by normalized route and status |
| `meshcore_api_request_duration_seconds` | histogram | `route`, `method` | HTTP API request latency |
| `meshcore_api_response_size_bytes` | histogram | `route` | HTTP API response body size (uncompressed) |
| `meshcore_api_requests_in_flight` | gauge | — | API requests currently in flight |
| `meshcore_build_info` | gauge | `version` | constant `1`, build version marker |

The `route` label is the normalized path template (e.g. `/api/networks/:id`,
`/api/nodes/:pubkey`), never the raw request path, so path variables can't
explode cardinality. The `/metrics` endpoint itself is not instrumented, so a
scraper polling it does not pollute the API latency histograms.

The standard Go runtime and process collectors are also registered, so you get
`go_*` (goroutines, GC, heap) and `process_*` (CPU, RSS, open FDs) for free.

Example scrape config (Prometheus or VictoriaMetrics `vmagent`):

```yaml
scrape_configs:
  - job_name: meshcore-ninja-api
    static_configs:
      - targets: ["localhost:8080"]
```

The `version` label can be stamped at build time:

```bash
go build -ldflags "-X main.version=$(git describe --tags --always)" -o bin/meshcore-ninja-api .
```

## Frontend wiring

The static site polls this API when `PUBLIC_API_BASE` is set (e.g.
`PUBLIC_API_BASE=http://localhost:8080`). When unset, live metrics are hidden
and the site behaves exactly as before.
