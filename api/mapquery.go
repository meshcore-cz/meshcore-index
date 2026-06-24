package main

import (
	"math"
	"strconv"
	"strings"
	"time"
)

// nodeZoom is the zoom level at/above which the map endpoint stops aggregating
// and returns individual nodes for the viewport. Below it, dense grid cells are
// collapsed into clusters.
const nodeZoom = 10

// defaultMapLimit caps how many individual node features one /api/map response
// returns (search results or high-zoom viewports), keeping payloads bounded.
const defaultMapLimit = 3000

// allNodesLimit is the (generous) cap for an all-nodes load. The registry holds
// ~15k nodes today; this leaves ample headroom while still bounding the payload.
const allNodesLimit = 200000

// MapParams describes one viewport query against the node registry. Zero-value
// filters mean "no filter": empty Types/Networks match every node, Since 0 keeps
// all ages, and an empty Q disables search.
type MapParams struct {
	BBox     [4]float64      // west, south, east, north (degrees); ignored when Q is set
	HasBBox  bool            // false = whole world
	Zoom     int             // map zoom level
	Types    map[byte]bool   // allowed node types (empty = all)
	Networks map[string]bool // allowed network IDs (empty = all)
	Since    int64           // keep nodes with LastAdvertAt >= Since (0 = all)
	Q        string          // name substring (case-insensitive) or pubkey hex prefix
	Limit    int             // max individual node features (<=0 = default)
	All      bool            // return every matching node (no bbox, no clustering)
}

// --- query-param parsing (used by the HTTP handler) ---

func atoiDefault(s string, def int) int {
	if n, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
		return n
	}
	return def
}

// parseBBox reads "west,south,east,north" floats. ok is false on any malformed
// input so the caller falls back to a whole-world query.
func parseBBox(s string) ([4]float64, bool) {
	parts := strings.Split(s, ",")
	if len(parts) != 4 {
		return [4]float64{}, false
	}
	var b [4]float64
	for i, p := range parts {
		v, err := strconv.ParseFloat(strings.TrimSpace(p), 64)
		if err != nil {
			return [4]float64{}, false
		}
		b[i] = v
	}
	return b, true
}

// parseByteSet reads a comma-separated list of small ints (node types) into a set.
func parseByteSet(s string) map[byte]bool {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	out := map[byte]bool{}
	for _, p := range strings.Split(s, ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && n >= 0 && n < 256 {
			out[byte(n)] = true
		}
	}
	return out
}

func parseStringSet(s string) map[string]bool {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	out := map[string]bool{}
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out[p] = true
		}
	}
	return out
}

// parseActive maps a recent-activity preset to a lookback duration.
func parseActive(s string) (time.Duration, bool) {
	switch strings.TrimSpace(s) {
	case "24h":
		return 24 * time.Hour, true
	case "7d":
		return 7 * 24 * time.Hour, true
	case "30d":
		return 30 * 24 * time.Hour, true
	}
	return 0, false
}

// GeoJSON output shapes. Properties is a free-form bag so the same collection can
// carry both cluster and node features, told apart by properties.cluster.
type geoGeometry struct {
	Type        string     `json:"type"`
	Coordinates [2]float64 `json:"coordinates"`
}

type geoFeature struct {
	Type       string         `json:"type"`
	Geometry   geoGeometry    `json:"geometry"`
	Properties map[string]any `json:"properties"`
}

// MapResult is a GeoJSON FeatureCollection ready for a MapLibre geojson source.
type MapResult struct {
	Type     string       `json:"type"`
	Features []geoFeature `json:"features"`
	Zoom     int          `json:"zoom"`
	Returned int          `json:"returned"`
	Capped   bool         `json:"capped"` // true when Limit truncated the result
}

func pointFeature(lon, lat float64, props map[string]any) geoFeature {
	return geoFeature{
		Type:       "Feature",
		Geometry:   geoGeometry{Type: "Point", Coordinates: [2]float64{lon, lat}},
		Properties: props,
	}
}

func nodeFeature(n *NodeRecord) geoFeature {
	return pointFeature(n.Lon, n.Lat, map[string]any{
		"cluster":      false,
		"pubkey":       n.PubKey,
		"name":         n.Name,
		"type":         n.NodeType,
		"typeName":     nodeTypeName(n.NodeType),
		"lastAdvertAt": n.LastAdvertAt,
		"advertCount":  n.AdvertCount,
		"networks":     append([]string(nil), n.Networks...),
	})
}

