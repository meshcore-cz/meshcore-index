package main

import (
	"sort"
	"sync"
)

// nodeTypeName maps an ADVERT node-type nibble to its human name. Mirrors the
// meshpkt AdvertNode* constants.
func nodeTypeName(t byte) string {
	switch t {
	case 1:
		return "chat"
	case 2:
		return "repeater"
	case 3:
		return "room"
	case 4:
		return "sensor"
	default:
		return "unknown"
	}
}

// AdvertObservation is one decoded ADVERT packet seen on the mesh. It upserts the
// node's overview row and is pushed onto that node's rolling latest-adverts list.
type AdvertObservation struct {
	Hash         string  // content hash of the advert packet (for live-feed dedup)
	PubKey       string  // 32-byte Ed25519 public key, lowercase hex
	Name         string  // advertised node name ("" if not advertised)
	NodeType     byte    // 0=unknown,1=chat,2=repeater,3=room,4=sensor
	HasGPS       bool    // true when Lat/Lon are valid
	Lat, Lon     float64 // GPS coordinates in degrees (valid when HasGPS)
	AdvertTime   int64   // the advert's own broadcast timestamp (unix seconds)
	At           int64   // when we received it (unix seconds)
	NetworkID    string  // network the advert was heard on
	ObserverID   string  // observer that reported it
	ObserverName string
}

// NodeRecord is the durable overview row for one mesh node, keyed by pubkey. It
// accumulates across adverts: identity/location are refreshed on every new
// advert, counts and last-seen advance, the set of networks it has been heard on
// grows, and the row is never aged out. Each node keeps its own rolling list of
// the most recent adverts.
type NodeRecord struct {
	PubKey        string
	Name          string
	NodeType      byte
	HasGPS        bool
	Lat, Lon      float64
	FirstAdvertAt int64
	LastAdvertAt  int64
	AdvertCount   uint64
	Networks      []string            // set of network IDs the node was heard on, first-seen order
	ObserverID    string              // observer of the most recent advert
	ObserverName  string              // observer of the most recent advert
	LatestAdverts []AdvertObservation // this node's most recent adverts, newest first, capped
}

// defaultAdvertsPerNode is how many recent adverts each node keeps.
const defaultAdvertsPerNode = 10

// NodeRegistry is the global (cross-network) store of mesh nodes seen via ADVERT
// packets. The node overview and each node's rolling latest-adverts list are
// kept in memory; every advert is also buffered in `pending` so the periodic
// flush can append it to the durable, append-only adverts history. Safe for
// concurrent use.
type NodeRegistry struct {
	mu         sync.Mutex
	nodes      map[string]*NodeRecord
	pending    []AdvertObservation // adverts observed but not yet persisted
	maxAdverts int                 // per-node rolling advert cap
	onAdvert   func(LiveAdvert)    // optional live-feed hook, invoked outside the lock
}

// SetAdvertHook registers a callback fired once per observed advert (after the
// registry is updated, outside the lock). Used to fan adverts out to the live
// WebSocket. Pass nil to disable.
func (r *NodeRegistry) SetAdvertHook(fn func(LiveAdvert)) {
	r.mu.Lock()
	r.onAdvert = fn
	r.mu.Unlock()
}

func newNodeRegistry(maxAdverts int) *NodeRegistry {
	if maxAdverts <= 0 {
		maxAdverts = defaultAdvertsPerNode
	}
	return &NodeRegistry{
		nodes:      make(map[string]*NodeRecord),
		maxAdverts: maxAdverts,
	}
}

func containsStr(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}

