// Generates per-item Open Graph (social) card PNGs for every device, firmware,
// vendor and network, written to static/og/<kind>/<id>.png (1200×630).
//
// Pipeline: a Satori VNode tree (plain objects, no JSX) -> SVG -> @resvg/resvg-js
// -> PNG. Device art and SVG vendor logos are pre-rasterized to PNG and embedded
// as data URIs so the final resvg pass never depends on nested-SVG rendering.
//
// Content-hash cached: each card's PNG is only re-rendered when its data slice,
// embedded image bytes or TEMPLATE_VERSION change (manifest at .cache/og). Stale
// PNGs (ids removed from the dataset) are pruned.
import {
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  mkdirSync,
  rmSync
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

// Firmware type → label. Mirrors TYPE_META in src/lib/data.js (kept inline so
// this script stays runnable under plain Node, without Vite's $lib/glob).
const TYPE_META = {
  official: { label: 'Official' },
  fork: { label: 'Fork' },
  custom: { label: 'Custom' }
};

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// Bump to invalidate every cached card after a template change.
const TEMPLATE_VERSION = 2;

const W = 1200;
const H = 630;

// Brand palette — mirrors the dark tokens in src/app.css.
const C = {
  bg: '#0d1117',
  elev: '#161b22',
  elev2: '#1c2430',
  edge: '#2a3340',
  ink: '#e6edf3',
  dim: '#9aa7b4',
  accent: '#4dd0a7',
  accent2: '#5aa9ff',
  ok: '#3fb950',
  warn: '#d29922',
  muted: '#8b949e',
  bad: '#f85149'
};

const STATUS_COLOR = {
  supported: C.ok,
  partial: C.warn,
  untested: C.muted,
  unsupported: C.bad
};

// ── Fonts ──────────────────────────────────────────────────────────────────
const fontDir = join(root, 'node_modules/@fontsource/inter/files');
const fonts = [
  { name: 'Inter', weight: 400, style: 'normal', data: readFileSync(join(fontDir, 'inter-latin-400-normal.woff')) },
  { name: 'Inter', weight: 600, style: 'normal', data: readFileSync(join(fontDir, 'inter-latin-600-normal.woff')) },
  { name: 'Inter', weight: 700, style: 'normal', data: readFileSync(join(fontDir, 'inter-latin-700-normal.woff')) }
];

// ── Tiny hyperscript for Satori VNodes ───────────────────────────────────────
// Satori expects React-element-shaped objects: { type, props: { style, children } }.
function h(type, style, children) {
  return { type, props: { style, children } };
}
function text(value, style) {
  return { type: 'div', props: { style: { display: 'flex', ...style }, children: String(value) } };
}

// ── Image helpers ────────────────────────────────────────────────────────────
const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

// Rasterize an SVG buffer to a PNG data URI at a fixed width (keeps the final
// card crisp and sidesteps resvg's lack of nested-SVG support inside <img>).
function svgToPngDataUri(svgBuf, width) {
  const png = new Resvg(svgBuf, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)'
  })
    .render()
    .asPng();
  return { uri: dataUri(png, 'image/png'), bytes: png };
}

// Resolve + load a device's art SVG (data/devices/<id>/*.svg).
function loadDeviceImage(id) {
  const dir = join(root, 'data', 'devices', id);
  if (!existsSync(dir)) return null;
  const svg = readdirSync(dir).find((f) => f.toLowerCase().endsWith('.svg'));
  if (!svg) return null;
  const buf = readFileSync(join(dir, svg));
  const { uri, bytes } = svgToPngDataUri(buf, 760);
  return { uri, bytes };
}

// Resolve + load a vendor logo (svg rasterized; png/jpg embedded as-is).
function loadVendorImage(id) {
  const dir = join(root, 'data', 'vendors', id);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find((f) => /\.(svg|png|jpe?g)$/i.test(f));
  if (!file) return null;
  const buf = readFileSync(join(dir, file));
  if (/\.svg$/i.test(file)) {
    const { uri, bytes } = svgToPngDataUri(buf, 480);
    return { uri, bytes };
  }
  const mime = /\.png$/i.test(file) ? 'image/png' : 'image/jpeg';
  return { uri: dataUri(buf, mime), bytes: buf };
}

