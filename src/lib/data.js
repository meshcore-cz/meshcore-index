// The compiled dataset is produced by `npm run build:data` (scripts/build-data.js)
// from the YAML sources. The same content is also published at /data.json.
import dataset from '$lib/generated/data.json';
import Fuse from 'fuse.js';
import * as countryFlags from 'country-flag-icons/string/3x2';
import { groupReleases } from '$lib/releases.js';

export { groupReleases } from '$lib/releases.js';

// Images (device thumbnails and vendor logos) must go through the bundler to
// get hashed asset URLs; map each glob result back to its directory id.
function urlMap(glob) {
  const out = {};
  for (const [path, url] of Object.entries(glob)) {
    out[path.split('/').slice(-2)[0]] = url;
  }
  return out;
}

const imageByDevice = urlMap(
  import.meta.glob('../../data/devices/*/*.svg', { query: '?url', import: 'default', eager: true })
);
const datasheetByDeviceFile = {};
for (const [path, url] of Object.entries(
  import.meta.glob('../../data/devices/*/*.pdf', { query: '?url', import: 'default', eager: true })
)) {
  const parts = path.split('/');
  datasheetByDeviceFile[`${parts.at(-2)}/${parts.at(-1)}`] = url;
}
const logoByVendorFile = {};
for (const [path, url] of Object.entries(
  import.meta.glob('../../data/vendors/*/*.{svg,png,jpg,jpeg,webp}', {
    query: '?url',
    import: 'default',
    eager: true
  })
)) {
  const parts = path.split('/');
  logoByVendorFile[`${parts.at(-2)}/${parts.at(-1)}`] = url;
}

/** All vendors (from data.json), with their bundled logo URL attached. */
export const vendors = dataset.vendors.map((v) => ({
  ...v,
  logoUrl: v.logo ? (logoByVendorFile[`${v.id}/${v.logo}`] ?? null) : null
}));

const vendorById = new Map(vendors.map((v) => [v.id, v]));

/** All devices (from data.json), with image URL and resolved vendor attached. */
export const devices = dataset.devices.map((d) => ({
  ...d,
  imageUrl: imageByDevice[d.id] ?? null,
  datasheetUrl: d.datasheet ? (datasheetByDeviceFile[`${d.id}/${d.datasheet}`] ?? null) : null,
  vendor: d.vendorId ? vendorById.get(d.vendorId) ?? null : null
}));

const deviceById = new Map(devices.map((d) => [d.id, d]));

/** All firmwares, ordered by build-data.js (active first, then by type, then by name). */
export const firmwares = dataset.firmwares;

/** All networks (from data.json), ordered by name in build-data.js. */
export const networks = dataset.networks ?? [];

const networkById = new Map(networks.map((n) => [n.id, n]));

export function getFirmware(id) {
  return firmwares.find((f) => f.id === id);
}

export function getDevice(id) {
  return deviceById.get(id);
}

export function getVendor(id) {
  return vendorById.get(id);
}

export function getNetwork(id) {
  return networkById.get(id);
}

/**
 * Devices whose radios support a LoRa frequency band key (e.g. "868"). This is
 * how networks resolve their compatible hardware — they store a band, not a
 * device list. Returns [] for an unknown/empty band. Sorted by name (devices
 * are already name-sorted).
 */
export function devicesForBand(band) {
  if (band == null || band === '') return [];
  const key = String(band);
  return devices.filter((d) =>
    (d.hardware?.radios ?? []).some((r) => (r.bands ?? []).map(String).includes(key))
  );
}

/** Radio settings published by a network, supporting both legacy `radio` and `radios[]`. */
export function networkRadioSettings(network) {
  const radios = Array.isArray(network?.radios) ? network.radios : [];
  if (radios.length) return radios;
  return network?.radio ? [network.radio] : [];
}

