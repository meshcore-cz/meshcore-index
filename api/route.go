package main

import (
	"encoding/hex"
	"math"
)

// Best-effort routing over the observed-link graph. A "route" is a shortest path
// between two nodes through links we have actually seen carry traffic, where each
// hop is weighted by how reliable that link looks right now — recent, busy links
// are cheap; stale or rarely-seen ones are expensive. This is *not* a prediction
// of what the mesh firmware would do, only a most-plausible path through the
// links in our database.

// routeHopBase is the fixed per-hop cost. It biases the search toward fewer hops
// so the reliability penalty only tips the balance between paths of similar
// length, rather than chaining many "perfect" links into an absurdly long route.
const routeHopBase = 1.0

// edgeCost scores one link for routing: lower is better. A link seen seconds ago
// with heavy traffic approaches routeHopBase; an old, barely-seen link costs much
// more. recency decays with the same ~1-week falloff the map uses for link
// opacity, and strength rewards sustained activity (log so a 10× busier link is
// not 10× preferred).
func edgeCost(recentActivity float64, lastSeen, now int64) float64 {
	ageDays := math.Max(0, float64(now-lastSeen)/86400)
	recency := math.Exp(-ageDays / 7) // 0..1, ~1-week half-ish falloff
	strength := 1 + math.Log1p(math.Max(0, recentActivity))
	quality := recency * strength
	if quality < 1e-6 {
		quality = 1e-6
	}
	return routeHopBase + 1/quality
}

// routeEdge is one adjacency entry: the neighbor plus the link's stats, copied
// out of the registry so the Dijkstra search runs without holding shard locks.
// cost is precomputed at build time; the active/network filters are applied per
// edge during the search (using lastSeen/networks) so one cached graph serves
// every filter combination.
type routeEdge struct {
	to             pubKey
	packetCount    uint64
	recentActivity float64
	firstSeen      int64
	lastSeen       int64
	networks       []string
	cost           float64
}

// routeCacheTTL is how long a built adjacency snapshot is reused before a rebuild.
// Routes are themselves cached for 15s at the HTTP layer and link stats change
// slowly, so a short in-memory reuse window turns a burst of hovers into a single
// graph build without noticeably staling the result.
const routeCacheTTL = 15

// routeAdjacency is a cached, immutable snapshot of the whole link graph. Once
// published it is only ever read, so concurrent searches share it lock-free.
type routeAdjacency struct {
	builtAt int64
	graph   map[pubKey][]routeEdge
}

// RouteHop is one leg of a computed route, described independently of direction
// (From → To follow the path order). The neighbor metadata is resolved by the
// HTTP handler, like the links endpoint.
type RouteHop struct {
	From           string
	To             string
	PacketCount    uint64
	RecentActivity float64
	FirstSeen      int64
	LastSeen       int64
	Networks       []string
}

// RouteResult is an ordered path from source to destination. Nodes has one more
// entry than Hops: Nodes[i] and Nodes[i+1] are the endpoints of Hops[i]. Found is
// false when no path exists through the (filtered) link graph.
type RouteResult struct {
	Found bool
	Nodes []string // ordered pubkeys, source first
	Hops  []RouteHop
}

// adjacency returns the cached graph snapshot, rebuilding it only when the cache
// is empty or older than routeCacheTTL. The whole (unfiltered) graph is cached;
// the active/network filters are cheap per-edge checks applied later during the
// search, so a single snapshot serves every request regardless of filters.
func (r *LinkRegistry) adjacency(now int64) map[pubKey][]routeEdge {
	r.routeMu.Lock()
	defer r.routeMu.Unlock()
	if r.routeAdj != nil && now-r.routeAdj.builtAt < routeCacheTTL {
		return r.routeAdj.graph
	}
	graph := r.buildAdjacency(now)
	r.routeAdj = &routeAdjacency{builtAt: now, graph: graph}
	return graph
}

// buildAdjacency materializes the full link graph once. Each undirected link
// becomes two directed edges (one per endpoint), with the recency-weighted cost
// precomputed. The networks slice is built once and shared by both directions.
func (r *LinkRegistry) buildAdjacency(now int64) map[pubKey][]routeEdge {
	adj := make(map[pubKey][]routeEdge)
	add := func(from, to pubKey, rec *LinkRecord, nets []string, activity float64) {
		adj[from] = append(adj[from], routeEdge{
			to:             to,
			packetCount:    rec.PacketCount,
			recentActivity: activity,
			firstSeen:      rec.FirstSeen,
			lastSeen:       rec.LastSeen,
			networks:       nets,
			cost:           edgeCost(activity, rec.LastSeen, now),
		})
	}
	for i := range r.shards {
		sh := &r.shards[i]
		sh.mu.Lock()
		for key, rec := range sh.links {
			nets := make([]string, len(rec.Networks))
			for j, n := range rec.Networks {
				nets[j] = n.NetworkID
			}
			activity := decayedScore(rec.Score, rec.ScoreUpdatedAt, now, r.halfLife)
			var a, b pubKey
			copy(a[:], key[:32])
			copy(b[:], key[32:])
			add(a, b, rec, nets, activity)
			add(b, a, rec, nets, activity)
		}
		sh.mu.Unlock()
	}
	return adj
}

