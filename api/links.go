package main

import (
	"bytes"
	"encoding/hex"
	"math"
	"sort"
	"strings"
	"sync"
)

// Observed node links (internally "edges"). A link is an undirected pair of mesh
// nodes that appeared *adjacent* in a packet's resolved path. The registry is
// global — shared by every collector across every network — mirroring the global
// node and observer registries, not living inside any NetworkState.
//
// Only adjacent entries in resolved_path create a link: a path A→B→C→D yields
// A—B, B—C, C—D and nothing else (no A—C, A—D, B—D). Links are undirected, so
// A—B == B—A. The link to the analyzer observer is never inferred.

// defaultLinkHalfLife is the half-life (seconds) of a link's recent-activity
// score: 24h by default. Each globally-deduplicated packet-link event adds 1 to
// the score, which then decays exponentially so recent traffic dominates.
const defaultLinkHalfLife = 24 * 60 * 60

// linkShards is the number of independently-locked shards. Many collectors update
// the registry concurrently, so the keyspace is split to keep lock contention low.
const linkShards = 64

// pubKey is a node's 32-byte Ed25519 public key in raw (decoded) form.
type pubKey [32]byte

// linkKey is the canonical, fixed-size key for an undirected link: the two node
// public keys in byte order (smaller first). Being a comparable array it is used
// directly as a map key, with no per-event string concatenation or allocation.
type linkKey [64]byte

// normalizePub validates and decodes a public key from hex. Keys are 32-byte
// Ed25519 keys (64 hex chars); anything else is rejected.
func normalizePub(s string) (pubKey, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	if len(s) != 64 {
		return pubKey{}, false
	}
	var k pubKey
	if _, err := hex.Decode(k[:], []byte(s)); err != nil {
		return pubKey{}, false
	}
	return k, true
}

// canonicalKey orders two node keys into the undirected canonical link key. ok is
// false for a self-link (a == b), which is never recorded.
func canonicalKey(a, b pubKey) (linkKey, bool) {
	if a == b {
		return linkKey{}, false
	}
	var k linkKey
	if bytes.Compare(a[:], b[:]) <= 0 {
		copy(k[:32], a[:])
		copy(k[32:], b[:])
	} else {
		copy(k[:32], b[:])
		copy(k[32:], a[:])
	}
	return k, true
}

func (k linkKey) nodeA() string { return hex.EncodeToString(k[:32]) }
func (k linkKey) nodeB() string { return hex.EncodeToString(k[32:]) }

// linkNetwork records that a link was observed through a given network, with the
// first/last times it was seen there. The set of these is what lets a link report
// every network it has carried traffic on, independent of the global packet count.
type linkNetwork struct {
	NetworkID string
	FirstSeen int64
	LastSeen  int64
}

// LinkRecord is the sparse aggregate for one observed link. Only links that have
// actually been seen exist — there is no N×N matrix. Storage grows solely with
// observed links.
type LinkRecord struct {
	Key            linkKey
	NodeA          string // lowercase hex, canonical order (== Key.nodeA)
	NodeB          string // lowercase hex, canonical order (== Key.nodeB)
	PacketCount    uint64 // global count after cross-network/observer dedup
	FirstSeen      int64
	LastSeen       int64
	Score          float64 // recent-activity score at ScoreUpdatedAt (pre-decay)
	ScoreUpdatedAt int64
	Networks       []linkNetwork // networks this link was observed through
	dirty          bool          // pending persistence
}

// linkDedupKey is the global packet-link deduplication key: (packet content
// hash, canonical link). It deliberately excludes network and observer ids so the
// same packet reported by multiple observers, or across multiple networks, counts
// the link's activity only once.
type linkDedupKey struct {
	hash string
	key  linkKey
}

type linkShard struct {
	mu    sync.Mutex
	links map[linkKey]*LinkRecord
	dedup map[linkDedupKey]int64 // -> last-seen unix; short-lived, swept by window
}

// LinkRegistry is the global, concurrency-safe store of observed links. It is
// sharded by link key so concurrent collectors rarely contend on the same lock.
type LinkRegistry struct {
	shards   [linkShards]linkShard
	halfLife float64 // seconds

	// Routing reuses a briefly-cached snapshot of the whole link graph so a burst
	// of hovers doesn't rebuild adjacency from every shard each time. See route.go.
	routeMu  sync.Mutex
	routeAdj *routeAdjacency
}

func newLinkRegistry(halfLifeSeconds float64) *LinkRegistry {
	if halfLifeSeconds <= 0 {
		halfLifeSeconds = defaultLinkHalfLife
	}
	r := &LinkRegistry{halfLife: halfLifeSeconds}
	for i := range r.shards {
		r.shards[i].links = make(map[linkKey]*LinkRecord)
		r.shards[i].dedup = make(map[linkDedupKey]int64)
	}
	return r
}