// ── Shared chrome ────────────────────────────────────────────────────────────
const logoBuf = readFileSync(join(root, 'static', 'logo.png'));
const logoUri = dataUri(logoBuf, 'image/png');

function footer() {
  return h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      gap: '14px',
      marginTop: '36px'
    },
    [
      { type: 'img', props: { src: logoUri, width: 40, height: 40, style: { borderRadius: '8px' } } },
      text('MeshCore Ninja', { fontSize: 26, fontWeight: 700, color: C.ink }),
      text('·', { fontSize: 26, color: C.edge }),
      text('meshcore.ninja', { fontSize: 24, color: C.dim })
    ]
  );
}

function kicker(label, color) {
  return h(
    'div',
    {
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      fontSize: 22,
      fontWeight: 600,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color
    },
    [h('div', { display: 'flex', width: '14px', height: '14px', borderRadius: '50%', backgroundColor: color }, ''), label]
  );
}

function chip(label) {
  return text(label, {
    fontSize: 24,
    fontWeight: 600,
    color: C.ink,
    backgroundColor: C.elev2,
    border: `1px solid ${C.edge}`,
    borderRadius: '999px',
    padding: '8px 18px'
  });
}

// Outer canvas shared by every card.
function frame(children, accent = C.accent) {
  return h(
    'div',
    {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      backgroundColor: C.bg,
      color: C.ink,
      fontFamily: 'Inter',
      padding: '56px',
      position: 'relative'
    },
    [
      // top accent hairline
      h('div', { display: 'flex', position: 'absolute', top: 0, left: 0, right: 0, height: '8px', backgroundColor: accent }, ''),
      h('div', { display: 'flex', flex: 1, minHeight: 0 }, children),
      footer()
    ]
  );
}

