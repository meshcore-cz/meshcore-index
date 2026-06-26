package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
)

// pk returns a deterministic 32-byte public key as 64-char hex, all bytes set to
// b, for use as a distinct test node identity.
func pk(b byte) string { return hex.EncodeToString(bytes.Repeat([]byte{b}, 32)) }

// neighborOf finds the link from node to neighbor in the registry, if any.
func neighborOf(t *testing.T, reg *LinkRegistry, node, neighbor string, now int64) (LinkNeighbor, bool) {
	t.Helper()
	nk, ok := normalizePub(node)
	if !ok {
		t.Fatalf("bad node pubkey %q", node)
	}
	for _, l := range reg.LinksForNode(nk, now) {
		if l.Neighbor == neighbor {
			return l, true
		}
	}
	return LinkNeighbor{}, false
}

func mustNeighbor(t *testing.T, reg *LinkRegistry, node, neighbor string) LinkNeighbor {
	t.Helper()
	l, ok := neighborOf(t, reg, node, neighbor, 0)
	if !ok {
		t.Fatalf("link %s—%s not found", node, neighbor)
	}
	return l
}

// noDecay disables score decay so RecentActivity == PacketCount in count tests.
func noDecay() *LinkRegistry { return newLinkRegistry(1e18) }

// 1. Same packet and path from two observers in one network counts once.
func TestLinkSameNetworkTwoObservers(t *testing.T) {
	a, b, c := pk(1), pk(2), pk(3)
	reg := noDecay()
	// Two observers in one network report the same hash + path.
	reg.ObservePath("hashX", "net-a", []string{a, b, c}, 100)
	reg.ObservePath("hashX", "net-a", []string{a, b, c}, 101)

	if l := mustNeighbor(t, reg, a, b); l.PacketCount != 1 {
		t.Errorf("A—B count = %d, want 1", l.PacketCount)
	}
	if l := mustNeighbor(t, reg, b, c); l.PacketCount != 1 {
		t.Errorf("B—C count = %d, want 1", l.PacketCount)
	}
}

// 2/3. Same packet across different networks counts once globally, and both
// networks are recorded on the link.
func TestLinkCrossNetworkCountsOnceRecordsBoth(t *testing.T) {
	a, b := pk(1), pk(2)
	reg := noDecay()
	reg.ObservePath("hashX", "net-a", []string{a, b}, 100)
	reg.ObservePath("hashX", "net-b", []string{a, b}, 101)

	l := mustNeighbor(t, reg, a, b)
	if l.PacketCount != 1 {
		t.Errorf("count = %d, want 1 (global dedup ignores network)", l.PacketCount)
	}
	if len(l.Networks) != 2 || l.Networks[0] != "net-a" || l.Networks[1] != "net-b" {
		t.Errorf("networks = %v, want [net-a net-b]", l.Networks)
	}
}

// 4. Different paths for the same packet count each distinct adjacent link once.
func TestLinkDifferentPathsSameHash(t *testing.T) {
	a, b, c, d := pk(1), pk(2), pk(3), pk(4)
	reg := noDecay()
	reg.ObservePath("hashX", "net-a", []string{a, b, c}, 100) // A—B, B—C
	reg.ObservePath("hashX", "net-a", []string{a, d, c}, 100) // A—D, D—C

	for _, pair := range [][2]string{{a, b}, {b, c}, {a, d}, {d, c}} {
		l := mustNeighbor(t, reg, pair[0], pair[1])
		if l.PacketCount != 1 {
			t.Errorf("%s—%s count = %d, want 1", pair[0], pair[1], l.PacketCount)
		}
	}
	if n := reg.linkCount(); n != 4 {
		t.Errorf("link count = %d, want 4", n)
	}
}