// Observe upserts the node's overview row, records the network it was heard on,
// and pushes the advert onto the node's rolling latest list (trimming to the cap).
func (r *NodeRegistry) Observe(a AdvertObservation) {
	if a.PubKey == "" {
		return
	}
	r.mu.Lock()

	n := r.nodes[a.PubKey]
	isNew := n == nil
	if n == nil {
		n = &NodeRecord{PubKey: a.PubKey, FirstAdvertAt: a.At}
		r.nodes[a.PubKey] = n
	}
	if a.Name != "" {
		n.Name = a.Name
	}
	n.NodeType = a.NodeType
	if a.HasGPS {
		n.HasGPS = true
		n.Lat = a.Lat
		n.Lon = a.Lon
	}
	n.LastAdvertAt = a.At
	n.AdvertCount++
	n.ObserverID = a.ObserverID
	n.ObserverName = a.ObserverName
	if a.NetworkID != "" && !containsStr(n.Networks, a.NetworkID) {
		n.Networks = append(n.Networks, a.NetworkID)
	}

	// Rolling per-node advert list, newest first.
	n.LatestAdverts = append(n.LatestAdverts, AdvertObservation{})
	copy(n.LatestAdverts[1:], n.LatestAdverts)
	n.LatestAdverts[0] = a
	if len(n.LatestAdverts) > r.maxAdverts {
		n.LatestAdverts = n.LatestAdverts[:r.maxAdverts]
	}

	// Buffer for the append-only adverts history (drained by the periodic flush).
	r.pending = append(r.pending, a)

	hook := r.onAdvert
	r.mu.Unlock()

	// Fan out to the live feed outside the lock: the hub send is non-blocking,
	// but JSON marshaling shouldn't hold up the hot advert path.
	if hook != nil {
		hook(LiveAdvert{
			Hash:      a.Hash,
			PubKey:    a.PubKey,
			Name:      a.Name,
			Type:      a.NodeType,
			HasGPS:    a.HasGPS,
			Lat:       a.Lat,
			Lon:       a.Lon,
			NetworkID: a.NetworkID,
			At:        a.At,
			New:       isNew,
		})
	}
}

// PendingAdverts returns a copy of the adverts observed since the last flush,
// without clearing the buffer. Pair it with ClearPending after a successful
// persist so a failed flush keeps the adverts buffered for the next attempt.
func (r *NodeRegistry) PendingAdverts() []AdvertObservation {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]AdvertObservation(nil), r.pending...)
}

// ClearPending drops the first n buffered adverts (those just persisted). New
// adverts arriving meanwhile are appended after them, so they survive.
func (r *NodeRegistry) ClearPending(n int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if n >= len(r.pending) {
		r.pending = r.pending[:0]
		return
	}
	r.pending = append(r.pending[:0], r.pending[n:]...)
}

// Lookup returns a snapshot copy of one node's overview row by pubkey, used to
// resolve neighbor metadata for the links endpoint. The heavy LatestAdverts list
// is dropped. ok is false when the node has never been heard via an advert.
func (r *NodeRegistry) Lookup(pubkey string) (NodeRecord, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := r.nodes[pubkey]
	if n == nil {
		return NodeRecord{}, false
	}
	rec := *n
	rec.Networks = append([]string(nil), n.Networks...)
	rec.LatestAdverts = nil
	return rec, true
}

// --- API view shapes ---

// AdvertView is one entry in a node's rolling latest-adverts list. The pubkey is
// implied by the enclosing node, so it is omitted here.
type AdvertView struct {
	Name         string  `json:"name"`
	Type         byte    `json:"type"`
	TypeName     string  `json:"typeName"`
	HasGPS       bool    `json:"hasGps"`
	Lat          float64 `json:"lat,omitempty"`
	Lon          float64 `json:"lon,omitempty"`
	AdvertTime   int64   `json:"advertTime"`
	At           int64   `json:"at"`
	NetworkID    string  `json:"networkId"`
	ObserverName string  `json:"observerName,omitempty"`
}

type NodeView struct {
	PubKey        string       `json:"pubkey"`
	Name          string       `json:"name"`
	Type          byte         `json:"type"`
	TypeName      string       `json:"typeName"`
	HasGPS        bool         `json:"hasGps"`
	Lat           float64      `json:"lat,omitempty"`
	Lon           float64      `json:"lon,omitempty"`
	FirstAdvertAt int64        `json:"firstAdvertAt"`
	LastAdvertAt  int64        `json:"lastAdvertAt"`
	AdvertCount   uint64       `json:"advertCount"`
	Networks      []string     `json:"networks"`
	ObserverName  string       `json:"observerName,omitempty"`
	LatestAdverts []AdvertView `json:"latestAdverts"`
}