// shardFor picks a shard from the link key. Public keys are uniformly random, so
// a couple of key bytes spread links evenly across shards.
func (r *LinkRegistry) shardFor(k linkKey) *linkShard {
	return &r.shards[(uint(k[0])<<8|uint(k[1]))%linkShards]
}

// ObservePath records the adjacent links of one packet's resolved path. It is the
// single entry point from the collector. The packet hash drives global
// deduplication; networkID is recorded on every touched link; now is the receive
// time.
//
// Processing per the spec: normalize and validate keys, collapse consecutive
// duplicate nodes, ignore self-links, and dedup repeated links within the path.
// Network association is updated even when the (hash, link) pair was already
// counted, so a link records every network it was heard on without inflating its
// global packet count.
func (r *LinkRegistry) ObservePath(hash, networkID string, path []string, now int64) {
	hash = strings.ToLower(strings.TrimSpace(hash))
	if hash == "" || len(path) < 2 {
		return
	}

	// Walk adjacent pairs of the (consecutive-dedup'd) path. We keep a per-path
	// set so a link repeated within one path is handled once.
	var prev pubKey
	var havePrev bool
	var prevRaw string
	seen := make(map[linkKey]struct{})

	for _, raw := range path {
		raw = strings.ToLower(strings.TrimSpace(raw))
		if raw == "" {
			continue
		}
		// Collapse consecutive duplicate nodes (A,A,B -> A,B).
		if havePrev && raw == prevRaw {
			continue
		}
		cur, ok := normalizePub(raw)
		if !ok {
			// Invalid key breaks adjacency: the links touching it are dropped and
			// no link is inferred across it.
			havePrev = false
			prevRaw = raw
			continue
		}
		if havePrev {
			if key, ok := canonicalKey(prev, cur); ok {
				if _, dup := seen[key]; !dup {
					seen[key] = struct{}{}
					r.observeLink(key, hash, networkID, now)
				}
			}
		}
		prev = cur
		prevRaw = raw
		havePrev = true
	}
}

// observeLink applies one (already de-duplicated within its path) adjacent link
// observation: upserts the record, always records the network, and increments the
// global packet count + activity score only when this (hash, link) pair is new
// within the dedup window.
func (r *LinkRegistry) observeLink(key linkKey, hash, networkID string, now int64) {
	sh := r.shardFor(key)
	sh.mu.Lock()
	defer sh.mu.Unlock()

	rec := sh.links[key]
	if rec == nil {
		rec = &LinkRecord{
			Key:            key,
			NodeA:          key.nodeA(),
			NodeB:          key.nodeB(),
			FirstSeen:      now,
			ScoreUpdatedAt: now,
		}
		sh.links[key] = rec
	}

	// Network association is updated regardless of dedup so the link records every
	// network it has carried this packet (and others) on.
	if networkID != "" {
		rec.addNetwork(networkID, now)
		rec.dirty = true
	}

	dk := linkDedupKey{hash: hash, key: key}
	if _, dup := sh.dedup[dk]; dup {
		sh.dedup[dk] = now // refresh so an actively-reflooded packet stays deduped
		return
	}
	sh.dedup[dk] = now

	// New globally-deduplicated packet-link event: count it and bump the score.
	rec.PacketCount++
	rec.LastSeen = now
	rec.decayScore(now, r.halfLife)
	rec.Score++
	rec.dirty = true
}

// addNetwork records (or refreshes) the network association on a link, keeping
// first-seen order like the node/observer registries.
func (rec *LinkRecord) addNetwork(networkID string, now int64) {
	for i := range rec.Networks {
		if rec.Networks[i].NetworkID == networkID {
			rec.Networks[i].LastSeen = now
			return
		}
	}
	rec.Networks = append(rec.Networks, linkNetwork{NetworkID: networkID, FirstSeen: now, LastSeen: now})
}

// decayScore decays the stored score to `now` using the configured half-life,
// then advances ScoreUpdatedAt. Caller adds the new event's weight afterwards.
func (rec *LinkRecord) decayScore(now int64, halfLife float64) {
	if rec.ScoreUpdatedAt == 0 || halfLife <= 0 {
		rec.ScoreUpdatedAt = now
		return
	}
	if dt := now - rec.ScoreUpdatedAt; dt > 0 {
		rec.Score *= math.Exp2(-float64(dt) / halfLife)
	}
	rec.ScoreUpdatedAt = now
}

// decayedScore returns the score decayed to `now` without mutating the record.
func decayedScore(score float64, updatedAt, now int64, halfLife float64) float64 {
	if halfLife <= 0 || updatedAt == 0 {
		return score
	}
	if dt := now - updatedAt; dt > 0 {
		return score * math.Exp2(-float64(dt)/halfLife)
	}
	return score
}

// sweep drops packet-link dedup entries older than the window so the short-lived
// cache stays bounded. The aggregates themselves are never aged out.
func (r *LinkRegistry) sweep(now, dedupWindow int64) {
	for i := range r.shards {
		sh := &r.shards[i]
		sh.mu.Lock()
		for k, ts := range sh.dedup {
			if now-ts > dedupWindow {
				delete(sh.dedup, k)
			}
		}
		sh.mu.Unlock()
	}
}

