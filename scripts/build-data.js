// Compiles every YAML file under data/ into a single data.json.
// Two data.json copies are written, with identical content:
//  - src/lib/generated/data.json : imported by the web app (Vite can't import
//    from the static/ public dir, so the importable copy lives under src/).
//  - static/data.json            : published verbatim and served at /data.json.
import {
  copyFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  statSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { latestReleaseSummary } from '../src/lib/releases.js';
import { METRICS } from '../src/lib/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, '..');

// Map of `data/<kind>/<id>` → ISO date of the most recent git commit that
// touched anything in that record's directory. Built in one `git log` pass
// (newest-first, so the first time a directory appears is its latest edit).
// Empty when git/history is unavailable (e.g. a shallow CI clone) — callers
// then fall back to filesystem mtime.
function gitDirLastModified(root) {
  const dirDate = new Map();
  let out;
  try {
    out = execFileSync('git', ['-C', root, 'log', '--name-only', '--format=%cI', '--', 'data'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    return dirDate;
  }
  let date = null;
  for (const line of out.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(line)) {
      date = line.trim();
      continue;
    }
    const parts = line.trim().split('/');
    if (parts.length >= 3 && parts[0] === 'data' && date) {
      const dir = parts.slice(0, 3).join('/');
      if (!dirDate.has(dir)) dirDate.set(dir, date);
    }
  }
  return dirDate;
}

// `source` metadata for a record: the canonical YAML path (for a "view source"
// link) and when it was last edited. Prefers the git commit date; falls back to
// the file's mtime so freshly-added, not-yet-committed records still show a date.
function recordSource(root, kind, id, file, dirDate) {
  const relPath = `data/${kind}/${id}/${file}`;
  let updatedAt = dirDate.get(`data/${kind}/${id}`) ?? null;
  if (!updatedAt) {
    try {
      updatedAt = statSync(join(root, relPath)).mtime.toISOString();
    } catch {
      updatedAt = null;
    }
  }
  return { path: relPath, updatedAt };
}

// Read a collection of `data/<kind>/<id>/<file>`. The record `id` is the
// directory name (never specified in the YAML itself).
function readDir(root, kind, file, dirDate) {
  const base = join(root, 'data', kind);
  const out = [];
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(base, d.name, file);
    if (!existsSync(path)) continue;
    const authored = load(readFileSync(path, 'utf8')) ?? {};
    const overlayPath = join(base, d.name, 'data.json');
    const overlay = existsSync(overlayPath)
      ? stripOverlayMeta(JSON.parse(readFileSync(overlayPath, 'utf8')))
      : {};
    out.push({
      id: d.name,
      ...deepMerge(authored, overlay),
      source: recordSource(root, kind, d.name, file, dirDate ?? new Map())
    });
  }
  return out;
}

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function stripOverlayMeta(value) {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('$')));
}

function deepMerge(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    out[key] = isPlainObject(out[key]) && isPlainObject(value) ? deepMerge(out[key], value) : value;
  }
  return out;
}

// Attach cached releases from a record's sibling changelog.yaml, if present.
// Shared by firmwares and software: renders each release's markdown notes and
// derives latest_version/released from the newest release. Records without a
// changelog file come back with `releases: []` so callers can treat them
// uniformly. `renderMarkdown` is passed in (it's dynamically imported by
// buildData to keep the markdown libs out of other entry points).
function attachChangelog(root, kind, record, renderMarkdown) {
  const clPath = join(root, 'data', kind, record.id, 'changelog.yaml');
  if (!existsSync(clPath)) return { ...record, releases: [] };
  const cl = load(readFileSync(clPath, 'utf8')) ?? {};
  const rawReleases = cl.releases ?? [];
  const { latest_version: _lv, released: _r, ...base } = record;
  return {
    ...base,
    ...latestReleaseSummary(rawReleases),
    releases: rawReleases.map((r) => ({
      ...r,
      notesHtml: renderMarkdown(r.notes, { baseUrl: record.repository })
    })),
    changelogSource: cl.source ?? null,
    changelogUpdatedAt: cl.updatedAt ?? null
  };
}

// Read every JSON Schema under schema/*.yaml into one importable bundle for the
// in-app schema explorer (src/routes/schemas). The full schema object is kept
// verbatim so the explorer can render properties, descriptions, constraints,
// $defs and examples; the source-of-truth remains the YAML files.
function readSchemas(root) {
  const dir = join(root, 'schema');
  if (!existsSync(dir)) return [];
  const out = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
    const schema = load(readFileSync(join(dir, file), 'utf8')) ?? {};
    const id = file.replace(/\.yaml$/, '');
    out.push({
      id,
      file: `schema/${file}`,
      title: typeof schema.title === 'string' ? schema.title : id,
      description: typeof schema.description === 'string' ? schema.description : '',
      schema
    });
  }
  return out;
}