// 5. A repeated link inside one path counts once for that packet.
func TestLinkRepeatedWithinPath(t *testing.T) {
	a, b, c := pk(1), pk(2), pk(3)
	reg := noDecay()
	// Path A→B→C→B: B—C appears twice (C—B == B—C).
	reg.ObservePath("hashX", "net-a", []string{a, b, c, b}, 100)
	if l := mustNeighbor(t, reg, b, c); l.PacketCount != 1 {
		t.Errorf("B—C count = %d, want 1 (deduped within path)", l.PacketCount)
	}
}

// 6. Reversed paths resolve to the same undirected link.
func TestLinkReversedSameLink(t *testing.T) {
	a, b := pk(1), pk(2)
	reg := noDecay()
	reg.ObservePath("hashX", "net-a", []string{a, b}, 100)
	reg.ObservePath("hashY", "net-a", []string{b, a}, 101) // distinct hash -> counts again

	if n := reg.linkCount(); n != 1 {
		t.Fatalf("link count = %d, want 1 (A—B == B—A)", n)
	}
	if l := mustNeighbor(t, reg, a, b); l.PacketCount != 2 {
		t.Errorf("count = %d, want 2", l.PacketCount)
	}
}

// 7. Invalid public keys and self-links are ignored, and an invalid node breaks
// adjacency rather than inferring a link across it.
func TestLinkInvalidAndSelf(t *testing.T) {
	a, b := pk(1), pk(2)
	reg := noDecay()

	// Invalid middle node: A—bad and bad—B both dropped, A—B never inferred.
	reg.ObservePath("h1", "net-a", []string{a, "not-a-key", b}, 100)
	if n := reg.linkCount(); n != 0 {
		t.Errorf("invalid middle: link count = %d, want 0", n)
	}

	// Self-link via consecutive duplicate collapses to A—B only (no A—A).
	reg.ObservePath("h2", "net-a", []string{a, a, b}, 100)
	if n := reg.linkCount(); n != 1 {
		t.Fatalf("after self/dup path: link count = %d, want 1", n)
	}
	if _, ok := neighborOf(t, reg, a, b, 0); !ok {
		t.Error("A—B should exist after collapsing the duplicate A")
	}

	// A pure self pair yields no link.
	reg.ObservePath("h3", "net-a", []string{a, a}, 100)
	if n := reg.linkCount(); n != 1 {
		t.Errorf("self-only path created a link: count = %d, want 1", n)
	}
}

// 8. Link aggregates (and their network associations) survive a restart.
func TestLinkPersistRestart(t *testing.T) {
	a, b, c := pk(1), pk(2), pk(3)
	reg := noDecay()
	reg.ObservePath("h1", "net-a", []string{a, b, c}, 100)
	reg.ObservePath("h2", "net-b", []string{a, b}, 200) // A—B count 2, second network

	db, err := OpenDB(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatalf("OpenDB: %v", err)
	}
	defer db.Close()

	dirty := reg.TakeDirty()
	if err := db.SaveLinks(dirty, 300); err != nil {
		t.Fatalf("SaveLinks: %v", err)
	}

	loaded, err := db.LoadLinks()
	if err != nil {
		t.Fatalf("LoadLinks: %v", err)
	}
	reg2 := noDecay()
	reg2.Restore(loaded)

	if reg2.linkCount() != 2 {
		t.Fatalf("restored link count = %d, want 2", reg2.linkCount())
	}
	ab := mustNeighbor(t, reg2, a, b)
	if ab.PacketCount != 2 {
		t.Errorf("restored A—B count = %d, want 2", ab.PacketCount)
	}
	if len(ab.Networks) != 2 {
		t.Errorf("restored A—B networks = %v, want 2", ab.Networks)
	}
	if ab.FirstSeen != 100 || ab.LastSeen != 200 {
		t.Errorf("restored A—B seen = %d/%d, want 100/200", ab.FirstSeen, ab.LastSeen)
	}
}

