// Validates every YAML record against its JSON Schema (schema/*.schema.json)
// and checks referential integrity between firmwares, devices and vendors.
// Run with: npm run validate
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import Ajv from 'ajv/dist/2020.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ajv = new Ajv({ allErrors: true });

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function loadSchema(name) {
  return ajv.compile(
    JSON.parse(readFileSync(join(root, 'schema', `${name}.schema.json`), 'utf8'))
  );
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
      data = yaml.load(readFileSync(path, 'utf8'));
    } catch (e) {
      err(`${kind}/${d.name}`, `YAML parse error: ${e.message}`);
      continue;
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

const vendors = readCollection('vendors', 'vendor.yaml');
const devices = readCollection('devices', 'device.yaml');
const firmwares = readCollection('firmwares', 'firmware.yaml');

validateAll(vendors, vendorSchema);
validateAll(devices, deviceSchema);
validateAll(firmwares, firmwareSchema);

// Referential integrity.
const vendorIds = new Set(vendors.map((v) => v.id));
const deviceIds = new Set(devices.map((d) => d.id));

for (const d of devices) {
  if (d.data.vendorId && !vendorIds.has(d.data.vendorId)) {
    err(d.where, `vendorId "${d.data.vendorId}" has no data/vendors/ entry`);
  }
}
for (const f of firmwares) {
  for (const ref of f.data.devices ?? []) {
    if (ref.id && !deviceIds.has(ref.id)) {
      err(f.where, `device "${ref.id}" has no data/devices/ entry`);
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(
  `✓ valid — ${firmwares.length} firmware(s), ${devices.length} device(s), ${vendors.length} vendor(s).`
);
