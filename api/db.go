package main

import (
	"database/sql"
	"encoding/json"
	"fmt"

	_ "modernc.org/sqlite"
)

// DB persists per-scope counter snapshots to a SQLite file (pure-Go driver, no
// cgo) so cumulative totals and the node/observer gauges survive restarts. One
// row per scope; the periodic flush upserts every scope inside one transaction.
type DB struct {
	db *sql.DB
}

const counterSchema = `
CREATE TABLE IF NOT EXISTS counters (
	scope          TEXT PRIMARY KEY,
	observations   INTEGER NOT NULL DEFAULT 0,
	unique_packets INTEGER NOT NULL DEFAULT 0,
	last_packet_at INTEGER NOT NULL DEFAULT 0,
	payload_types  TEXT    NOT NULL DEFAULT '{}',
	observers      TEXT    NOT NULL DEFAULT '{}',
	nodes          TEXT    NOT NULL DEFAULT '{}',
	updated_at     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS nodes (
	pubkey          TEXT PRIMARY KEY,
	name            TEXT    NOT NULL DEFAULT '',
	node_type       INTEGER NOT NULL DEFAULT 0,
	has_gps         INTEGER NOT NULL DEFAULT 0,
	lat             REAL    NOT NULL DEFAULT 0,
	lon             REAL    NOT NULL DEFAULT 0,
	first_advert_at INTEGER NOT NULL DEFAULT 0,
	last_advert_at  INTEGER NOT NULL DEFAULT 0,
	advert_count    INTEGER NOT NULL DEFAULT 0,
	networks        TEXT    NOT NULL DEFAULT '[]',
	observer_id     TEXT    NOT NULL DEFAULT '',
	observer_name   TEXT    NOT NULL DEFAULT '',
	updated_at      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS adverts (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	hash          TEXT    NOT NULL DEFAULT '',
	raw_hex       TEXT    NOT NULL DEFAULT '',
	pubkey        TEXT    NOT NULL,
	name          TEXT    NOT NULL DEFAULT '',
	node_type     INTEGER NOT NULL DEFAULT 0,
	has_gps       INTEGER NOT NULL DEFAULT 0,
	lat           REAL    NOT NULL DEFAULT 0,
	lon           REAL    NOT NULL DEFAULT 0,
	advert_time   INTEGER NOT NULL DEFAULT 0,
	received_at   INTEGER NOT NULL DEFAULT 0,
	network_id    TEXT    NOT NULL DEFAULT '',
	analyzer_name TEXT    NOT NULL DEFAULT '',
	observer_id   TEXT    NOT NULL DEFAULT '',
	observer_name TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_adverts_pubkey ON adverts(pubkey, id);

CREATE TABLE IF NOT EXISTS observers (
	observer_id  TEXT PRIMARY KEY,
	name         TEXT    NOT NULL DEFAULT '',
	first_seen   INTEGER NOT NULL DEFAULT 0,
	last_seen    INTEGER NOT NULL DEFAULT 0,
	observations INTEGER NOT NULL DEFAULT 0,
	networks     TEXT    NOT NULL DEFAULT '[]',
	updated_at   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS links (
	node_a           TEXT    NOT NULL,
	node_b           TEXT    NOT NULL,
	packet_count     INTEGER NOT NULL DEFAULT 0,
	first_seen       INTEGER NOT NULL DEFAULT 0,
	last_seen        INTEGER NOT NULL DEFAULT 0,
	activity_score   REAL    NOT NULL DEFAULT 0,
	score_updated_at INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (node_a, node_b)
);
-- The PK covers lookups by node_a; this index covers lookups by node_b, so all
-- links touching a selected public key (either endpoint) are found cheaply.
CREATE INDEX IF NOT EXISTS idx_links_node_b ON links(node_b);

CREATE TABLE IF NOT EXISTS link_networks (
	node_a     TEXT    NOT NULL,
	node_b     TEXT    NOT NULL,
	network_id TEXT    NOT NULL,
	first_seen INTEGER NOT NULL DEFAULT 0,
	last_seen  INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (node_a, node_b, network_id)
);

CREATE TABLE IF NOT EXISTS imported_nodes (
	public_key      TEXT PRIMARY KEY,
	type            INTEGER NOT NULL DEFAULT 0,
	adv_name        TEXT    NOT NULL DEFAULT '',
	last_advert     TEXT    NOT NULL DEFAULT '',
	last_advert_at  INTEGER NOT NULL DEFAULT 0,
	adv_lat         REAL    NOT NULL DEFAULT 0,
	adv_lon         REAL    NOT NULL DEFAULT 0,
	inserted_date   TEXT    NOT NULL DEFAULT '',
	updated_date    TEXT    NOT NULL DEFAULT '',
	params          TEXT    NOT NULL DEFAULT '{}',
	link            TEXT    NOT NULL DEFAULT '',
	source          TEXT    NOT NULL DEFAULT '',
	inserted_by     TEXT    NOT NULL DEFAULT '',
	updated_by      TEXT    NOT NULL DEFAULT '',
	synced_at       INTEGER NOT NULL DEFAULT 0
);

-- Append-only history of map.meshcore.io "publishes": every distinct snapshot of
-- a node's published metadata we have ever mirrored. A row is keyed by
-- (public_key, sig) where sig is a content hash over the publish-relevant fields
-- (everything except the frequently-changing last_advert), so re-syncs that only
-- bump last_advert don't create new rows. first_captured_at is when we first saw
-- that snapshot; last_captured_at is the most recent sync that still matched it.
CREATE TABLE IF NOT EXISTS imported_node_history (
	id                INTEGER PRIMARY KEY AUTOINCREMENT,
	public_key        TEXT    NOT NULL,
	sig               TEXT    NOT NULL,
	type              INTEGER NOT NULL DEFAULT 0,
	adv_name          TEXT    NOT NULL DEFAULT '',
	last_advert       TEXT    NOT NULL DEFAULT '',
	last_advert_at    INTEGER NOT NULL DEFAULT 0,
	adv_lat           REAL    NOT NULL DEFAULT 0,
	adv_lon           REAL    NOT NULL DEFAULT 0,
	inserted_date     TEXT    NOT NULL DEFAULT '',
	updated_date      TEXT    NOT NULL DEFAULT '',
	params            TEXT    NOT NULL DEFAULT '{}',
	link              TEXT    NOT NULL DEFAULT '',
	source            TEXT    NOT NULL DEFAULT '',
	inserted_by       TEXT    NOT NULL DEFAULT '',
	updated_by        TEXT    NOT NULL DEFAULT '',
	first_captured_at INTEGER NOT NULL DEFAULT 0,
	last_captured_at  INTEGER NOT NULL DEFAULT 0,
	UNIQUE(public_key, sig)
);
CREATE INDEX IF NOT EXISTS idx_imported_history_pubkey ON imported_node_history(public_key, first_captured_at);`