// 9. The packet-link dedup cache expires according to the configured window.
func TestLinkDedupCacheExpires(t *testing.T) {
	a, b := pk(1), pk(2)
	reg := noDecay()
	const window = 900 // 15m

	reg.ObservePath("hashX", "net-a", []string{a, b}, 1000)
	if l := mustNeighbor(t, reg, a, b); l.PacketCount != 1 {
		t.Fatalf("count = %d, want 1", l.PacketCount)
	}

	// Within the window the same hash is still deduped.
	reg.ObservePath("hashX", "net-a", []string{a, b}, 1000+window)
	if l := mustNeighbor(t, reg, a, b); l.PacketCount != 1 {
		t.Errorf("within window count = %d, want 1", l.PacketCount)
	}

	// After a sweep past the window, the cache entry is gone and the same hash
	// counts again.
	reg.sweep(1000+window+window+1, window)
	reg.ObservePath("hashX", "net-a", []string{a, b}, 1000+window+window+2)
	if l := mustNeighbor(t, reg, a, b); l.PacketCount != 2 {
		t.Errorf("after expiry count = %d, want 2", l.PacketCount)
	}
}

// score decays toward zero over the configured half-life.
func TestLinkScoreDecay(t *testing.T) {
	a, b := pk(1), pk(2)
	reg := newLinkRegistry(100) // 100s half-life
	reg.ObservePath("h1", "net-a", []string{a, b}, 1000)

	// One half-life later the activity should be ~0.5 of the initial 1.0.
	l, ok := neighborOf(t, reg, a, b, 1100)
	if !ok {
		t.Fatal("A—B not found")
	}
	if l.RecentActivity < 0.45 || l.RecentActivity > 0.55 {
		t.Errorf("decayed activity = %v, want ~0.5", l.RecentActivity)
	}
	// PacketCount is unaffected by decay.
	if l.PacketCount != 1 {
		t.Errorf("packetCount = %d, want 1", l.PacketCount)
	}
}

// --- HTTP endpoint: sorting, limits, active and network filtering ---

type linkResp struct {
	Node     string     `json:"node"`
	Links    []linkView `json:"links"`
	Returned int        `json:"returned"`
	Total    int        `json:"total"`
	Capped   bool       `json:"capped"`
}

// seedLinks builds a registry of links from node a to four neighbors with
// distinct strength/recency/network, plus a node registry with neighbor metadata
// (one neighbor lacks GPS).
func seedLinkEnv(t *testing.T) (*Server, string, map[byte]string) {
	t.Helper()
	a := pk(0xa0)
	b, c, d, e := pk(0xb0), pk(0xc0), pk(0xd0), pk(0xe0)

	reg := noDecay()
	// A—B: 5 packets, net-a, recent.
	for i := 0; i < 5; i++ {
		reg.ObservePath(string(rune('A'+i)), "net-a", []string{a, b}, 1000)
	}
	// A—C: 3 packets, net-b, recent.
	for i := 0; i < 3; i++ {
		reg.ObservePath(string(rune('M'+i)), "net-b", []string{a, c}, 1000)
	}
	// A—E: 2 packets, net-a, recent — neighbor E has no GPS.
	for i := 0; i < 2; i++ {
		reg.ObservePath(string(rune('U'+i)), "net-a", []string{a, e}, 1000)
	}
	// A—D: 1 packet, net-a, stale (lastSeen 100).
	reg.ObservePath("Z", "net-a", []string{a, d}, 100)

	nodes := newNodeRegistry(defaultAdvertsPerNode)
	nodes.nodes[b] = &NodeRecord{PubKey: b, Name: "Bravo", NodeType: 2, HasGPS: true, Lat: 50.1, Lon: 14.4}
	nodes.nodes[c] = &NodeRecord{PubKey: c, Name: "Charlie", NodeType: 1, HasGPS: true, Lat: 51, Lon: 15}
	nodes.nodes[d] = &NodeRecord{PubKey: d, Name: "Delta", NodeType: 3, HasGPS: true, Lat: 52, Lon: 16}
	nodes.nodes[e] = &NodeRecord{PubKey: e, Name: "Echo", NodeType: 4, HasGPS: false}

	srv := NewServer(NewStore(nil), nodes, newObserverRegistry(), reg, newImportRegistry(), nil, "*")
	return srv, a, map[byte]string{0xb0: b, 0xc0: c, 0xd0: d, 0xe0: e}
}