// Generic placeholder glyph for items without artwork.
function placeholderGlyph() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="200" height="200"><g fill="none" stroke="${C.dim}" stroke-width="1.4" stroke-linecap="round"><rect x="7" y="4" width="10" height="16" rx="1.8" stroke-width="1.8"/><path d="M10 2.8v2.4M14 2.8v2.4M10 18.8v2.4M14 18.8v2.4M5.2 8h2.4M5.2 12h2.4M5.2 16h2.4M16.4 8h2.4M16.4 12h2.4M16.4 16h2.4"/></g></svg>`;
  return svgToPngDataUri(Buffer.from(svg), 320).uri;
}

// Auto-shrink a display title based on its length so long names still fit.
function titleSize(name, big = 64, small = 40) {
  const n = name.length;
  if (n <= 18) return big;
  if (n <= 30) return Math.round((big + small) / 2);
  return small;
}

// ── Templates ────────────────────────────────────────────────────────────────
function deviceCard(d, img) {
  const status = d.status || d.lifecycle;
  const accent = STATUS_COLOR[status] || C.accent;
  const chips = [];
  const mcu = d.hardware?.mcu?.model;
  if (mcu) chips.push(chip(mcu.toUpperCase()));
  if (Array.isArray(d.transports) && d.transports.length) {
    chips.push(chip(d.transports.map((t) => t.toUpperCase()).join(' · ')));
  }
  if (d.price?.amount) chips.push(chip(`${d.price.amount} ${d.price.currency || ''}`.trim()));

  const panel = h(
    'div',
    {
      display: 'flex',
      width: '44%',
      height: '100%',
      backgroundColor: C.elev,
      border: `1px solid ${C.edge}`,
      borderRadius: '24px',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px'
    },
    [{ type: 'img', props: { src: img?.uri || placeholderGlyph(), style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } } }]
  );

  const info = h(
    'div',
    { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '22px', paddingRight: '8px' },
    [
      kicker('Device', accent),
      text(d.name, { fontSize: titleSize(d.name), fontWeight: 700, color: C.ink, lineHeight: 1.05 }),
      d.vendorName ? text(d.vendorName, { fontSize: 30, color: C.dim }) : null,
      chips.length ? h('div', { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px' }, chips) : null
    ].filter(Boolean)
  );

  return frame(
    [h('div', { display: 'flex', flex: 1, gap: '44px', alignItems: 'stretch' }, [info, panel])],
    accent
  );
}

function firmwareCard(fw) {
  const type = TYPE_META[fw.type];
  const accent = fw.type === 'official' ? C.accent : fw.type === 'fork' ? C.accent2 : C.warn;
  const supported = (fw.devices || []).filter((x) => x.status === 'supported').length;
  const repoHost = (() => {
    try {
      return new URL(fw.repository).host.replace(/^www\./, '');
    } catch {
      return null;
    }
  })();
  const meta = [];
  if (supported) meta.push(chip(`${supported} device${supported === 1 ? '' : 's'} supported`));
  if (fw.latest_version) meta.push(chip(`v${String(fw.latest_version).replace(/^v/, '')}`));
  if (fw.license) meta.push(chip(fw.license));

  return frame(
    [
      h('div', { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '26px' }, [
        kicker(type ? `${type.label} firmware` : 'Firmware', accent),
        text(fw.name, { fontSize: titleSize(fw.name, 72, 46), fontWeight: 700, color: C.ink, lineHeight: 1.05 }),
        fw.description
          ? text(clamp(fw.description, 140), { fontSize: 28, color: C.dim, lineHeight: 1.35 })
          : null,
        meta.length ? h('div', { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }, meta) : null,
        repoHost ? text(repoHost, { fontSize: 22, color: C.muted, marginTop: '4px' }) : null
      ].filter(Boolean))
    ],
    accent
  );
}

function vendorCard(v, img) {
  const blurb = [v.deviceCount ? `${v.deviceCount} device${v.deviceCount === 1 ? '' : 's'}` : null, v.country]
    .filter(Boolean)
    .join(' · ');
  const logo = img
    ? h(
        'div',
        {
          display: 'flex',
          width: '180px',
          height: '180px',
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px'
        },
        [{ type: 'img', props: { src: img.uri, style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } } }]
      )
    : null;

  return frame(
    [
      h('div', { display: 'flex', flex: 1, alignItems: 'center', gap: '44px' }, [
        logo,
        h('div', { display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }, [
          kicker('Vendor', C.accent2),
          text(v.name, { fontSize: titleSize(v.name, 72, 46), fontWeight: 700, color: C.ink, lineHeight: 1.05 }),
          blurb ? text(blurb, { fontSize: 30, color: C.dim }) : null
        ].filter(Boolean))
      ].filter(Boolean))
    ],
    C.accent2
  );
}

const NETWORK_SCOPE_LABEL = {
  general: 'General',
  national: 'National',
  regional: 'Regional',
  local: 'Local',
  experimental: 'Experimental'
};

function networkBandLabel(n) {
  const radios = Array.isArray(n.radios) && n.radios.length ? n.radios : [n.radio].filter(Boolean);
  const seen = new Set();
  const labels = [];
  for (const radio of radios) {
    const label = radio?.frequency_mhz
      ? `${radio.frequency_mhz} MHz`
      : radio?.frequency
        ? `${radio.frequency} MHz`
        : null;
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels.join(', ');
}

function networkCard(n, deviceCount) {
  const band = networkBandLabel(n);
  const meta = [];
  if (band) meta.push(chip(band));
  if (n.coverage?.countries?.length) meta.push(chip(n.coverage.countries.join(', ')));
  if (deviceCount) meta.push(chip(`${deviceCount} device${deviceCount === 1 ? '' : 's'}`));

  return frame(
    [
      h('div', { display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: '26px' }, [
        kicker(`${NETWORK_SCOPE_LABEL[n.scope] ?? 'MeshCore'} network`, C.accent),
        text(n.name, { fontSize: titleSize(n.name, 72, 46), fontWeight: 700, color: C.ink, lineHeight: 1.05 }),
        n.description ? text(clamp(n.description, 140), { fontSize: 28, color: C.dim, lineHeight: 1.35 }) : null,
        meta.length ? h('div', { display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }, meta) : null
      ].filter(Boolean))
    ],
    C.accent
  );
}

function clamp(s, max) {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, t.lastIndexOf(' ', max - 1)).trimEnd() + '…';
}

// ── Render + cache ───────────────────────────────────────────────────────────
async function render(tree) {
  const svg = await satori(tree, { width: W, height: H, fonts });
  return new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
}

const sha = (...parts) =>
  createHash('sha256')
    .update(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(JSON.stringify(p)))).reduce((a, b) => Buffer.concat([a, b])))
    .digest('hex')
    .slice(0, 16);

async function main() {
  const data = JSON.parse(readFileSync(join(root, 'src/lib/generated/data.json'), 'utf8'));

  const outRoot = join(root, 'static', 'og');
  const cacheDir = join(root, '.cache', 'og');
  mkdirSync(cacheDir, { recursive: true });
  for (const kind of ['device', 'firmware', 'vendor', 'network']) mkdirSync(join(outRoot, kind), { recursive: true });

  const manifestPath = join(cacheDir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const next = {};
  const valid = { device: new Set(), firmware: new Set(), vendor: new Set(), network: new Set() };
  let generated = 0;
  let cached = 0;

  // Build the work list: [kind, item, image, hashInput].
  const jobs = [];
  for (const d of data.devices) {
    const img = loadDeviceImage(d.id);
    jobs.push(['device', d, img, sha(TEMPLATE_VERSION, d, img?.bytes ?? '')]);
  }
  for (const fw of data.firmwares) {
    jobs.push(['firmware', fw, null, sha(TEMPLATE_VERSION, fw)]);
  }
  for (const v of data.vendors) {
    const img = loadVendorImage(v.id);
    jobs.push(['vendor', v, img, sha(TEMPLATE_VERSION, v, img?.bytes ?? '')]);
  }
  // Compatible-device count per network, derived from the radio band (mirrors
  // devicesForBand in src/lib/data.js) so the card metadata matches the page.
  const deviceCountForBand = (band) =>
    band == null || band === ''
      ? 0
      : data.devices.filter((d) =>
          (d.hardware?.radios ?? []).some((r) => (r.bands ?? []).map(String).includes(String(band)))
        ).length;
  for (const nw of data.networks ?? []) {
    const count = deviceCountForBand(nw.radio?.frequency);
    jobs.push(['network', { ...nw, _deviceCount: count }, null, sha(TEMPLATE_VERSION, nw, count)]);
  }

  for (const [kind, item, img, hash] of jobs) {
    const key = `${kind}/${item.id}`;
    valid[kind].add(`${item.id}.png`);
    next[key] = hash;
    const outPath = join(outRoot, kind, `${item.id}.png`);
    if (manifest[key] === hash && existsSync(outPath)) {
      cached++;
      continue;
    }
    const tree =
      kind === 'device'
        ? deviceCard(item, img)
        : kind === 'firmware'
          ? firmwareCard(item)
          : kind === 'network'
            ? networkCard(item, item._deviceCount)
            : vendorCard(item, img);
    writeFileSync(outPath, await render(tree));
    generated++;
  }

  // Prune PNGs whose id no longer exists.
  let removed = 0;
  for (const kind of ['device', 'firmware', 'vendor', 'network']) {
    const dir = join(outRoot, kind);
    for (const f of readdirSync(dir)) {
      if (f.endsWith('.png') && !valid[kind].has(f)) {
        rmSync(join(dir, f));
        removed++;
      }
    }
  }

  writeFileSync(manifestPath, JSON.stringify(next, null, 2));
  console.log(`OG cards: generated ${generated}, cached ${cached}, removed ${removed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