// Read the shared parts catalog (data/globals.yaml). Optional.
function readGlobals(root) {
  const path = join(root, 'data', 'globals.yaml');
  if (!existsSync(path)) return {};
  return load(readFileSync(path, 'utf8')) ?? {};
}

function readCompatibility(root) {
  const base = join(root, 'data', 'compatibility');
  const records = [];
  if (existsSync(base)) {
    for (const fwDir of readdirSync(base, { withFileTypes: true })) {
      if (!fwDir.isDirectory()) continue;
      const fwPath = join(base, fwDir.name);
      for (const versionDir of readdirSync(fwPath, { withFileTypes: true })) {
        if (!versionDir.isDirectory()) continue;
        const versionPath = join(fwPath, versionDir.name);
        for (const file of readdirSync(versionPath, { withFileTypes: true })) {
          if (!file.isFile() || !file.name.endsWith('.yaml')) continue;
          const deviceId = file.name.replace(/\.yaml$/, '');
          const data = load(readFileSync(join(versionPath, file.name), 'utf8')) ?? {};
          records.push({
            firmwareId: fwDir.name,
            firmwareVersionSlug: versionDir.name,
            deviceId,
            ...data
          });
        }
      }
    }
  }

  return records.sort(
    (a, b) =>
      a.firmwareId.localeCompare(b.firmwareId) ||
      a.firmwareVersionSlug.localeCompare(b.firmwareVersionSlug) ||
      a.deviceId.localeCompare(b.deviceId)
  );
}

function writeJsonRecord(file, record) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n');
}

function cleanGeneratedDir(root, dir) {
  rmSync(join(root, 'static', dir), { recursive: true, force: true });
}

function buildRecordJson(root, { devices, firmwares, vendors, networks, software, compatibility }) {
  for (const dir of ['device', 'firmware', 'vendor', 'network', 'software', 'compatibility']) {
    cleanGeneratedDir(root, dir);
  }

  let count = 0;
  for (const device of devices) {
    writeJsonRecord(join(root, 'static', 'device', `${device.id}.json`), device);
    count += 1;
  }
  for (const firmware of firmwares) {
    writeJsonRecord(join(root, 'static', 'firmware', `${firmware.id}.json`), firmware);
    count += 1;
  }
  for (const vendor of vendors) {
    writeJsonRecord(join(root, 'static', 'vendor', `${vendor.id}.json`), vendor);
    count += 1;
  }
  for (const network of networks) {
    writeJsonRecord(join(root, 'static', 'network', `${network.id}.json`), network);
    count += 1;
  }
  for (const item of software) {
    writeJsonRecord(join(root, 'static', 'software', `${item.id}.json`), item);
    count += 1;
  }
  for (const report of compatibility) {
    writeJsonRecord(
      join(
        root,
        'static',
        'compatibility',
        report.firmwareId,
        report.firmwareVersionSlug,
        `${report.deviceId}.json`
      ),
      report
    );
    count += 1;
  }

  // Collection endpoints: the whole array for each kind at the static root, e.g.
  // /devices.json. Lets consumers grab an entire collection in one request
  // without downloading and parsing the full data.json.
  for (const [name, records] of [
    ['devices', devices],
    ['firmwares', firmwares],
    ['vendors', vendors],
    ['networks', networks],
    ['software', software],
    ['compatibility', compatibility]
  ]) {
    writeJsonRecord(join(root, 'static', `${name}.json`), records);
  }

  return count;
}

// Geodesic area of a GeoJSON geometry in square metres, via the standard
// spherical ring-area formula (Chamberlain & Duquette, as used by
// mapbox/geojson-area). Exterior rings add, interior rings (holes) subtract.
const WGS84_RADIUS = 6378137; // metres
const toRad = (deg) => (deg * Math.PI) / 180;

function ringArea(ring) {
  const len = ring.length;
  if (len < 3) return 0;
  let total = 0;
  for (let i = 0; i < len; i++) {
    let lowerIndex, middleIndex, upperIndex;
    if (i === len - 2) {
      lowerIndex = len - 2;
      middleIndex = len - 1;
      upperIndex = 0;
    } else if (i === len - 1) {
      lowerIndex = len - 1;
      middleIndex = 0;
      upperIndex = 1;
    } else {
      lowerIndex = i;
      middleIndex = i + 1;
      upperIndex = i + 2;
    }
    const p1 = ring[lowerIndex];
    const p2 = ring[middleIndex];
    const p3 = ring[upperIndex];
    total += (toRad(p3[0]) - toRad(p1[0])) * Math.sin(toRad(p2[1]));
  }
  return Math.abs((total * WGS84_RADIUS * WGS84_RADIUS) / 2);
}

