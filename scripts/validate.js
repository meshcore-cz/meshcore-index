// Validates every YAML record against its JSON Schema (schema/*.yaml)
// and checks referential integrity between firmwares, devices and vendors.
// Run with: npm run validate
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv({ allErrors: true });

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

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

function loadSchema(name) {
  return ajv.compile(load(readFileSync(join(root, 'schema', `${name}.yaml`), 'utf8')));
}

// Read `data/<kind>/<id>/<file>`, returning { id, dir, data } records.
function readCollection(kind, file) {
  const base = join(root, 'data', kind);
  if (!existsSync(base)) return [];
  const out = [];
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(base, d.name, file);
    if (!existsSync(path)) {
      err(`${kind}/${d.name}`, `missing ${file}`);
      continue;
    }
    if (!/^[a-z0-9-]+$/.test(d.name)) {
      err(`${kind}/${d.name}`, 'directory name (used as id) must be kebab-case [a-z0-9-]');
    }
    let data;
    try {
      data = load(readFileSync(path, 'utf8'));
    } catch (e) {
      err(`${kind}/${d.name}`, `YAML parse error: ${e.message}`);
      continue;
    }
    const overlayPath = join(base, d.name, 'data.json');
    if (existsSync(overlayPath)) {
      try {
        data = deepMerge(
          data ?? {},
          stripOverlayMeta(JSON.parse(readFileSync(overlayPath, 'utf8')))
        );
      } catch (e) {
        err(`${kind}/${d.name}/data.json`, `JSON parse error: ${e.message}`);
      }
    }
    out.push({ id: d.name, where: `${kind}/${d.name}`, data: data ?? {} });
  }
  return out;
}

function validateAll(records, validate) {
  for (const r of records) {
    if (!validate(r.data)) {
      for (const e of validate.errors) {
        err(r.where, `${e.instancePath || '/'} ${e.message}`);
      }
    }
  }
}

const deviceSchema = loadSchema('device');
const firmwareSchema = loadSchema('firmware');
const vendorSchema = loadSchema('vendor');
const changelogSchema = loadSchema('changelog');
const compatibilitySchema = loadSchema('compatibility');
const globalsSchema = loadSchema('globals');

const vendors = readCollection('vendors', 'vendor.yaml');
const devices = readCollection('devices', 'device.yaml');
const firmwares = readCollection('firmwares', 'firmware.yaml');
const compatibility = [];

validateAll(vendors, vendorSchema);
validateAll(devices, deviceSchema);
validateAll(firmwares, firmwareSchema);

const compatibilityBase = join(root, 'data', 'compatibility');
if (existsSync(compatibilityBase)) {
  for (const fwDir of readdirSync(compatibilityBase, { withFileTypes: true })) {
    if (!fwDir.isDirectory()) continue;
    for (const versionDir of readdirSync(join(compatibilityBase, fwDir.name), {
      withFileTypes: true
    })) {
      if (!versionDir.isDirectory()) continue;
      const versionPath = join(compatibilityBase, fwDir.name, versionDir.name);
      for (const file of readdirSync(versionPath, { withFileTypes: true })) {
        if (!file.isFile()) continue;
        if (!file.name.endsWith('.yaml')) {
          err(`compatibility/${fwDir.name}/${versionDir.name}/${file.name}`, 'must be a .yaml file');
          continue;
        }
        const deviceId = file.name.replace(/\.yaml$/, '');
        const where = `compatibility/${fwDir.name}/${versionDir.name}/${file.name}`;
        let data;
        try {
          data = load(readFileSync(join(versionPath, file.name), 'utf8'));
        } catch (e) {
          err(where, `YAML parse error: ${e.message}`);
          continue;
        }
        compatibility.push({
          firmwareId: fwDir.name,
          firmwareVersion: versionDir.name,
          deviceId,
          where,
          data: data ?? {}
        });
        if (!compatibilitySchema(data ?? {})) {
          for (const e of compatibilitySchema.errors) {
            err(where, `${e.instancePath || '/'} ${e.message}`);
          }
        }
      }
    }
  }
}

