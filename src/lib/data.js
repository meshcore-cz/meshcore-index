// The compiled dataset is produced by `npm run build:data` (scripts/build-data.js)
// from the YAML sources. The same content is also published at /data.json.
import dataset from '$lib/generated/data.json';

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
const logoByVendor = urlMap(
  import.meta.glob('../../data/vendors/*/*.svg', { query: '?url', import: 'default', eager: true })
);

/** All vendors (from data.json), with their bundled logo URL attached. */
export const vendors = dataset.vendors.map((v) => ({
  ...v,
  logoUrl: logoByVendor[v.id] ?? null
}));

const vendorById = new Map(vendors.map((v) => [v.id, v]));

/** All devices (from data.json), with image URL and resolved vendor attached. */
export const devices = dataset.devices.map((d) => ({
  ...d,
  imageUrl: imageByDevice[d.id] ?? null,
  vendor: d.vendorId ? vendorById.get(d.vendorId) ?? null : null
}));

const deviceById = new Map(devices.map((d) => [d.id, d]));

/** All firmwares, ordered by build-data.js (official first, then by name). */
export const firmwares = dataset.firmwares;

export function getFirmware(id) {
  return firmwares.find((f) => f.id === id);
}

export function getDevice(id) {
  return deviceById.get(id);
}

export function getVendor(id) {
  return vendorById.get(id);
}

/** Devices belonging to a vendor, sorted by name. */
export function devicesForVendor(vendorId) {
  return devices.filter((d) => d.vendorId === vendorId);
}

/**
 * Firmwares that list this device, with the per-device status/notes.
 * @returns {Array<{firmware: any, status: string, notes?: string}>}
 */
export function firmwaresForDevice(deviceId) {
  const out = [];
  for (const fw of firmwares) {
    const entry = (fw.devices ?? []).find((d) => d.id === deviceId);
    if (entry) out.push({ firmware: fw, status: entry.status, notes: entry.notes });
  }
  return out;
}

/**
 * Build a compatibility matrix. Firmwares are the columns (there are only a
 * handful); devices are the rows, limited to those at least one firmware lists.
 * @returns {{firmwares: typeof firmwares, rows: Array<{device: any, cells: Record<string, {status: string, notes?: string}>}>}}
 */
export function compatibilityMatrix() {
  const rows = devices.map((device) => {
    const cells = {};
    for (const fw of firmwares) {
      const entry = (fw.devices ?? []).find((d) => d.id === device.id);
      if (entry) cells[fw.id] = { status: entry.status, notes: entry.notes };
    }
    return { device, cells };
  });
  return { firmwares, rows };
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