func advertViews(adverts []AdvertObservation) []AdvertView {
	out := make([]AdvertView, 0, len(adverts))
	for _, a := range adverts {
		out = append(out, AdvertView{
			Name:         a.Name,
			Type:         a.NodeType,
			TypeName:     nodeTypeName(a.NodeType),
			HasGPS:       a.HasGPS,
			Lat:          a.Lat,
			Lon:          a.Lon,
			AdvertTime:   a.AdvertTime,
			At:           a.At,
			NetworkID:    a.NetworkID,
			ObserverName: a.ObserverName,
		})
	}
	return out
}

// Snapshot returns the node overview (most recent advert first), each node
// carrying its network set and rolling latest-adverts list, ready for JSON.
func (r *NodeRegistry) Snapshot() []NodeView {
	r.mu.Lock()
	defer r.mu.Unlock()

	nodes := make([]NodeView, 0, len(r.nodes))
	for _, n := range r.nodes {
		networks := append([]string(nil), n.Networks...)
		nodes = append(nodes, NodeView{
			PubKey:        n.PubKey,
			Name:          n.Name,
			Type:          n.NodeType,
			TypeName:      nodeTypeName(n.NodeType),
			HasGPS:        n.HasGPS,
			Lat:           n.Lat,
			Lon:           n.Lon,
			FirstAdvertAt: n.FirstAdvertAt,
			LastAdvertAt:  n.LastAdvertAt,
			AdvertCount:   n.AdvertCount,
			Networks:      networks,
			ObserverName:  n.ObserverName,
			LatestAdverts: advertViews(n.LatestAdverts),
		})
	}
	sort.Slice(nodes, func(i, j int) bool {
		if nodes[i].LastAdvertAt != nodes[j].LastAdvertAt {
			return nodes[i].LastAdvertAt > nodes[j].LastAdvertAt
		}
		return nodes[i].PubKey < nodes[j].PubKey
	})
	return nodes
}

// Export captures the node overview rows for persistence. The rolling
// latest-adverts list is not included — adverts live in their own append-only
// history table — so it is cleared on the returned copies. Slices are
// deep-copied so callers can serialize them outside the lock.
func (r *NodeRegistry) Export() []NodeRecord {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]NodeRecord, 0, len(r.nodes))
	for _, n := range r.nodes {
		rec := *n
		rec.Networks = append([]string(nil), n.Networks...)
		rec.LatestAdverts = nil
		out = append(out, rec)
	}
	return out
}

// AttachRecentAdverts fills each node's rolling latest-adverts list from a
// background load that runs after startup (the history scan is slow, so it must
// not block the server coming up). It only populates nodes that have not yet
// heard a live advert — LatestAdverts still empty — so adverts observed in the
// meantime are never clobbered. Trimmed to the current cap.
func (r *NodeRegistry) AttachRecentAdverts(recent map[string][]AdvertObservation) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for pk, adv := range recent {
		n := r.nodes[pk]
		if n == nil || len(n.LatestAdverts) > 0 || len(adv) == 0 {
			continue
		}
		if len(adv) > r.maxAdverts {
			adv = adv[:r.maxAdverts]
		}
		n.LatestAdverts = append([]AdvertObservation(nil), adv...)
	}
}

// Restore seeds the registry from persisted state at startup, before any
// collector runs. nodes are the overview rows; recent maps each node's pubkey to
// its most recent adverts (newest first) reloaded from the history table, used to
// repopulate the in-memory rolling list. Trimmed to the current cap.
func (r *NodeRegistry) Restore(nodes []NodeRecord, recent map[string][]AdvertObservation) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range nodes {
		n := nodes[i]
		if adv := recent[n.PubKey]; len(adv) > 0 {
			if len(adv) > r.maxAdverts {
				adv = adv[:r.maxAdverts]
			}
			n.LatestAdverts = append([]AdvertObservation(nil), adv...)
		}
		r.nodes[n.PubKey] = &n
	}
}