// importedFeature renders an externally-mirrored node as a GeoJSON point. The
// imported flag lets the client style it (50% opacity) and toggle it off.
func importedFeature(n *ImportedNode) geoFeature {
	t := byte(n.Type)
	return pointFeature(n.AdvLon, n.AdvLat, map[string]any{
		"cluster":      false,
		"pubkey":       n.PublicKey,
		"name":         n.AdvName,
		"type":         t,
		"typeName":     nodeTypeName(t),
		"lastAdvertAt": n.lastAdvertUnix(),
		"imported":     true,
		"source":       n.Source,
	})
}

// matchesImported reports whether an imported node passes the (non-spatial)
// filters. Imported nodes carry no network membership, so a network filter
// excludes them entirely.
func (p MapParams) matchesImported(n *ImportedNode) bool {
	if len(p.Types) > 0 && !p.Types[byte(n.Type)] {
		return false
	}
	if p.Since > 0 && n.lastAdvertUnix() < p.Since {
		return false
	}
	if len(p.Networks) > 0 {
		return false
	}
	if p.Q != "" {
		q := strings.ToLower(p.Q)
		if !strings.Contains(strings.ToLower(n.AdvName), q) && !strings.HasPrefix(n.PublicKey, q) {
			return false
		}
	}
	return true
}

// hasCoords drops imported nodes pinned at the null island (0,0), which upstream
// uses for "no location".
func (n *ImportedNode) hasCoords() bool {
	return n.AdvLat != 0 || n.AdvLon != 0
}

// matches reports whether a node passes the (non-spatial) filters.
func (p MapParams) matches(n *NodeRecord) bool {
	if len(p.Types) > 0 && !p.Types[n.NodeType] {
		return false
	}
	if p.Since > 0 && n.LastAdvertAt < p.Since {
		return false
	}
	if len(p.Networks) > 0 {
		ok := false
		for _, id := range n.Networks {
			if p.Networks[id] {
				ok = true
				break
			}
		}
		if !ok {
			return false
		}
	}
	if p.Q != "" {
		q := strings.ToLower(p.Q)
		if !strings.Contains(strings.ToLower(n.Name), q) && !strings.HasPrefix(n.PubKey, q) {
			return false
		}
	}
	return true
}

func (p MapParams) inBBox(lon, lat float64) bool {
	if !p.HasBBox {
		return true
	}
	return lon >= p.BBox[0] && lon <= p.BBox[2] && lat >= p.BBox[1] && lat <= p.BBox[3]
}

// cell accumulates the nodes that snap to one grid square.
type cell struct {
	count          int
	sumLat, sumLon float64
	types          map[byte]int
	minLon, minLat float64
	maxLon, maxLat float64
	single         *NodeRecord   // valid only while count == 1 and the lone node is live
	singleImported *ImportedNode // valid only while count == 1 and the lone node is imported
}