function polygonArea(rings) {
  if (!rings?.length) return 0;
  return rings.reduce((sum, ring, i) => sum + (i === 0 ? ringArea(ring) : -ringArea(ring)), 0);
}

function geometryAreaM2(geometry) {
  if (!geometry) return 0;
  if (geometry.type === 'Polygon') return polygonArea(geometry.coordinates);
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.reduce((sum, poly) => sum + polygonArea(poly), 0);
  }
  return 0;
}

function geojsonAreaKm2(geojson) {
  const features = geojson?.features ?? (geojson?.geometry ? [geojson] : []);
  const m2 = features.reduce((sum, f) => sum + geometryAreaM2(f.geometry), 0);
  return m2 / 1e6;
}

function publishNetworkAreas(root, networks) {
  const outDir = join(root, 'static', 'network-area');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let count = 0;
  // One combined FeatureCollection so the map loads every area in a single
  // request instead of one fetch per network. Each feature is tagged with its
  // networkId/networkName so the client can regroup them per network.
  const combined = { type: 'FeatureCollection', features: [] };
  for (const network of networks) {
    if (!network.area) continue;
    const raw = readFileSync(join(root, 'data', 'networks', network.id, network.area), 'utf8');
    writeFileSync(join(outDir, `${network.id}.geojson`), raw);
    network.areaUrl = `/network-area/${network.id}.geojson`;
    let parsed;
    try {
      parsed = JSON.parse(raw);
      network.areaKm2 = Math.round(geojsonAreaKm2(parsed));
    } catch {
      // Leave areaKm2 unset (and out of the combined file) if it won't parse.
    }
    for (const feature of geojsonFeatures(parsed)) {
      combined.features.push({
        type: 'Feature',
        geometry: feature.geometry,
        properties: { ...(feature.properties ?? {}), networkId: network.id, networkName: network.name }
      });
    }
    count += 1;
  }
  writeFileSync(join(outDir, 'all.geojson'), JSON.stringify(combined));
  return count;
}

// Normalize any GeoJSON value (FeatureCollection, Feature, or bare geometry)
// to a flat list of Feature objects.
function geojsonFeatures(geojson) {
  if (!geojson) return [];
  if (geojson.type === 'FeatureCollection') return geojson.features ?? [];
  if (geojson.type === 'Feature') return [geojson];
  if (geojson.geometry) return [geojson];
  if (geojson.coordinates) return [{ type: 'Feature', geometry: geojson, properties: {} }];
  return [];
}

// Production origin; BASE_PATH is supplied by the GitHub Pages workflow when needed.
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? 'https://meshcore.ninja').replace(
  /\/+$/,
  ''
);
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

/** Write sitemap.xml + robots.txt from the compiled dataset. */
function buildSitemap(root, { devices, firmwares, vendors, networks, software, generatedAt }) {
  const lastmod = (generatedAt ?? new Date().toISOString()).slice(0, 10);
  const prefix = `${SITE_ORIGIN}${BASE_PATH}`;

  const paths = [
    '/',
    '/devices/',
    '/vendors/',
    '/networks/',
    '/software/',
    '/matrix/',
    '/releases/',
    '/schemas/',
    '/about/',
    ...METRICS.map((m) => `/device-rank/${m.id}/`),
    ...devices.map((d) => `/device/${d.id}/`),
    ...firmwares.flatMap((f) => [`/firmware/${f.id}/`, `/firmware/${f.id}/releases/`]),
    ...vendors.map((v) => `/vendor/${v.id}/`),
    ...networks.map((n) => `/network/${n.id}/`),
    ...software.flatMap((s) =>
      s.releases?.length ? [`/software/${s.id}/`, `/software/${s.id}/releases/`] : [`/software/${s.id}/`]
    )
  ];

  const urls = paths
    .map(
      (p) =>
        `  <url><loc>${prefix}${p}</loc><lastmod>${lastmod}</lastmod></url>`
    )
    .join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  // /compare/ is intentionally excluded from the sitemap and disallowed: it's a
  // query-param view with no stable, indexable content.
  const robots = `User-agent: *\nAllow: /\nDisallow: ${BASE_PATH}/compare/\n\nSitemap: ${prefix}/sitemap.xml\n`;

  writeFileSync(join(root, 'static', 'sitemap.xml'), sitemap);
  writeFileSync(join(root, 'static', 'robots.txt'), robots);
  return paths.length;
}

