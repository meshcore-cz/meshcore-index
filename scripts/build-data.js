// Compiles every YAML file under data/ into a single data.json, and publishes
// JSON copies of the YAML schemas.
// Two data.json copies are written, with identical content:
//  - src/lib/generated/data.json : imported by the web app (Vite can't import
//    from the static/ public dir, so the importable copy lives under src/).
//  - static/data.json            : published verbatim and served at /data.json.
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

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
    out.push({ id: d.name, ...(yaml.load(readFileSync(path, 'utf8')) ?? {}) });
  }
  return out;
}

// Read the shared parts catalog (data/globals.yaml). Optional.
function readGlobals(root) {
  const path = join(root, 'data', 'globals.yaml');
  if (!existsSync(path)) return {};
  return yaml.load(readFileSync(path, 'utf8')) ?? {};
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
          const data = yaml.load(readFileSync(join(versionPath, file.name), 'utf8')) ?? {};
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

function buildSchemas(root) {
  const schemaDir = join(root, 'schema');
  const outDir = join(root, 'static', 'schema');
  mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.yaml')).sort()) {
    const schema = yaml.load(readFileSync(join(schemaDir, file), 'utf8')) ?? {};
    const publicName = file.replace(/\.yaml$/, '.json');
    if (typeof schema.$id === 'string') {
      schema.$id = schema.$id.replace(/\/schema\/[^/]+$/, `/schema/${publicName}`);
    }
    writeFileSync(join(outDir, publicName), JSON.stringify(schema, null, 2) + '\n');
    count += 1;
  }
  return count;
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
  const rawFirmwares = readDir(root, 'firmwares', 'firmware.yaml');
  const compatibility = readCompatibility(root);
  const globals = readGlobals(root);

  const firmwares = rawFirmwares
    .map((fw) => {
      // Attach cached releases from the sibling changelog.yaml, if present.
      const clPath = join(root, 'data', 'firmwares', fw.id, 'changelog.yaml');
      if (existsSync(clPath)) {
        const cl = yaml.load(readFileSync(clPath, 'utf8')) ?? {};
        return {
          ...fw,
          releases: (cl.releases ?? []).map((r) => ({
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

  return { ...dataset.counts, schemas: buildSchemas(root) };
}

// Run as a CLI when invoked directly (npm run build:data / pre-hooks).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { firmwares, devices, vendors, compatibility, schemas } = await buildData();
  console.log(
    `✓ Wrote data.json — ${firmwares} firmware(s), ${devices} device(s), ${vendors} vendor(s), ${compatibility} compatibility report(s); ${schemas} schema(s).`
  );
}