func getLinks(t *testing.T, srv *Server, node, query string) linkResp {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/nodes/"+node+"/links?"+query, nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rr.Code, rr.Body.String())
	}
	var resp linkResp
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v (body %s)", err, rr.Body.String())
	}
	return resp
}

// 10. Endpoint sorting, limits, active and network filtering.
func TestNodeLinksEndpoint(t *testing.T) {
	defer func(orig func() int64) { nowUnix = orig }(nowUnix)
	nowUnix = func() int64 { return 87000 } // active=24h cutoff = 600

	srv, a, ids := seedLinkEnv(t)

	// Default: sorted by recent activity desc — B(5), C(3), E(2), D(1).
	resp := getLinks(t, srv, a, "")
	if resp.Total != 4 || resp.Returned != 4 || resp.Capped {
		t.Fatalf("default: total=%d returned=%d capped=%v, want 4/4/false", resp.Total, resp.Returned, resp.Capped)
	}
	wantOrder := []string{ids[0xb0], ids[0xc0], ids[0xe0], ids[0xd0]}
	for i, w := range wantOrder {
		if resp.Links[i].Neighbor.PubKey != w {
			t.Errorf("order[%d] = %s, want %s", i, resp.Links[i].Neighbor.PubKey, w)
		}
	}

	// Limit caps and flags.
	resp = getLinks(t, srv, a, "limit=2")
	if resp.Returned != 2 || resp.Total != 4 || !resp.Capped {
		t.Errorf("limit=2: returned=%d total=%d capped=%v, want 2/4/true", resp.Returned, resp.Total, resp.Capped)
	}

	// Active filter drops the stale A—D (lastSeen 100 < cutoff 600).
	resp = getLinks(t, srv, a, "active=24h")
	if resp.Total != 3 {
		t.Errorf("active=24h total = %d, want 3", resp.Total)
	}
	for _, l := range resp.Links {
		if l.Neighbor.PubKey == ids[0xd0] {
			t.Error("stale link A—D should have been dropped by active filter")
		}
	}

	// Network filter includes only links observed through net-b (A—C).
	resp = getLinks(t, srv, a, "networks=net-b")
	if resp.Total != 1 || resp.Links[0].Neighbor.PubKey != ids[0xc0] {
		t.Errorf("networks=net-b: total=%d first=%v, want 1/C", resp.Total, resp.Links)
	}
	// Network filter must not change the global packet count.
	if resp.Links[0].PacketCount != 3 {
		t.Errorf("filtered A—C packetCount = %d, want 3 (unchanged by filter)", resp.Links[0].PacketCount)
	}
}

// 11. Neighbors without GPS are returned but marked non-drawable.
func TestNodeLinksNonGPSNeighbor(t *testing.T) {
	srv, a, ids := seedLinkEnv(t)
	resp := getLinks(t, srv, a, "")
	var echo *linkView
	for i := range resp.Links {
		if resp.Links[i].Neighbor.PubKey == ids[0xe0] {
			echo = &resp.Links[i]
		}
	}
	if echo == nil {
		t.Fatal("non-GPS neighbor E missing from the list")
	}
	if echo.Neighbor.HasGPS {
		t.Error("neighbor E should be marked hasGps=false")
	}
	if echo.Neighbor.Name != "Echo" {
		t.Errorf("neighbor E name = %q, want Echo (still enriched)", echo.Neighbor.Name)
	}
}

// An invalid pubkey in the path is rejected by the endpoint.
func TestNodeLinksInvalidPubkey(t *testing.T) {
	srv, _, _ := seedLinkEnv(t)
	req := httptest.NewRequest(http.MethodGet, "/api/nodes/not-a-key/links", nil)
	rr := httptest.NewRecorder()
	srv.Handler().ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rr.Code)
	}
}