/** Frequency band keys published by a network, de-duplicated in display order. */
export function networkBands(network) {
  const seen = new Set();
  const out = [];
  for (const radio of networkRadioSettings(network)) {
    const band = radio?.frequency;
    if (band == null || band === '') continue;
    const key = String(band);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Devices compatible with a network, derived from its radio frequency bands. */
export function devicesForNetwork(network) {
  const bands = networkBands(network);
  if (!bands.length) return [];
  return devices.filter((d) =>
    (d.hardware?.radios ?? []).some((r) => {
      const variants = (r.bands ?? []).map(String);
      return bands.some((band) => variants.includes(band));
    })
  );
}

/**
 * Devices that explicitly cannot run on a band: those whose radios declare
 * frequency variants, none of which include the band. Devices with no declared
 * variants are treated as unknown (not incompatible) and excluded. Returns []
 * for an unknown/empty band.
 */
export function devicesIncompatibleWithBand(band) {
  if (band == null || band === '') return [];
  const key = String(band);
  return devices.filter((d) => {
    const radios = d.hardware?.radios ?? [];
    const variants = radios.flatMap((r) => (r.bands ?? []).map(String));
    return variants.length > 0 && !variants.includes(key);
  });
}

/** Devices incompatible with all of a network's radio frequency bands. */
export function devicesIncompatibleWithNetwork(network) {
  const bands = networkBands(network);
  if (!bands.length) return [];
  return devices.filter((d) => {
    const variants = (d.hardware?.radios ?? []).flatMap((r) => (r.bands ?? []).map(String));
    return variants.length > 0 && !bands.some((band) => variants.includes(band));
  });
}

/** Devices belonging to a vendor, sorted by name. */
export function devicesForVendor(vendorId) {
  return devices.filter((d) => d.vendorId === vendorId);
}

/**
 * Other devices sharing a device's `familyId` (e.g. Wio Tracker L1 / L1 Pro /
 * L1 e-ink). Excludes the device itself. Empty when the device has no family or
 * is the only member. Sorted by name.
 */
export function familyVariants(device) {
  if (!device?.familyId) return [];
  return devices
    .filter((d) => d.id !== device.id && d.familyId === device.familyId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Device name with its vendor prefix dropped for compact display (e.g.
 * "Seeed Studio Wio Tracker L1 Pro" → "Wio Tracker L1 Pro"). Falls back to the
 * full name when the name doesn't lead with the vendor. Matches on the full
 * vendor name or just its first word ("Seeed").
 */
export function deviceShortName(device) {
  const name = device?.name;
  const vendor = device?.vendor?.name ?? device?.vendorName;
  if (!name || !vendor) return name ?? '';
  for (const prefix of [vendor, vendor.split(/\s+/)[0]]) {
    const lead = `${prefix} `;
    if (name.toLowerCase().startsWith(lead.toLowerCase())) return name.slice(lead.length).trim();
  }
  return name;
}

/** Shared parts catalog (data/globals.yaml), keyed by category then part id. */
export const globals = dataset.globals ?? {};

/** ISO timestamp of when the dataset was last compiled from YAML. */
export const generatedAt = dataset.generatedAt ?? null;

/**
 * Expand a record's `refs` map into outbound links. Each `{ <key>: <id> }`
 * entry is resolved against globals.refs: the id replaces `{id}` in the ref's
 * urlTemplate. Unknown ref keys are skipped.
 * @returns {{ key, name, value, url }[]}
 */
export function resolveRefs(refs) {
  if (!refs) return [];
  const registry = globals.refs ?? {};
  const out = [];
  for (const [key, value] of Object.entries(refs)) {
    const def = registry[key];
    if (!def?.urlTemplate) continue;
    out.push({
      key,
      name: def.name ?? key,
      value,
      url: def.urlTemplate.replaceAll('{id}', encodeURIComponent(value))
    });
  }
  return out;
}

/**
 * Resolve a bare chip/model string against a catalog category, matching the key
 * case-insensitively. Returns `{ id, name, vendor?, url?, description? }` or null.
 */
function lookupPart(category, key) {
  if (!key) return null;
  const cat = globals[category];
  if (!cat) return null;
  const lower = String(key).toLowerCase();
  for (const [id, part] of Object.entries(cat)) {
    if (id.toLowerCase() === lower) return { id, ...part };
  }
  return null;
}

/**
 * Walk the MCU family tree (globals.family) for a model key. The key may be a
 * family id (only the family is known) or a model id nested under a family.
 * @returns {{ familyId, family, modelId, model, architecture }|null}
 */
function findMcu(key) {
  if (!key) return null;
  const lower = String(key).toLowerCase();
  // Model match first — a key like "esp32" is both a family id and the original
  // chip model id; prefer the specific model when it exists in the catalog.
  for (const [familyId, family] of Object.entries(globals.family ?? {})) {
    for (const [modelId, model] of Object.entries(family.models ?? {})) {
      if (modelId.toLowerCase() === lower) {
        return {
          familyId,
          family,
          modelId,
          model,
          architecture: model.architecture ?? family.architecture
        };
      }
    }
  }
  for (const [familyId, family] of Object.entries(globals.family ?? {})) {
    if (familyId.toLowerCase() === lower) {
      return { familyId, family, modelId: null, model: null, architecture: family.architecture };
    }
  }
  return null;
}

const partShape = (id, rec) =>
  rec ? { id, name: rec.name, vendor: rec.vendor, url: rec.url, description: rec.description } : null;

/** Drop the vendor prefix from a catalog part name for compact display. */
export function stripVendorLabel(part, fallback) {
  if (!part?.name) return fallback;
  const { vendor, name } = part;
  if (!vendor) return name;
  for (const prefix of [vendor, vendor.split(/\s+/)[0]]) {
    const lead = `${prefix} `;
    if (name.toLowerCase().startsWith(lead.toLowerCase())) return name.slice(lead.length).trim();
  }
  return name;
}

/**
 * Resolve a device's MCU model into family / model / architecture catalog
 * entries. Family and CPU architecture are derived from the catalog, so a
 * device only stores `hardware.mcu.model`.
 * @returns {{ family, model, architecture }|null}
 */
export function resolveMcuInfo(device) {
  const hit = findMcu(device.hardware?.mcu?.model);
  if (!hit) return null;
  const familyVendor = hit.family?.vendor;
  const modelRec = hit.model
    ? { ...hit.model, vendor: hit.model.vendor ?? familyVendor }
    : null;
  return {
    family: partShape(hit.familyId, hit.family),
    model: partShape(hit.modelId, modelRec),
    architecture: lookupPart('architecture', hit.architecture) ?? (hit.architecture ? { name: hit.architecture } : null)
  };
}

/** Catalog entry for a radio chip string. */
export function resolveRadio(chip) {
  return lookupPart('radio', chip);
}

/** Catalog entry for a LoRa frequency band key (e.g. "868"). */
export function resolveFrequency(band) {
  return lookupPart('frequency', band);
}

/**
 * Standard display label for a band key, leading with the regional code when
 * the catalog defines one — e.g. "868" → "EU868", "915" → "US915 / AU915".
 * Falls back to the catalog name ("868 MHz") and finally the raw key.
 */
export function bandLabel(band) {
  const fp = resolveFrequency(band);
  return fp?.region ?? fp?.name ?? (band != null ? String(band) : null);
}

/** Region code + MHz name together, e.g. "EU868 · 868 MHz". For tooltips. */
export function bandLongLabel(band) {
  const fp = resolveFrequency(band);
  if (!fp) return band != null ? String(band) : null;
  return [fp.region, fp.name].filter(Boolean).join(' · ');
}

/**
 * Every LoRa band in the catalog, sorted ascending by frequency, with the count
 * of devices supporting it. Powers the /bands reference page.
 * @returns {{ key, name, region?, range?, description?, deviceCount }[]}
 */
export function allBands() {
  const cat = globals.frequency ?? {};
  return Object.entries(cat)
    .map(([key, part]) => ({
      key,
      ...part,
      deviceCount: devices.filter((d) =>
        (d.hardware?.radios ?? []).some((r) => (r.bands ?? []).map(String).includes(key))
      ).length
    }))
    .sort((a, b) => Number(a.key) - Number(b.key));
}

/**
 * A network's own `coverage.regions` ({ code, name, parent? }) sorted so that
 * national roots (no parent) come before their subdivisions, then by name.
 * @returns {{ code, name, parent? }[]}
 */
export function networkRegions(network) {
  return [...(network?.regions ?? [])].sort(
    (a, b) =>
      Number(Boolean(a.parent)) - Number(Boolean(b.parent)) || a.name.localeCompare(b.name)
  );
}

/** Catalog entry for a display technology string. */
export function resolveDisplay(technology) {
  return lookupPart('display', technology);
}

/** Compact display label for cards and hero specs, e.g. "0.96″ OLED". */
export function deviceDisplayLabel(display) {
  if (display?.status === 'present') {
    const typeName =
      resolveDisplay(display.technology)?.name ??
      (display.technology
        ? String(display.technology)
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
        : 'Display');
    if (display.size != null && display.size !== '') return `${display.size}″ ${typeName}`;
    return typeName;
  }
  if (display?.status === 'none') return 'None';
  return 'Unknown';
}

/** Catalog entry for a GNSS chip string. */
export function resolveGnss(chip) {
  return lookupPart('gnss', chip);
}

export function deviceMcuLabel(device) {
  const mcu = device.hardware?.mcu;
  return mcu?.model ?? mcu?.family ?? 'Unknown';
}

const CURRENCY_SYMBOL = { USD: '$', EUR: '€', GBP: '£', CNY: '¥', JPY: '¥' };

/**
 * Format a device's approximate price as e.g. "~$25". Returns null when no
 * price is recorded. Always prefixed with "~" — these are indicators, not quotes.
 */
export function devicePriceLabel(device) {
  const p = device.price;
  if (!p || typeof p.amount !== 'number') return null;
  const cur = p.currency ?? 'USD';
  const sym = CURRENCY_SYMBOL[cur];
  const n = Number.isInteger(p.amount) ? p.amount : p.amount.toFixed(2);
  return sym ? `~${sym}${n}` : `~${n} ${cur}`;
}

export function deviceRadioLabel(device) {
  const radios = device.hardware?.radios ?? [];
  if (!radios.length) return 'Unknown';
  const labels = radios
    .map((r) => (r.chip ? resolveRadio(r.chip)?.name ?? r.chip : r.technology))
    .filter(Boolean);
  return labels.length ? labels.join(', ') : 'Unknown';
}

export function deviceSearchText(device) {
  return [
    device.name,
    device.vendorName,
    deviceMcuLabel(device),
    deviceRadioLabel(device),
    ...(device.roles ?? []),
    ...(device.transports ?? [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Firmwares that list this device, with the per-device status/notes.
 * @returns {Array<{firmware: any, status: string, notes?: string, target?: string, platformio_board?: string}>}
 */
export function firmwaresForDevice(deviceId) {
  const out = [];
  for (const fw of firmwares) {
    const entry = (fw.devices ?? []).find((d) => d.id === deviceId);
    if (entry) {
      out.push({
        firmware: fw,
        status: entry.status,
        notes: entry.notes,
        target: entry.target,
        platformio_board: entry.platformio_board
      });
    }
  }
  return out;
}

/**
 * Build a compatibility matrix. Firmwares are the columns (there are only a
 * handful); devices are the rows, limited to those at least one firmware lists.
 * Firmware columns are sorted by supported device count (desc), then name.
 * @returns {{firmwares: typeof firmwares, rows: Array<{device: any, cells: Record<string, {status: string, notes?: string, target?: string, platformio_board?: string}>}>}}
 */
export function compatibilityMatrix() {
  const matrixFirmwares = [...firmwares].sort((a, b) => {
    const count = (fw) => (fw.devices ?? []).filter((d) => d.status === 'supported').length;
    const diff = count(b) - count(a);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  const listedDeviceIds = new Set();
  for (const fw of matrixFirmwares) {
    for (const d of fw.devices ?? []) listedDeviceIds.add(d.id);
  }

  const rows = devices
    .filter((device) => listedDeviceIds.has(device.id))
    .map((device) => {
    const cells = {};
    for (const fw of matrixFirmwares) {
      const entry = (fw.devices ?? []).find((d) => d.id === device.id);
      if (entry) {
        cells[fw.id] = {
          status: entry.status,
          notes: entry.notes,
          target: entry.target,
          platformio_board: entry.platformio_board
        };
      }
    }
    return { device, cells };
  });
  return { firmwares: matrixFirmwares, rows };
}

/**
 * Newest release groups across all firmwares, each tagged with its firmware.
 * Variants are already collapsed by groupReleases().
 */
export function latestReleases(limit = 12) {
  const out = [];
  for (const fw of firmwares) {
    for (const g of groupReleases(fw.releases)) {
      out.push({ firmware: { id: fw.id, name: fw.name, type: fw.type }, ...g });
    }
  }
  out.sort((a, b) => (b.datetime ?? '').localeCompare(a.datetime ?? ''));
  return limit ? out.slice(0, limit) : out;
}

/** The single newest release group for each firmware, newest firmware first. */
export function latestReleasePerFirmware() {
  const out = [];
  for (const fw of firmwares) {
    const [newest] = groupReleases(fw.releases);
    if (newest) out.push({ firmware: { id: fw.id, name: fw.name, type: fw.type }, ...newest });
  }
  out.sort((a, b) => (b.datetime ?? '').localeCompare(a.datetime ?? ''));
  return out;
}

export const STATUS_META = {
  supported: { label: 'Supported', symbol: '✓', tw: 'bg-ok/15 text-ok', cell: 'bg-ok/15 text-ok' },
  partial: { label: 'Partial', symbol: '◑', tw: 'bg-warn/15 text-warn', cell: 'bg-warn/15 text-warn' },
  untested: { label: 'Untested', symbol: '?', tw: 'bg-muted/15 text-muted', cell: 'bg-muted/15 text-muted' },
  unsupported: { label: 'Unsupported', symbol: '✗', tw: 'bg-bad/15 text-bad', cell: 'bg-bad/15 text-bad' }
};

/** Firmware type → label + badge utility classes. */
export const TYPE_META = {
  official: { label: 'Official', tw: 'bg-accent/15 text-accent' },
  fork: { label: 'Fork', tw: 'bg-accent2/15 text-accent2' },
  custom: { label: 'Custom', tw: 'bg-warn/15 text-warn' }
};

/** Firmware status → text colour utility. */
export const FW_STATUS_TW = {
  active: 'text-ok',
  experimental: 'text-warn',
  maintenance: 'text-dim',
  inactive: 'text-bad'
};

/** Network scope → label + badge utility classes. */
export const NETWORK_SCOPE_META = {
  general: { label: 'General', tw: 'bg-dim/15 text-dim' },
  national: { label: 'National', tw: 'bg-accent/15 text-accent' },
  regional: { label: 'Regional', tw: 'bg-accent2/15 text-accent2' },
  local: { label: 'Local', tw: 'bg-ok/15 text-ok' },
  experimental: { label: 'Experimental', tw: 'bg-warn/15 text-warn' }
};

/** Network status → label + text colour utility. */
export const NETWORK_STATUS_META = {
  active: { label: 'Active', tw: 'text-ok' },
  planned: { label: 'Planned', tw: 'text-warn' },
  dormant: { label: 'Dormant', tw: 'text-dim' },
  inactive: { label: 'Inactive', tw: 'text-bad' }
};

/** Compact band label for a network, e.g. "EU868" or "EU433 / CN, EU868". */
export function networkBandLabel(network) {
  const labels = networkBands(network).map((band) => bandLabel(band));
  return labels.length ? labels.join(', ') : null;
}

/** Display label for one network radio preset. */
export function networkRadioLabel(radio) {
  if (!radio) return null;
  if (radio.frequency_mhz != null) return `${radio.frequency_mhz} MHz`;
  const band = radio.frequency;
  if (!band) return null;
  return bandLabel(band);
}

/** Inline SVG markup for a 3:2 country flag, or null. Case-insensitive. */
export function countryFlagSvg(code) {
  if (!code) return null;
  return countryFlags[String(code).toUpperCase()] ?? null;
}

/**
 * Country flags to display for a network — one per `coverage.countries` entry,
 * regardless of scope (a regional mesh like CascadiaMesh shows CA + US). Networks
 * with no country coverage (e.g. the general EU/UK preset) show none.
 * @returns {{ code, svg }[]}
 */
export function networkFlags(network) {
  return (network?.coverage?.countries ?? [])
    .map((code) => ({ code, svg: countryFlagSvg(code) }))
    .filter((f) => f.svg);
}

/**
 * Flat, pre-built index for the global (Cmd+K) search over devices, firmwares
 * and vendors. Each item carries a
 * display title/subtitle, a category, a base-relative `href`, an optional image
 * and a lowercased `text` blob to match against. Built once at module load.
 * @typedef {{ type: string, title: string, subtitle?: string, href: string,
 *   image?: string|null, text: string }} SearchItem
 * @type {SearchItem[]}
 */
export const searchItems = [
  ...devices.map((d) => ({
    type: 'Device',
    title: d.name,
    subtitle: [d.vendorName, deviceMcuLabel(d), deviceRadioLabel(d)]
      .filter((s) => s && s !== 'Unknown')
      .join(' · '),
    href: `/device/${d.id}/`,
    image: d.imageUrl,
    text: [deviceSearchText(d), ...(d.aliases ?? [])].join(' ').toLowerCase()
  })),
  ...firmwares.map((f) => ({
    type: 'Firmware',
    title: f.name,
    subtitle: [TYPE_META[f.type]?.label ?? f.type, f.maintainer].filter(Boolean).join(' · '),
    href: `/firmware/${f.id}/`,
    text: [f.name, f.type, f.maintainer, f.description].filter(Boolean).join(' ').toLowerCase()
  })),
  ...vendors.map((v) => ({
    type: 'Vendor',
    title: v.name,
    subtitle: [v.country, v.deviceCount ? `${v.deviceCount} device${v.deviceCount === 1 ? '' : 's'}` : null]
      .filter(Boolean)
      .join(' · '),
    href: `/vendor/${v.id}/`,
    image: v.logoUrl,
    text: [v.name, v.country, v.description].filter(Boolean).join(' ').toLowerCase()
  })),
  ...networks.map((n) => ({
    type: 'Network',
    title: n.name,
    subtitle: [
      NETWORK_SCOPE_META[n.scope]?.label ?? n.scope,
      ...(n.coverage?.countries ?? []),
      networkBandLabel(n)
    ]
      .filter(Boolean)
      .join(' · '),
    href: `/network/${n.id}/`,
    text: [
      n.name,
      n.short_name,
      n.scope,
      n.description,
      ...(n.coverage?.countries ?? []),
      ...networkBands(n),
      ...networkRadioSettings(n).flatMap((r) => [r.name, r.description, r.frequency_mhz]),
      ...(n.regions ?? []).flatMap((r) => [r.code, r.name])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }))
];

// Fuzzy matcher over the index. Title is weighted highest, then subtitle, then
// the catch-all text blob. ignoreLocation lets matches land anywhere in a field.
const fuse = new Fuse(searchItems, {
  keys: [
    { name: 'title', weight: 0.6 },
    { name: 'subtitle', weight: 0.25 },
    { name: 'text', weight: 0.15 }
  ],
  includeScore: true,
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 1
});

const SEARCH_IMAGE_TIE_EPSILON = 0.02;

/**
 * Fuzzy-search the atlas with Fuse.js. Returns at most `limit` items, best
 * match first.
 * @returns {SearchItem[]}
 */
export function searchAtlas(query, limit = 12) {
  const q = query.trim();
  if (!q) return [];
  return fuse
    .search(q, { limit: limit * 3 })
    .sort((a, b) => {
      const scoreDelta = (a.score ?? 0) - (b.score ?? 0);
      if (Math.abs(scoreDelta) > SEARCH_IMAGE_TIE_EPSILON) return scoreDelta;

      const imageDelta = Number(Boolean(b.item.image)) - Number(Boolean(a.item.image));
      if (imageDelta) return imageDelta;

      return scoreDelta;
    })
    .slice(0, limit)
    .map((r) => r.item);
}