// OpenDB opens (creating if needed) the SQLite counter store. WAL mode and a
// busy timeout keep the single periodic writer from tripping over readers.
func OpenDB(path string) (*DB, error) {
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	sdb, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	if _, err := sdb.Exec(counterSchema); err != nil {
		_ = sdb.Close()
		return nil, fmt.Errorf("init schema: %w", err)
	}
	if err := ensureColumn(sdb, "adverts", "hash", "TEXT NOT NULL DEFAULT ''"); err != nil {
		_ = sdb.Close()
		return nil, fmt.Errorf("migrate adverts.hash: %w", err)
	}
	if err := ensureColumn(sdb, "adverts", "raw_hex", "TEXT NOT NULL DEFAULT ''"); err != nil {
		_ = sdb.Close()
		return nil, fmt.Errorf("migrate adverts.raw_hex: %w", err)
	}
	if err := ensureColumn(sdb, "adverts", "analyzer_name", "TEXT NOT NULL DEFAULT ''"); err != nil {
		_ = sdb.Close()
		return nil, fmt.Errorf("migrate adverts.analyzer_name: %w", err)
	}
	return &DB{db: sdb}, nil
}

func (d *DB) Close() error { return d.db.Close() }

func ensureColumn(db *sql.DB, table, column, decl string) error {
	rows, err := db.Query(`PRAGMA table_info(` + table + `)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid        int
			name       string
			colType    string
			notNull    int
			defaultVal any
			pk         int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &defaultVal, &pk); err != nil {
			return err
		}
		if name == column {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = db.Exec(`ALTER TABLE ` + table + ` ADD COLUMN ` + column + ` ` + decl)
	return err
}

// Load reads every persisted scope back into memory.
func (d *DB) Load() (map[string]CounterState, error) {
	rows, err := d.db.Query(`SELECT scope, observations, unique_packets, last_packet_at, payload_types, observers, nodes FROM counters`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]CounterState)
	for rows.Next() {
		var (
			scope          string
			pt, obs, nodes string
			st             CounterState
		)
		if err := rows.Scan(&scope, &st.Observations, &st.UniquePackets, &st.LastPacketAt, &pt, &obs, &nodes); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(pt), &st.PayloadTypes)
		_ = json.Unmarshal([]byte(obs), &st.Observers)
		_ = json.Unmarshal([]byte(nodes), &st.Nodes)
		out[scope] = st
	}
	return out, rows.Err()
}

// Save upserts every scope in one transaction.
func (d *DB) Save(states map[string]CounterState, now int64) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO counters (scope, observations, unique_packets, last_packet_at, payload_types, observers, nodes, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(scope) DO UPDATE SET
			observations   = excluded.observations,
			unique_packets = excluded.unique_packets,
			last_packet_at = excluded.last_packet_at,
			payload_types  = excluded.payload_types,
			observers      = excluded.observers,
			nodes          = excluded.nodes,
			updated_at     = excluded.updated_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for scope, st := range states {
		pt, _ := json.Marshal(st.PayloadTypes)
		obs, _ := json.Marshal(st.Observers)
		nodes, _ := json.Marshal(st.Nodes)
		if _, err := stmt.Exec(scope, st.Observations, st.UniquePackets, st.LastPacketAt, string(pt), string(obs), string(nodes), now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}

// LoadNodes reads the persisted node overview rows back into memory. The network
// set is stored as a JSON column; the rolling latest-adverts list is reloaded
// separately from the adverts history (see LoadRecentAdverts).
func (d *DB) LoadNodes() ([]NodeRecord, error) {
	rows, err := d.db.Query(`SELECT pubkey, name, node_type, has_gps, lat, lon, first_advert_at, last_advert_at, advert_count, networks, observer_id, observer_name FROM nodes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []NodeRecord
	for rows.Next() {
		var (
			n        NodeRecord
			hasGPS   int
			networks string
		)
		if err := rows.Scan(&n.PubKey, &n.Name, &n.NodeType, &hasGPS, &n.Lat, &n.Lon, &n.FirstAdvertAt, &n.LastAdvertAt, &n.AdvertCount, &networks, &n.ObserverID, &n.ObserverName); err != nil {
			return nil, err
		}
		n.HasGPS = hasGPS != 0
		_ = json.Unmarshal([]byte(networks), &n.Networks)
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

// SaveNodes upserts every node overview row in one transaction, persisting each
// node's network set as JSON.
func (d *DB) SaveNodes(nodes []NodeRecord, now int64) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO nodes (pubkey, name, node_type, has_gps, lat, lon, first_advert_at, last_advert_at, advert_count, networks, observer_id, observer_name, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(pubkey) DO UPDATE SET
			name            = excluded.name,
			node_type       = excluded.node_type,
			has_gps         = excluded.has_gps,
			lat             = excluded.lat,
			lon             = excluded.lon,
			first_advert_at = excluded.first_advert_at,
			last_advert_at  = excluded.last_advert_at,
			advert_count    = excluded.advert_count,
			networks        = excluded.networks,
			observer_id     = excluded.observer_id,
			observer_name   = excluded.observer_name,
			updated_at      = excluded.updated_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, n := range nodes {
		networks, _ := json.Marshal(n.Networks)
		if _, err := stmt.Exec(n.PubKey, n.Name, n.NodeType, b2i(n.HasGPS), n.Lat, n.Lon, n.FirstAdvertAt, n.LastAdvertAt, n.AdvertCount, string(networks), n.ObserverID, n.ObserverName, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// AppendAdverts inserts adverts into the append-only history table in one
// transaction. The id column orders them by arrival.
func (d *DB) AppendAdverts(adverts []AdvertObservation) error {
	if len(adverts) == 0 {
		return nil
	}
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO adverts (hash, raw_hex, pubkey, name, node_type, has_gps, lat, lon, advert_time, received_at, network_id, analyzer_name, observer_id, observer_name)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, a := range adverts {
		if _, err := stmt.Exec(a.Hash, a.RawHex, a.PubKey, a.Name, a.NodeType, b2i(a.HasGPS), a.Lat, a.Lon, a.AdvertTime, a.At, a.NetworkID, a.AnalyzerName, a.ObserverID, a.ObserverName); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// SaveLinks batch-upserts the given (dirty) link aggregates and their network
// associations in one transaction. Called from the periodic persistence cycle —
// never per packet. The packet_count is the global deduplicated count and is
// written verbatim; first_seen only moves backwards (MIN) so an out-of-order
// flush can't lose the earliest observation.
func (d *DB) SaveLinks(records []LinkRecord, now int64) error {
	if len(records) == 0 {
		return nil
	}
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	linkStmt, err := tx.Prepare(`
		INSERT INTO links (node_a, node_b, packet_count, first_seen, last_seen, activity_score, score_updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(node_a, node_b) DO UPDATE SET
			packet_count     = excluded.packet_count,
			first_seen       = MIN(links.first_seen, excluded.first_seen),
			last_seen        = MAX(links.last_seen, excluded.last_seen),
			activity_score   = excluded.activity_score,
			score_updated_at = excluded.score_updated_at`)
	if err != nil {
		return err
	}
	defer linkStmt.Close()

	netStmt, err := tx.Prepare(`
		INSERT INTO link_networks (node_a, node_b, network_id, first_seen, last_seen)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(node_a, node_b, network_id) DO UPDATE SET
			first_seen = MIN(link_networks.first_seen, excluded.first_seen),
			last_seen  = MAX(link_networks.last_seen, excluded.last_seen)`)
	if err != nil {
		return err
	}
	defer netStmt.Close()

	for _, rec := range records {
		if _, err := linkStmt.Exec(rec.NodeA, rec.NodeB, rec.PacketCount, rec.FirstSeen, rec.LastSeen, rec.Score, rec.ScoreUpdatedAt); err != nil {
			return err
		}
		for _, n := range rec.Networks {
			if _, err := netStmt.Exec(rec.NodeA, rec.NodeB, n.NetworkID, n.FirstSeen, n.LastSeen); err != nil {
				return err
			}
		}
	}
	return tx.Commit()
}

// LoadLinks reads every persisted link aggregate plus its network associations
// back into memory at startup.
func (d *DB) LoadLinks() ([]LinkRecord, error) {
	rows, err := d.db.Query(`SELECT node_a, node_b, packet_count, first_seen, last_seen, activity_score, score_updated_at FROM links`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byPair := make(map[[2]string]*LinkRecord)
	var out []LinkRecord
	for rows.Next() {
		var rec LinkRecord
		if err := rows.Scan(&rec.NodeA, &rec.NodeB, &rec.PacketCount, &rec.FirstSeen, &rec.LastSeen, &rec.Score, &rec.ScoreUpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		byPair[[2]string{out[i].NodeA, out[i].NodeB}] = &out[i]
	}

	nrows, err := d.db.Query(`SELECT node_a, node_b, network_id, first_seen, last_seen FROM link_networks`)
	if err != nil {
		return nil, err
	}
	defer nrows.Close()
	for nrows.Next() {
		var (
			a, b, net string
			ln        linkNetwork
		)
		if err := nrows.Scan(&a, &b, &net, &ln.FirstSeen, &ln.LastSeen); err != nil {
			return nil, err
		}
		ln.NetworkID = net
		if rec := byPair[[2]string{a, b}]; rec != nil {
			rec.Networks = append(rec.Networks, ln)
		}
	}
	return out, nrows.Err()
}

// LoadObservers reads every persisted observer activity row back into memory.
func (d *DB) LoadObservers() ([]ObserverRecord, error) {
	rows, err := d.db.Query(`SELECT observer_id, name, first_seen, last_seen, observations, networks FROM observers`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var observers []ObserverRecord
	for rows.Next() {
		var (
			o        ObserverRecord
			networks string
		)
		if err := rows.Scan(&o.ObserverID, &o.Name, &o.FirstSeen, &o.LastSeen, &o.Observations, &networks); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(networks), &o.Networks)
		observers = append(observers, o)
	}
	return observers, rows.Err()
}

// SaveObservers upserts every observer row in one transaction, persisting each
// observer's network set as JSON.
func (d *DB) SaveObservers(observers []ObserverRecord, now int64) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO observers (observer_id, name, first_seen, last_seen, observations, networks, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(observer_id) DO UPDATE SET
			name         = excluded.name,
			first_seen   = excluded.first_seen,
			last_seen    = excluded.last_seen,
			observations = excluded.observations,
			networks     = excluded.networks,
			updated_at   = excluded.updated_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, o := range observers {
		networks, _ := json.Marshal(o.Networks)
		if _, err := stmt.Exec(o.ObserverID, o.Name, o.FirstSeen, o.LastSeen, o.Observations, string(networks), now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// LoadRecentAdverts returns up to perNode most recent adverts per node (newest
// first), keyed by pubkey, used to repopulate each node's in-memory rolling list
// on startup.
//
// The window function runs over the covering index idx_adverts_pubkey(pubkey,
// id) alone — selecting only `id` so SQLite never touches the multi-hundred-MB
// row data for the 2M+ history rows — then joins back to fetch the columns for
// just the ~perNode×nodes winners. Ordering by id DESC keeps each pubkey's slice
// newest-first. This turns a ~75s full-table window scan into a sub-second load.
func (d *DB) LoadRecentAdverts(perNode int) (map[string][]AdvertObservation, error) {
	rows, err := d.db.Query(`
		SELECT a.hash, a.raw_hex, a.pubkey, a.name, a.node_type, a.has_gps, a.lat, a.lon, a.advert_time, a.received_at, a.network_id, a.analyzer_name, a.observer_id, a.observer_name
		FROM adverts a
		JOIN (
			SELECT id FROM (
				SELECT id, ROW_NUMBER() OVER (PARTITION BY pubkey ORDER BY id DESC) AS rn FROM adverts
			) WHERE rn <= ?
		) recent ON recent.id = a.id
		ORDER BY a.id DESC`, perNode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string][]AdvertObservation)
	for rows.Next() {
		var (
			a      AdvertObservation
			hasGPS int
		)
		if err := rows.Scan(&a.Hash, &a.RawHex, &a.PubKey, &a.Name, &a.NodeType, &hasGPS, &a.Lat, &a.Lon, &a.AdvertTime, &a.At, &a.NetworkID, &a.AnalyzerName, &a.ObserverID, &a.ObserverName); err != nil {
			return nil, err
		}
		a.HasGPS = hasGPS != 0
		out[a.PubKey] = append(out[a.PubKey], a)
	}
	return out, rows.Err()
}

// AdvertsForNode returns one node's adverts from the append-only history table,
// newest first, for the directory's per-node advert history. It pages with a
// keyset cursor: when before > 0 only adverts with a smaller row id are returned,
// so the caller fetches older pages by passing back the nextBefore it received.
// nextBefore is the smallest id in the returned batch (0 when none), suitable as
// the cursor for the next page; it is only meaningful when len(out) == limit.
func (d *DB) AdvertsForNode(pubkey string, limit int, before int64) (out []AdvertObservation, nextBefore int64, err error) {
	q := `SELECT id, hash, raw_hex, pubkey, name, node_type, has_gps, lat, lon, advert_time, received_at, network_id, analyzer_name, observer_id, observer_name
		FROM adverts WHERE pubkey = ?`
	args := []any{pubkey}
	if before > 0 {
		q += ` AND id < ?`
		args = append(args, before)
	}
	q += ` ORDER BY id DESC LIMIT ?`
	args = append(args, limit)

	rows, err := d.db.Query(q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id     int64
			a      AdvertObservation
			hasGPS int
		)
		if err := rows.Scan(&id, &a.Hash, &a.RawHex, &a.PubKey, &a.Name, &a.NodeType, &hasGPS, &a.Lat, &a.Lon, &a.AdvertTime, &a.At, &a.NetworkID, &a.AnalyzerName, &a.ObserverID, &a.ObserverName); err != nil {
			return nil, 0, err
		}
		a.HasGPS = hasGPS != 0
		out = append(out, a)
		nextBefore = id // rows are id-descending, so the last scanned id is the smallest
	}
	return out, nextBefore, rows.Err()
}

// NetworkAdvertStat is one node's advert activity on a single network.
type NetworkAdvertStat struct {
	NetworkID string `json:"networkId"`
	Adverts   int64  `json:"adverts"`
	FirstAt   int64  `json:"firstAt"`
	LastAt    int64  `json:"lastAt"`
}

// DailyAdvertStat is one UTC day of advert activity for a node.
type DailyAdvertStat struct {
	Day     int64 `json:"day"`
	Adverts int64 `json:"adverts"`
}

// NetworkAdvertStatsForNode aggregates one node's adverts per network from the
// history table: how many adverts, and the first/last time one arrived on each
// network. Ordered most-recently-active first.
func (d *DB) NetworkAdvertStatsForNode(pubkey string) ([]NetworkAdvertStat, error) {
	rows, err := d.db.Query(`
		SELECT network_id, COUNT(*), MIN(received_at), MAX(received_at)
		FROM adverts WHERE pubkey = ?
		GROUP BY network_id
		ORDER BY MAX(received_at) DESC`, pubkey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []NetworkAdvertStat
	for rows.Next() {
		var s NetworkAdvertStat
		if err := rows.Scan(&s.NetworkID, &s.Adverts, &s.FirstAt, &s.LastAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// DailyAdvertStatsForNode aggregates one node's advert counts per UTC day.
func (d *DB) DailyAdvertStatsForNode(pubkey string, since int64) ([]DailyAdvertStat, error) {
	rows, err := d.db.Query(`
		SELECT (received_at / 86400) * 86400 AS day, COUNT(*)
		FROM adverts
		WHERE pubkey = ? AND received_at >= ?
		GROUP BY day
		ORDER BY day ASC`, pubkey, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []DailyAdvertStat
	for rows.Next() {
		var s DailyAdvertStat
		if err := rows.Scan(&s.Day, &s.Adverts); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// SaveImportedNodes mirrors the external directory into the imported_nodes table
// in one transaction, upserting every node by public key. This table is kept
// entirely separate from the live `nodes` registry.
func (d *DB) SaveImportedNodes(nodes []*ImportedNode, now int64) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO imported_nodes (public_key, type, adv_name, last_advert, last_advert_at, adv_lat, adv_lon, inserted_date, updated_date, params, link, source, inserted_by, updated_by, synced_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(public_key) DO UPDATE SET
			type           = excluded.type,
			adv_name       = excluded.adv_name,
			last_advert    = excluded.last_advert,
			last_advert_at = excluded.last_advert_at,
			adv_lat        = excluded.adv_lat,
			adv_lon        = excluded.adv_lon,
			inserted_date  = excluded.inserted_date,
			updated_date   = excluded.updated_date,
			params         = excluded.params,
			link           = excluded.link,
			source         = excluded.source,
			inserted_by    = excluded.inserted_by,
			updated_by     = excluded.updated_by,
			synced_at      = excluded.synced_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, n := range nodes {
		if n.PublicKey == "" {
			continue
		}
		params := string(n.Params)
		if params == "" {
			params = "{}"
		}
		if _, err := stmt.Exec(n.PublicKey, n.Type, n.AdvName, n.LastAdvert, n.lastAdvertUnix(), n.AdvLat, n.AdvLon, n.InsertedDate, n.UpdatedDate, params, n.Link, n.Source, n.InsertedBy, n.UpdatedBy, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// LoadImportedNodes reads the mirrored directory back into memory so the map has
// data immediately on startup, before the first sync completes.
func (d *DB) LoadImportedNodes() ([]*ImportedNode, error) {
	rows, err := d.db.Query(`SELECT public_key, type, adv_name, last_advert, adv_lat, adv_lon, inserted_date, updated_date, params, link, source, inserted_by, updated_by FROM imported_nodes`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nodes []*ImportedNode
	for rows.Next() {
		var (
			n      ImportedNode
			params string
		)
		if err := rows.Scan(&n.PublicKey, &n.Type, &n.AdvName, &n.LastAdvert, &n.AdvLat, &n.AdvLon, &n.InsertedDate, &n.UpdatedDate, &params, &n.Link, &n.Source, &n.InsertedBy, &n.UpdatedBy); err != nil {
			return nil, err
		}
		n.Params = json.RawMessage(params)
		n.cacheDerived()
		nodes = append(nodes, &n)
	}
	return nodes, rows.Err()
}

// SaveImportedNodeHistory appends a history row for every node whose current
// snapshot we have not recorded before, in one transaction. Dedup is by
// (public_key, sig): a snapshot already on file just has its last_captured_at
// (and last_advert) refreshed, so the table grows only when a node is actually
// re-published with changed metadata.
func (d *DB) SaveImportedNodeHistory(nodes []*ImportedNode, now int64) error {
	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`
		INSERT INTO imported_node_history (public_key, sig, type, adv_name, last_advert, last_advert_at, adv_lat, adv_lon, inserted_date, updated_date, params, link, source, inserted_by, updated_by, first_captured_at, last_captured_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(public_key, sig) DO UPDATE SET
			last_advert      = excluded.last_advert,
			last_advert_at   = excluded.last_advert_at,
			last_captured_at = excluded.last_captured_at`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, n := range nodes {
		if n.PublicKey == "" {
			continue
		}
		params := string(n.Params)
		if params == "" {
			params = "{}"
		}
		if _, err := stmt.Exec(n.PublicKey, n.historySig(), n.Type, n.AdvName, n.LastAdvert, n.lastAdvertUnix(), n.AdvLat, n.AdvLon, n.InsertedDate, n.UpdatedDate, params, n.Link, n.Source, n.InsertedBy, n.UpdatedBy, now, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// ImportedNodeHistory returns every captured publish for one node, newest
// publish first (by when we first captured it).
func (d *DB) ImportedNodeHistory(pubkey string) ([]ImportedSnapshot, error) {
	rows, err := d.db.Query(`
		SELECT type, adv_name, last_advert, last_advert_at, adv_lat, adv_lon, inserted_date, updated_date, params, link, source, inserted_by, updated_by, first_captured_at, last_captured_at
		FROM imported_node_history
		WHERE public_key = ?
		ORDER BY first_captured_at DESC, id DESC`, pubkey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ImportedSnapshot
	for rows.Next() {
		var (
			s      ImportedSnapshot
			params string
		)
		if err := rows.Scan(&s.Type, &s.AdvName, &s.LastAdvert, &s.LastAdvertAt, &s.AdvLat, &s.AdvLon, &s.InsertedDate, &s.UpdatedDate, &params, &s.Link, &s.Source, &s.InsertedBy, &s.UpdatedBy, &s.FirstCapturedAt, &s.LastCapturedAt); err != nil {
			return nil, err
		}
		if params != "" && params != "{}" {
			s.Params = json.RawMessage(params)
		}
		s.TypeName = nodeTypeName(byte(s.Type))
		s.HasGPS = s.AdvLat != 0 || s.AdvLon != 0
		out = append(out, s)
	}
	return out, rows.Err()
}
