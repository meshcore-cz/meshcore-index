// Compiles every YAML file under data/ into a single data.json.
// Two data.json copies are written, with identical content:
//  - src/lib/generated/data.json : imported by the web app (Vite can't import
//    from the static/ public dir, so the importable copy lives under src/).
//  - static/data.json            : published verbatim and served at /data.json.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { latestReleaseSummary } from '../src/lib/releases.js';
import { METRICS } from '../src/lib/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(here, '..');

// Read a collection of `data/<kind>/<id>/<file>`. The record `id` is the
// directory name (never specified in the YAML itself).
function readDir(root, kind, file) {
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
    out.push({ id: d.name, ...deepMerge(authored, overlay) });
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

function buildRecordJson(root, { devices, firmwares, vendors, compatibility }) {
  for (const dir of ['device', 'firmware', 'vendor', 'compatibility']) {
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

  return count;
}

// Production origin; BASE_PATH is supplied by the GitHub Pages workflow when needed.
const SITE_ORIGIN = (process.env.SITE_ORIGIN ?? 'https://meshcore.ninja').replace(
  /\/+$/,
  ''
);
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');

/** Write sitemap.xml + robots.txt from the compiled dataset. */
function buildSitemap(root, { devices, firmwares, vendors, generatedAt }) {
  const lastmod = (generatedAt ?? new Date().toISOString()).slice(0, 10);
  const prefix = `${SITE_ORIGIN}${BASE_PATH}`;

  const paths = [
    '/',
    '/devices/',
    '/vendors/',
    '/matrix/',
    '/releases/',
    '/about/',
    ...METRICS.map((m) => `/device-rank/${m.id}/`),
    ...devices.map((d) => `/device/${d.id}/`),
    ...firmwares.flatMap((f) => [`/firmware/${f.id}/`, `/firmware/${f.id}/releases/`]),
    ...vendors.map((v) => `/vendor/${v.id}/`)
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

  const vendors = readDir(root, 'vendors', 'vendor.yaml').sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const vendorById = new Map(vendors.map((v) => [v.id, v]));

  const devices = readDir(root, 'devices', 'device.yaml')
    .map((d) => ({ ...d, vendorName: vendorById.get(d.vendorId)?.name ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Attach how many devices each vendor has.
  for (const v of vendors) {
    v.deviceCount = devices.filter((d) => d.vendorId === v.id).length;
  }

  const typeRank = { official: 0, fork: 1, custom: 2 };
  // Active firmwares first, then everything else; ties broken by type, then name.
  const statusRank = (s) => (s === 'active' ? 0 : 1);
  const rawFirmwares = readDir(root, 'firmwares', 'firmware.yaml');
  const compatibility = readCompatibility(root);
  const globals = readGlobals(root);

  const firmwares = rawFirmwares
    .map((fw) => {
      // Attach cached releases from the sibling changelog.yaml, if present.
      const clPath = join(root, 'data', 'firmwares', fw.id, 'changelog.yaml');
      if (existsSync(clPath)) {
        const cl = load(readFileSync(clPath, 'utf8')) ?? {};
        const rawReleases = cl.releases ?? [];
        const { latest_version: _lv, released: _r, ...fwBase } = fw;
        return {
          ...fwBase,
          ...latestReleaseSummary(rawReleases),
          releases: rawReleases.map((r) => ({
            ...r,
            notesHtml: renderMarkdown(r.notes)
          })),
          changelogSource: cl.source ?? null,
          changelogUpdatedAt: cl.updatedAt ?? null
        };
      }
      return { ...fw, releases: [] };
    })
    .sort((a, b) => {
      const sa = statusRank(a.status);
      const sb = statusRank(b.status);
      if (sa !== sb) return sa - sb;
      const ra = typeRank[a.type] ?? 9;
      const rb = typeRank[b.type] ?? 9;
      return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
    });

  const dataset = {
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    counts: {
      firmwares: firmwares.length,
      devices: devices.length,
      vendors: vendors.length,
      compatibility: compatibility.length
    },
    firmwares,
    devices,
    vendors,
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

  const sitemapUrls = buildSitemap(root, {
    devices,
    firmwares,
    vendors,
    generatedAt: dataset.generatedAt
  });

  return {
    ...dataset.counts,
    recordsJson: buildRecordJson(root, { devices, firmwares, vendors, compatibility }),
    sitemapUrls
  };
}

// Run as a CLI when invoked directly (npm run build:data / pre-hooks).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { firmwares, devices, vendors, compatibility, recordsJson, sitemapUrls } = await buildData();
  console.log(
    `✓ Wrote data.json — ${firmwares} firmware(s), ${devices} device(s), ${vendors} vendor(s), ${compatibility} compatibility report(s); ${recordsJson} record JSON file(s); ${sitemapUrls} sitemap URL(s).`
  );
}