/** Compile the YAML sources and write both data.json copies. Returns counts. */
export async function buildData(root = defaultRoot) {
  // Dynamically imported so the markdown libs stay out of the Vite config bundle.
  const { renderMarkdown } = await import('./lib/markdown.js');

  const dirDate = gitDirLastModified(root);

  const vendors = readDir(root, 'vendors', 'vendor.yaml', dirDate).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  const networks = readDir(root, 'networks', 'network.yaml', dirDate).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const networkAreas = publishNetworkAreas(root, networks);

  const software = readDir(root, 'software', 'software.yaml', dirDate)
    .map((s) => attachChangelog(root, 'software', s, renderMarkdown))
    .sort((a, b) => a.name.localeCompare(b.name));

  const devices = readDir(root, 'devices', 'device.yaml', dirDate)
    .map((d) => ({ ...d, vendorName: vendorById.get(d.vendorId)?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Attach how many devices each vendor has.
  for (const v of vendors) {
    v.deviceCount = devices.filter((d) => d.vendorId === v.id).length;
  }

  const typeRank = { official: 0, fork: 1, custom: 2 };
  // Active firmwares first; among active ones the most-starred lead. Remaining
  // ties (and all non-active firmwares) are broken by type, then name.
  const statusRank = (s) => (s === 'active' ? 0 : 1);
  const stars = (fw) => fw.popularity?.githubStars ?? 0;
  const rawFirmwares = readDir(root, 'firmwares', 'firmware.yaml', dirDate);
  const compatibility = readCompatibility(root);
  const globals = readGlobals(root);

  const firmwares = rawFirmwares
    .map((fw) => attachChangelog(root, 'firmwares', fw, renderMarkdown))
    .sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      if (a.status === 'active') {
        const ds = stars(b) - stars(a);
        if (ds !== 0) return ds;
      }
      const ra = typeRank[a.type] ?? 9;
      const rb = typeRank[b.type] ?? 9;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });

  // The global data.json is imported into every page's shared bundle, so it must
  // stay lean. A record's releases carry the rendered changelog HTML
  // (notes/notesHtml, ~1MB — two thirds of the dataset) plus per-variant URLs and
  // titles. None of that is needed by the release listings (homepage feed,
  // /releases, /firmwares), which only show version/date/prerelease and a variant
  // count. The firmware and software detail pages, which DO render notes, fetch
  // the full per-record JSON instead. So ship only the listing fields here;
  // buildRecordJson() writes the full releases per record.
  const liteReleases = (releases) =>
    (releases ?? []).map(({ version, datetime, date, prerelease }) => ({
      version,
      ...(datetime != null ? { datetime } : {}),
      ...(date != null ? { date } : {}),
      ...(prerelease ? { prerelease } : {})
    }));
  const liteFirmwares = firmwares.map((fw) => ({ ...fw, releases: liteReleases(fw.releases) }));
  const liteSoftware = software.map((s) => ({ ...s, releases: liteReleases(s.releases) }));

  const dataset = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    counts: {
      firmwares: firmwares.length,
      devices: devices.length,
      vendors: vendors.length,
      networks: networks.length,
      networkAreas,
      software: software.length,
      compatibility: compatibility.length
    },
    firmwares: liteFirmwares,
    devices,
    vendors,
    networks,
    software: liteSoftware,
    compatibility,
    globals
  };

  const json = JSON.stringify(dataset, null, 2) + '\n';
  for (const target of [
    join(root, 'src', 'lib', 'generated', 'data.json'),
    join(root, 'static', 'data.json')
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, json);
  }

  // Schemas ship as their own bundle, not inside data.json: only the schema
  // explorer route needs them, and data.json is imported into every page's
  // shared bundle, so it must stay lean.
  const schemas = readSchemas(root);
  const schemaBundle = { generatedAt: dataset.generatedAt, schemas };
  const schemaJson = JSON.stringify(schemaBundle, null, 2) + '\n';
  for (const target of [
    join(root, 'src', 'lib', 'generated', 'schemas.json'),
    join(root, 'static', 'schemas.json')
  ]) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, schemaJson);
  }

  const sitemapUrls = buildSitemap(root, {
    devices,
    firmwares,
    vendors,
    networks,
    software,
    generatedAt: dataset.generatedAt
  });

  return {
    ...dataset.counts,
    recordsJson: buildRecordJson(root, { devices, firmwares, vendors, networks, software, compatibility }),
    sitemapUrls
  };
}

// Run as a CLI when invoked directly (npm run build:data / pre-hooks).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const {
    firmwares,
    devices,
    vendors,
    networks,
    software,
    compatibility,
    networkAreas,
    recordsJson,
    sitemapUrls
  } = await buildData();
  console.log(
    `✓ Wrote data.json — ${firmwares} firmware(s), ${devices} device(s), ${vendors} vendor(s), ${networks} network(s), ${networkAreas} network area(s), ${software} software, ${compatibility} compatibility report(s); ${recordsJson} record JSON file(s); ${sitemapUrls} sitemap URL(s).`
  );
}