// edgePasses reports whether an edge survives the active/network filters.
func edgePasses(e routeEdge, since int64, netFilter map[string]bool) bool {
	if since > 0 && e.lastSeen < since {
		return false
	}
	if len(netFilter) > 0 && !anyInSet(e.networks, netFilter) {
		return false
	}
	return true
}

// pqItem is one entry on the Dijkstra frontier. The heap is a hand-rolled typed
// binary heap rather than container/heap: the standard library's interface-based
// API boxes every Push/Pop into an `any`, which on a large mesh component means
// millions of allocations. A typed heap keeps the hot loop allocation-free.
type pqItem struct {
	node pubKey
	cost float64
}

type minHeap []pqItem

func (h *minHeap) push(it pqItem) {
	*h = append(*h, it)
	i := len(*h) - 1
	a := *h
	for i > 0 {
		parent := (i - 1) / 2
		if a[parent].cost <= a[i].cost {
			break
		}
		a[parent], a[i] = a[i], a[parent]
		i = parent
	}
}

func (h *minHeap) pop() pqItem {
	a := *h
	n := len(a)
	top := a[0]
	a[0] = a[n-1]
	a = a[:n-1]
	*h = a
	i, sz := 0, len(a)
	for {
		l, rgt, smallest := 2*i+1, 2*i+2, i
		if l < sz && a[l].cost < a[smallest].cost {
			smallest = l
		}
		if rgt < sz && a[rgt].cost < a[smallest].cost {
			smallest = rgt
		}
		if smallest == i {
			break
		}
		a[i], a[smallest] = a[smallest], a[i]
		i = smallest
	}
	return top
}

// RouteBetween finds the lowest-cost path from `from` to `to` over the observed
// links, with each hop weighted by {@link edgeCost}. since/netFilter narrow the
// graph exactly like the links endpoint. The result path is reconstructed in
// source→destination order. Found is false when the two nodes are not connected
// through the filtered graph (including when either has no links at all).
func (r *LinkRegistry) RouteBetween(from, to pubKey, now, since int64, netFilter map[string]bool) RouteResult {
	if from == to {
		return RouteResult{Found: true, Nodes: []string{hex.EncodeToString(from[:])}}
	}
	adj := r.adjacency(now)
	if len(adj[from]) == 0 || len(adj[to]) == 0 {
		return RouteResult{Found: false}
	}

	// Size the maps to the graph so the hot loop never rehashes/grows.
	n := len(adj)
	dist := make(map[pubKey]float64, n)
	prev := make(map[pubKey]pubKey, n)
	prevEdge := make(map[pubKey]routeEdge, n)
	done := make(map[pubKey]bool, n)
	dist[from] = 0

	pq := minHeap{{node: from, cost: 0}}

	for len(pq) > 0 {
		cur := pq.pop()
		if done[cur.node] {
			continue
		}
		done[cur.node] = true
		if cur.node == to {
			break
		}
		for _, e := range adj[cur.node] {
			if done[e.to] || !edgePasses(e, since, netFilter) {
				continue
			}
			nd := cur.cost + e.cost
			if best, ok := dist[e.to]; !ok || nd < best {
				dist[e.to] = nd
				prev[e.to] = cur.node
				prevEdge[e.to] = e
				pq.push(pqItem{node: e.to, cost: nd})
			}
		}
	}

	if !done[to] {
		return RouteResult{Found: false}
	}

	// Walk predecessors back to the source, then reverse into path order.
	var revNodes []pubKey
	var revHops []RouteHop
	for n := to; ; {
		revNodes = append(revNodes, n)
		if n == from {
			break
		}
		e := prevEdge[n]
		p := prev[n]
		revHops = append(revHops, RouteHop{
			From:           hex.EncodeToString(p[:]),
			To:             hex.EncodeToString(n[:]),
			PacketCount:    e.packetCount,
			RecentActivity: e.recentActivity,
			FirstSeen:      e.firstSeen,
			LastSeen:       e.lastSeen,
			Networks:       e.networks,
		})
		n = p
	}

	nodes := make([]string, len(revNodes))
	for i, n := range revNodes {
		nodes[len(revNodes)-1-i] = hex.EncodeToString(n[:])
	}
	hops := make([]RouteHop, len(revHops))
	for i := range revHops {
		hops[len(revHops)-1-i] = revHops[i]
	}
	return RouteResult{Found: true, Nodes: nodes, Hops: hops}
}
