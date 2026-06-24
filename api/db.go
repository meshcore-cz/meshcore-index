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
	pubkey        TEXT    NOT NULL,
	name          TEXT    NOT NULL DEFAULT '',
	node_type     INTEGER NOT NULL DEFAULT 0,
	has_gps       INTEGER NOT NULL DEFAULT 0,
	lat           REAL    NOT NULL DEFAULT 0,
	lon           REAL    NOT NULL DEFAULT 0,
	advert_time   INTEGER NOT NULL DEFAULT 0,
	received_at   INTEGER NOT NULL DEFAULT 0,
	network_id    TEXT    NOT NULL DEFAULT '',
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
);`

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
	return &DB{db: sdb}, nil
}

func (d *DB) Close() error { return d.db.Close() }

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
		INSERT INTO adverts (pubkey, name, node_type, has_gps, lat, lon, advert_time, received_at, network_id, observer_id, observer_name)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, a := range adverts {
		if _, err := stmt.Exec(a.PubKey, a.Name, a.NodeType, b2i(a.HasGPS), a.Lat, a.Lon, a.AdvertTime, a.At, a.NetworkID, a.ObserverID, a.ObserverName); err != nil {
			return err
		}
	}
	return tx.Commit()
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
		SELECT a.pubkey, a.name, a.node_type, a.has_gps, a.lat, a.lon, a.advert_time, a.received_at, a.network_id, a.observer_id, a.observer_name
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
		if err := rows.Scan(&a.PubKey, &a.Name, &a.NodeType, &hasGPS, &a.Lat, &a.Lon, &a.AdvertTime, &a.At, &a.NetworkID, &a.ObserverID, &a.ObserverName); err != nil {
			return nil, err
		}
		a.HasGPS = hasGPS != 0
		out[a.PubKey] = append(out[a.PubKey], a)
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