// --- API view shapes ---

// LinkNeighbor is one link from a selected node's perspective: the aggregate
// stats plus the *other* endpoint's public key. Neighbor metadata (name, type,
// gps) is resolved by the HTTP handler via the node registry.
type LinkNeighbor struct {
	Neighbor       string   // hex pubkey of the other endpoint
	PacketCount    uint64   // global, deduplicated
	RecentActivity float64  // decayed score at query time
	FirstSeen      int64    // global first observation of the link
	LastSeen       int64    // global last counted observation
	Networks       []string // networks the link was observed through, first-seen order
}

// LinksForNode returns every observed link with the given node as an endpoint,
// each described from that node's side (the neighbor is the opposite endpoint).
// The activity score is decayed to `now`. Storage is scanned sparsely — only
// links that actually exist are visited — and no global topology is materialized.
func (r *LinkRegistry) LinksForNode(node pubKey, now int64) []LinkNeighbor {
	var out []LinkNeighbor
	for i := range r.shards {
		sh := &r.shards[i]
		sh.mu.Lock()
		for key, rec := range sh.links {
			var neighbor pubKey
			switch {
			case bytes.Equal(key[:32], node[:]):
				copy(neighbor[:], key[32:])
			case bytes.Equal(key[32:], node[:]):
				copy(neighbor[:], key[:32])
			default:
				continue
			}
			nets := make([]string, len(rec.Networks))
			for j, n := range rec.Networks {
				nets[j] = n.NetworkID
			}
			out = append(out, LinkNeighbor{
				Neighbor:       hex.EncodeToString(neighbor[:]),
				PacketCount:    rec.PacketCount,
				RecentActivity: decayedScore(rec.Score, rec.ScoreUpdatedAt, now, r.halfLife),
				FirstSeen:      rec.FirstSeen,
				LastSeen:       rec.LastSeen,
				Networks:       nets,
			})
		}
		sh.mu.Unlock()
	}
	return out
}

// --- persistence plumbing ---

// TakeDirty returns deep copies of every link changed since the last flush and
// clears their dirty flags atomically. On a failed persist the caller re-marks
// them with Requeue so the change isn't lost. Concurrent updates set the flag
// again and are picked up on the next cycle.
func (r *LinkRegistry) TakeDirty() []LinkRecord {
	var out []LinkRecord
	for i := range r.shards {
		sh := &r.shards[i]
		sh.mu.Lock()
		for _, rec := range sh.links {
			if !rec.dirty {
				continue
			}
			cp := *rec
			cp.Networks = append([]linkNetwork(nil), rec.Networks...)
			out = append(out, cp)
			rec.dirty = false
		}
		sh.mu.Unlock()
	}
	return out
}

// Requeue re-marks the given links dirty after a failed persist so they flush on
// the next cycle.
func (r *LinkRegistry) Requeue(records []LinkRecord) {
	for i := range records {
		sh := r.shardFor(records[i].Key)
		sh.mu.Lock()
		if rec := sh.links[records[i].Key]; rec != nil {
			rec.dirty = true
		}
		sh.mu.Unlock()
	}
}

// Restore seeds the registry from persisted aggregates at startup, before any
// collector runs. The short-lived packet-link dedup cache starts empty (like the
// counter dedup state) and rebuilds within the window.
func (r *LinkRegistry) Restore(records []LinkRecord) {
	for i := range records {
		rec := records[i]
		key, ok := keyFromPair(rec.NodeA, rec.NodeB)
		if !ok {
			continue
		}
		rec.Key = key
		rec.NodeA = key.nodeA()
		rec.NodeB = key.nodeB()
		rec.dirty = false
		sh := r.shardFor(key)
		sh.mu.Lock()
		sh.links[key] = &rec
		sh.mu.Unlock()
	}
}

// keyFromPair builds a canonical link key from two hex public keys.
func keyFromPair(a, b string) (linkKey, bool) {
	ka, ok := normalizePub(a)
	if !ok {
		return linkKey{}, false
	}
	kb, ok := normalizePub(b)
	if !ok {
		return linkKey{}, false
	}
	return canonicalKey(ka, kb)
}

// linkCount reports the number of stored links (testing/diagnostics).
func (r *LinkRegistry) linkCount() int {
	n := 0
	for i := range r.shards {
		sh := &r.shards[i]
		sh.mu.Lock()
		n += len(sh.links)
		sh.mu.Unlock()
	}
	return n
}

// sortNeighborsByActivity orders links by recent activity (desc), breaking ties
// by neighbor key for determinism.
func sortNeighborsByActivity(links []LinkNeighbor) {
	sort.Slice(links, func(i, j int) bool {
		if links[i].RecentActivity != links[j].RecentActivity {
			return links[i].RecentActivity > links[j].RecentActivity
		}
		return links[i].Neighbor < links[j].Neighbor
	})
}
