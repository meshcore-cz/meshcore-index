// The official MeshCore app ships a list of suggested radio presets
// (https://api.meshcore.nz/api/v1/config). We mirror each one as a `general`
// network record so it lives in the catalogue and can be tracked over time.
//
//   node scripts/check-app-presets.js            # check our presets vs upstream
//   node scripts/check-app-presets.js --out FILE # write the drift report to FILE
//   node scripts/check-app-presets.js --import   # create missing preset networks
//   node scripts/check-app-presets.js --import --force  # also overwrite existing
//
// The daily .github/workflows/app-presets.yml runs the check and opens/closes an
// issue from the report. "Drift" covers three cases: a preset network whose
// radio values no longer match upstream, a preset removed upstream, and a new
// upstream preset we haven't imported yet.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const CONFIG_URL = process.env.APP_CONFIG_URL ?? 'https://api.meshcore.nz/api/v1/config';

const args = process.argv.slice(2);
const importMode = args.includes('--import');
const force = args.includes('--force');
const outIndex = args.indexOf('--out');
const outFile = outIndex !== -1 ? args[outIndex + 1] : null;

async function fetchPresets() {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error(`${CONFIG_URL} → ${res.status} ${res.statusText}`);
  const json = await res.json();
  const entries = json?.config?.suggested_radio_settings?.entries;
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('Unexpected config shape: no suggested_radio_settings.entries');
  }
  return entries;
}

// --- Value normalization ----------------------------------------------------

function ourKnobs(radio) {
  if (!radio || radio.frequency_mhz == null) return null;
  const cr = radio.coding_rate ? Number(String(radio.coding_rate).split('/')[1]) : null;
  return { f: Number(radio.frequency_mhz), bw: Number(radio.bandwidth_khz), sf: Number(radio.spreading_factor), cr };
}
function presetKnobs(entry) {
  return { f: Number(entry.frequency), bw: Number(entry.bandwidth), sf: Number(entry.spreading_factor), cr: Number(entry.coding_rate) };
}
const knobsEqual = (a, b) => a && b && a.f === b.f && a.bw === b.bw && a.sf === b.sf && a.cr === b.cr;
const knobsLabel = (k) => (k ? `${k.f}MHz / SF${k.sf} / BW${k.bw} / CR${k.cr}` : '(incomplete)');

// Map an exact centre frequency to a data/globals.yaml band key.
function bandKey(mhz) {
  if (mhz < 450) return '433';
  if (mhz < 800) return '470';
  if (mhz >= 863 && mhz <= 870) return '868';
  if (mhz >= 902 && mhz < 920) return '915';
  if (mhz >= 920 && mhz < 921) return '920';
  if (mhz >= 921 && mhz <= 928) return '923';
  return '915';
}

const slugify = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const yamlSingle = (s) => `'${String(s).replace(/'/g, "''")}'`;

// --- Read our networks ------------------------------------------------------

function radioSettings(net) {
  if (Array.isArray(net.radios)) return net.radios;
  return net.radio ? [net.radio] : [];
}