// MapQuery scans the registry once and returns a GeoJSON FeatureCollection for
// the viewport. Individual nodes are returned when searching or at high zoom;
// otherwise dense grid cells collapse into cluster features. Holds the lock only
// for the scan; the heavy per-node LatestAdverts lists are never touched.
//
// imported holds the externally-mirrored directory (map.meshcore.io). Those
// nodes are merged in, tagged so the client can style/toggle them, and deduped
// against the live registry by public key (a live node always wins).
func (r *NodeRegistry) MapQuery(p MapParams, imported []*ImportedNode) MapResult {
	limit := p.Limit
	if limit <= 0 {
		if p.All {
			limit = allNodesLimit
		} else {
			limit = defaultMapLimit
		}
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	res := MapResult{Type: "FeatureCollection", Zoom: p.Zoom, Features: []geoFeature{}}

	// Whole-world load, search, or zoomed-in: stream individual nodes. The client
	// then clusters/filters them locally. Search and all-mode ignore the bbox.
	if p.All || p.Q != "" || p.Zoom >= nodeZoom {
		// Filter by bbox whenever one is supplied (even in all-mode, so the client
		// can fetch just the current viewport first, then the whole world). Search
		// stays global and ignores the bbox.
		spatial := p.Q == "" && p.HasBBox
		capped := false
		for _, n := range r.nodes {
			if !n.HasGPS || !p.matches(n) {
				continue
			}
			if spatial && !p.inBBox(n.Lon, n.Lat) {
				continue
			}
			if len(res.Features) >= limit {
				capped = true
				break
			}
			res.Features = append(res.Features, nodeFeature(n))
		}
		for _, in := range imported {
			if capped {
				break
			}
			if !in.hasCoords() || r.nodes[in.PublicKey] != nil || !p.matchesImported(in) {
				continue
			}
			if spatial && !p.inBBox(in.AdvLon, in.AdvLat) {
				continue
			}
			if len(res.Features) >= limit {
				capped = true
				break
			}
			res.Features = append(res.Features, importedFeature(in))
		}
		res.Capped = capped
		res.Returned = len(res.Features)
		return res
	}

	// Low/mid zoom: grid-aggregate. Cell size is the degree-equivalent of a 40px
	// cluster radius on a 512px tile, so density tracks the map's own scale.
	size := 28.125 / math.Pow(2, float64(p.Zoom))
	cells := make(map[[2]int]*cell)
	for _, n := range r.nodes {
		if !n.HasGPS || !p.matches(n) || !p.inBBox(n.Lon, n.Lat) {
			continue
		}
		key := [2]int{int(math.Floor(n.Lon / size)), int(math.Floor(n.Lat / size))}
		c := cells[key]
		if c == nil {
			c = &cell{types: map[byte]int{}, minLon: n.Lon, minLat: n.Lat, maxLon: n.Lon, maxLat: n.Lat}
			cells[key] = c
		}
		c.count++
		c.sumLat += n.Lat
		c.sumLon += n.Lon
		c.types[n.NodeType]++
		c.minLon, c.maxLon = math.Min(c.minLon, n.Lon), math.Max(c.maxLon, n.Lon)
		c.minLat, c.maxLat = math.Min(c.minLat, n.Lat), math.Max(c.maxLat, n.Lat)
		if c.count == 1 {
			c.single = n
		} else {
			c.single, c.singleImported = nil, nil
		}
	}
	for _, in := range imported {
		if !in.hasCoords() || r.nodes[in.PublicKey] != nil || !p.matchesImported(in) || !p.inBBox(in.AdvLon, in.AdvLat) {
			continue
		}
		key := [2]int{int(math.Floor(in.AdvLon / size)), int(math.Floor(in.AdvLat / size))}
		c := cells[key]
		if c == nil {
			c = &cell{types: map[byte]int{}, minLon: in.AdvLon, minLat: in.AdvLat, maxLon: in.AdvLon, maxLat: in.AdvLat}
			cells[key] = c
		}
		c.count++
		c.sumLat += in.AdvLat
		c.sumLon += in.AdvLon
		c.types[byte(in.Type)]++
		c.minLon, c.maxLon = math.Min(c.minLon, in.AdvLon), math.Max(c.maxLon, in.AdvLon)
		c.minLat, c.maxLat = math.Min(c.minLat, in.AdvLat), math.Max(c.maxLat, in.AdvLat)
		if c.count == 1 {
			c.singleImported = in
		} else {
			c.single, c.singleImported = nil, nil
		}
	}

	for _, c := range cells {
		if c.count == 1 {
			if c.singleImported != nil {
				res.Features = append(res.Features, importedFeature(c.singleImported))
			} else {
				res.Features = append(res.Features, nodeFeature(c.single))
			}
			continue
		}
		dominant := byte(0)
		best := -1
		types := make(map[string]int, len(c.types))
		for t, n := range c.types {
			types[nodeTypeName(t)] = n
			if n > best {
				best, dominant = n, t
			}
		}
		res.Features = append(res.Features, pointFeature(c.sumLon/float64(c.count), c.sumLat/float64(c.count), map[string]any{
			"cluster":      true,
			"count":        c.count,
			"dominantType": dominant,
			"types":        types,
			"bbox":         [4]float64{c.minLon, c.minLat, c.maxLon, c.maxLat},
		}))
	}
	res.Returned = len(res.Features)
	return res
}