// Optional shared parts catalog (data/globals.yaml).
let globalsData = null;
const globalsPath = join(root, 'data', 'globals.yaml');
if (existsSync(globalsPath)) {
  try {
    globalsData = load(readFileSync(globalsPath, 'utf8'));
  } catch (e) {
    err('globals', `YAML parse error: ${e.message}`);
  }
  if (globalsData != null && !globalsSchema(globalsData)) {
    for (const e of globalsSchema.errors) {
      err('globals', `${e.instancePath || '/'} ${e.message}`);
    }
  }
}
const refIds = new Set(Object.keys(globalsData?.refs ?? {}));

// Optional changelog.yaml alongside each firmware.
for (const f of firmwares) {
  const path = join(root, 'data', 'firmwares', f.id, 'changelog.yaml');
  if (!existsSync(path)) continue;
  let cl;
  try {
    cl = load(readFileSync(path, 'utf8'));
  } catch (e) {
    err(`firmwares/${f.id}/changelog`, `YAML parse error: ${e.message}`);
    continue;
  }
  if (!changelogSchema(cl)) {
    for (const e of changelogSchema.errors) {
      err(`firmwares/${f.id}/changelog`, `${e.instancePath || '/'} ${e.message}`);
    }
  }
  if (f.data.latest_version) {
    err(f.where, 'latest_version must not be set when changelog.yaml exists — it is computed at build time');
  }
  if (f.data.released) {
    err(f.where, 'released must not be set when changelog.yaml exists — it is computed at build time');
  }
}

// Every `refs` key must name a ref database registered in globals.refs.
for (const r of [...vendors, ...devices, ...firmwares]) {
  for (const key of Object.keys(r.data.refs ?? {})) {
    if (!refIds.has(key)) {
      err(r.where, `refs key "${key}" is not defined in data/globals.yaml refs`);
    }
  }
}

// Referential integrity.
const vendorIds = new Set(vendors.map((v) => v.id));
const deviceIds = new Set(devices.map((d) => d.id));
const firmwareIds = new Set(firmwares.map((f) => f.id));
const firmwareDeviceIds = new Map(
  firmwares.map((f) => [f.id, new Set((f.data.devices ?? []).map((d) => d.id))])
);

for (const d of devices) {
  if (d.data.vendorId && !vendorIds.has(d.data.vendorId)) {
    err(d.where, `vendorId "${d.data.vendorId}" has no data/vendors/ entry`);
  }
  if (d.data.variantOf && !deviceIds.has(d.data.variantOf)) {
    err(d.where, `variantOf "${d.data.variantOf}" has no data/devices/ entry`);
  }
  if (d.data.replaces && !deviceIds.has(d.data.replaces)) {
    err(d.where, `replaces "${d.data.replaces}" has no data/devices/ entry`);
  }
  if (d.data.image) {
    const imagePath = join(root, 'data', 'devices', d.id, d.data.image);
    if (!existsSync(imagePath)) {
      err(d.where, `image "${d.data.image}" file not found`);
    }
  }
  if (d.data.datasheet) {
    const datasheetPath = join(root, 'data', 'devices', d.id, d.data.datasheet);
    if (!existsSync(datasheetPath)) {
      err(d.where, `datasheet "${d.data.datasheet}" file not found`);
    }
  }
}
for (const f of firmwares) {
  for (const ref of f.data.devices ?? []) {
    if (ref.id && !deviceIds.has(ref.id)) {
      err(f.where, `device "${ref.id}" has no data/devices/ entry`);
    }
  }
}
for (const c of compatibility) {
  if (!firmwareIds.has(c.firmwareId)) {
    err(c.where, `firmware "${c.firmwareId}" has no data/firmwares/ entry`);
  }
  if (!deviceIds.has(c.deviceId)) {
    err(c.where, `device "${c.deviceId}" has no data/devices/ entry`);
  }
  if (firmwareIds.has(c.firmwareId) && !firmwareDeviceIds.get(c.firmwareId)?.has(c.deviceId)) {
    err(c.where, `device "${c.deviceId}" is not listed in firmware "${c.firmwareId}" devices`);
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(
  `✓ valid — ${firmwares.length} firmware(s), ${devices.length} device(s), ${vendors.length} vendor(s), ${compatibility.length} compatibility report(s).`
);