function readNetworks() {
  const base = join(root, 'data', 'networks');
  const out = [];
  for (const d of readdirSync(base, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const path = join(base, d.name, 'network.yaml');
    if (!existsSync(path)) continue;
    out.push({ id: d.name, path, data: load(readFileSync(path, 'utf8')) ?? {} });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

// Every (network, radio) pair that declares an app_preset FK.
function declaredPresets(networks) {
  const out = [];
  for (const net of networks) {
    for (const radio of radioSettings(net.data)) {
      if (radio.app_preset) out.push({ net, radio, title: radio.app_preset });
    }
  }
  return out;
}

// --- Drift check ------------------------------------------------------------

function checkDrift(networks, entries) {
  const byTitle = new Map(entries.map((e) => [e.title, e]));
  const declared = declaredPresets(networks);
  const declaredTitles = new Set(declared.map((d) => d.title));
  const problems = [];

  for (const { net, radio, title } of declared) {
    const entry = byTitle.get(title);
    if (!entry) {
      problems.push({ kind: 'removed', id: net.id, name: net.data.name ?? net.id, title, detail: `preset \`${title}\` was removed from the app config` });
      continue;
    }
    if (!knobsEqual(ourKnobs(radio), presetKnobs(entry))) {
      problems.push({
        kind: 'changed',
        id: net.id,
        name: net.data.name ?? net.id,
        title,
        detail: `values changed — ours: ${knobsLabel(ourKnobs(radio))} · app: ${knobsLabel(presetKnobs(entry))}`
      });
    }
  }

  for (const entry of entries) {
    if (!declaredTitles.has(entry.title)) {
      problems.push({ kind: 'new', id: '—', name: '—', title: entry.title, detail: `new upstream preset (${entry.description}) not yet imported` });
    }
  }
  return problems;
}

function renderReport(problems) {
  const lines = [
    '### Radio preset drift vs the official MeshCore app',
    '',
    `Source: ${CONFIG_URL}`,
    '',
    'Our `general` preset networks no longer match the official app config:',
    '',
    '| Network | Preset | Change |',
    '| ------- | ------ | ------ |',
    ...problems.map((p) => `| ${p.id === '—' ? '—' : `\`${p.id}\` (${p.name})`} | ${p.title} | ${p.detail} |`),
    '',
    'Run `node scripts/check-app-presets.js --import` to create new preset',
    'networks, or update the affected `data/networks/<id>/network.yaml` radio',
    'values (and `app_preset`) to match, then this issue auto-closes.',
    '',
    '_Generated by `scripts/check-app-presets.js`._'
  ];
  return lines.join('\n') + '\n';
}

// --- Import: generate one `general` network per preset ----------------------

// ISO-3166 alpha-2 codes for a preset title (EU/US used as broad regions, as
// elsewhere in the data). Empty ⇒ no coverage block is written.
function countriesFor(title) {
  const t = title.toLowerCase();
  if (t.includes('australia')) return ['AU'];
  if (t.includes('brazil')) return ['BR'];
  if (t.startsWith('eu/uk')) return ['EU', 'GB'];
  if (t.includes('eu 433')) return ['EU'];
  if (t.includes('netherlands')) return ['NL'];
  if (t.includes('new zealand')) return ['NZ'];
  if (t.includes('portugal')) return ['PT'];
  if (t.includes('vietnam')) return ['VN'];
  if (t.includes('switzerland')) return ['CH'];
  if (t.includes('czech')) return ['CZ'];
  if (t.includes('usa/canada')) return ['US', 'CA'];
  return [];
}

function presetYaml(entry) {
  const mhz = Number(entry.frequency);
  const deprecated = /deprecated/i.test(entry.title);
  const countries = countriesFor(entry.title);
  // Preserve a hand-built coverage shape across regeneration if one exists.
  const hasArea = existsSync(join(root, 'data', 'networks', slugify(entry.title), 'area.geojson'));
  const lines = [
    '# Generated from the official MeshCore app radio presets',
    '# (https://api.meshcore.nz/api/v1/config) and tracked for drift by',
    '# .github/workflows/app-presets.yml. The radio values mirror upstream —',
    '# change them there, not here; `app_preset` is the upstream foreign key.',
    `name: ${yamlSingle(entry.title)}`,
    'scope: general',
    'status: active',
    `description: ${yamlSingle(`Official MeshCore app radio preset — ${entry.description}.`)}`
  ];
  if (deprecated) {
    lines.push('deprecated: true');
  }
  if (hasArea) {
    lines.push('area: area.geojson');
  }
  if (countries.length) {
    lines.push('coverage:', '  countries:', ...countries.map((c) => `    - ${c}`));
  }
  lines.push('radio:');
  return [
    ...lines,
    `  frequency: '${bandKey(mhz)}'`,
    `  frequency_mhz: ${mhz}`,
    `  bandwidth_khz: ${Number(entry.bandwidth)}`,
    `  spreading_factor: ${Number(entry.spreading_factor)}`,
    `  coding_rate: 4/${Number(entry.coding_rate)}`,
    `  app_preset: ${yamlSingle(entry.title)}`,
    ''
  ].join('\n');
}

const GENERATED_MARKER = 'Generated from the official MeshCore app';

function importPresets(networks, entries) {
  // Presets bound to a hand-authored network (national or general) keep that
  // binding and don't get a standalone general network. Our own generated
  // preset networks carry an app_preset too, but must stay regenerable, so they
  // are excluded here by their marker comment.
  const boundTitles = new Set();
  for (const net of networks) {
    if (readFileSync(net.path, 'utf8').includes(GENERATED_MARKER)) continue;
    for (const radio of radioSettings(net.data)) {
      if (radio.app_preset) boundTitles.add(radio.app_preset);
    }
  }

  let created = 0;
  let updated = 0;
  let bound = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (boundTitles.has(entry.title)) {
      bound += 1;
      continue;
    }
    const slug = slugify(entry.title);
    const dir = join(root, 'data', 'networks', slug);
    const path = join(dir, 'network.yaml');
    const exists = existsSync(path);

    if (exists) {
      const generated = readFileSync(path, 'utf8').includes(GENERATED_MARKER);
      if (!generated) {
        console.warn(`skip ${slug}: directory exists and is not a generated preset network`);
        skipped += 1;
        continue;
      }
      if (!force) {
        skipped += 1;
        continue;
      }
    }

    mkdirSync(dir, { recursive: true });
    writeFileSync(path, presetYaml(entry));
    if (exists) {
      updated += 1;
      console.log(`updated ${slug} → "${entry.title}"`);
    } else {
      created += 1;
      console.log(`created ${slug} → "${entry.title}"`);
    }
  }
  console.log(
    `\nCreated ${created}, updated ${updated}, ${bound} bound to existing network(s), skipped ${skipped} — of ${entries.length} preset(s).`
  );
  if (!force && skipped) console.log('(existing generated files left untouched — pass --force to overwrite them.)');
}

// --- Main -------------------------------------------------------------------

async function main() {
  const entries = await fetchPresets();
  const networks = readNetworks();

  if (importMode) {
    importPresets(networks, entries);
    return;
  }

  const problems = checkDrift(networks, entries);
  const drift = problems.length > 0;

  if (drift) {
    const report = renderReport(problems);
    if (outFile) writeFileSync(outFile, report);
    console.error(report);
    console.error(`✗ ${problems.length} preset drift issue(s).`);
  } else {
    if (outFile) writeFileSync(outFile, '');
    console.log('✓ Preset networks match the official app config.');
  }
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `drift=${drift}\n`);
}

main().catch((e) => {
  console.error(`check-app-presets failed: ${e.message}`);
  process.exit(1);
});
