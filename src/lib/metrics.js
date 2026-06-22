// Comparable numeric hardware metrics. Shared by the device detail page (which
// renders a "rank this spec" icon next to each comparable row) and /device-rank
// page (which tabulates every device by one metric, sorted).
//
// Each metric exposes:
//   id    – stable url key (/device-rank/<id>/)
//   label – column / heading text
//   unit  – short unit suffix shown after the value
//   dir   – default sort: 'desc' (bigger is better/first) or 'asc' (smaller first)
//   get   – (device) => number | null   (null = device lacks the spec)
//   fmt   – (value)  => string          display form, unit appended by caller

const maxRadio = (d, key) => {
  const vals = (d.hardware?.radios ?? []).map((r) => r[key]).filter((v) => v != null);
  return vals.length ? Math.max(...vals) : null;
};

const dimensions = (d) => d.hardware?.physical?.dimensionsMm;

const boardAreaCm2 = (d) => {
  const dim = dimensions(d);
  if (dim?.width == null || dim?.height == null) return null;
  return (dim.width * dim.height) / 100;
};

const boardVolumeCm3 = (d) => {
  const dim = dimensions(d);
  if (dim?.width == null || dim?.height == null || dim?.depth == null) return null;
  return (dim.width * dim.height * dim.depth) / 1000;
};

const displayPixels = (d) => {
  const resolution = d.hardware?.display?.resolution;
  if (resolution?.width == null || resolution?.height == null) return null;
  return resolution.width * resolution.height;
};

const idleRuntimeHours = (d) => {
  const power = d.hardware?.power;
  if (power?.batteryCapacityMah == null || power?.consumptionIdleMa == null || power.consumptionIdleMa <= 0) {
    return null;
  }
  return power.batteryCapacityMah / power.consumptionIdleMa;
};

const txEfficiency = (d) => {
  const txPower = maxRadio(d, 'txPowerDbm');
  const txDraw = d.hardware?.power?.consumptionTxMa;
  if (txPower == null || txDraw == null || txDraw <= 0) return null;
  return 10 ** (txPower / 10) / txDraw;
};

const hasValue = (v) => v != null && v !== '' && v !== 'unknown';
const hasKnownStatus = (v) => hasValue(v) && v !== 'unknown';
const hasEntries = (v) => (Array.isArray(v) ? v.length > 0 : v && Object.keys(v).length > 0);

function completenessPercent(d) {
  let known = 0;
  let expected = 0;

  const add = (value, applicable = true) => {
    if (!applicable) return;
    expected += 1;
    if (typeof value === 'boolean' || hasValue(value)) known += 1;
  };
  const addStatus = (value, applicable = true) => {
    if (!applicable) return;
    expected += 1;
    if (hasKnownStatus(value)) known += 1;
  };
  const addEntries = (value, applicable = true) => add(hasEntries(value), applicable);

  add(d.name);
  add(d.vendorId);
  add(d.kind);
  add(d.lifecycle);
  add(d.familyId);
  add(d.official);
  add(d.product_url);
  add(d.description);
  add(d.image);
  add(d.datasheet);
  addEntries(d.refs);
  add(d.price?.amount);
  add(d.price?.currency ?? 'USD', d.price?.amount != null);
  add(d.price?.asOf, d.price?.amount != null);
  add(d.roles?.length);
  add(d.transports?.length);

  const mcu = d.hardware?.mcu;
  add(mcu?.model);
  add(mcu?.flashMb);
  add(mcu?.ramKb);
  add(mcu?.psramMb, mcu?.psramMb != null);

  const radios = d.hardware?.radios ?? [];
  addEntries(radios);
  for (const radio of radios) {
    add(radio.technology);
    add(radio.chip);
    addEntries(radio.bands);
    add(radio.txPowerDbm);
    add(radio.antenna);
  }

  const display = d.hardware?.display;
  addStatus(display?.status);
  if (display?.status === 'present') {
    add(display.technology);
    add(display.controller);
    add(display.size);
    add(display.resolution?.width);
    add(display.resolution?.height);
    add(display.colors);
    add(display.touch, display.touch != null);
  }

  const gnss = d.hardware?.gnss;
  addStatus(gnss?.status);
  add(gnss?.chip, gnss?.status === 'present');

  const input = d.hardware?.input ?? [];
  addEntries(input, input.length > 0);
  for (const item of input) {
    add(item.type);
    add(item.description);
  }

  const leds = d.hardware?.leds;
  addStatus(leds?.status);
  add(leds?.description, leds?.status === 'present');

  const power = d.hardware?.power;
  add(power?.batterySupported);
  add(power?.batteryBuiltIn, power?.batterySupported === true);
  add(power?.batteryCapacityMah, power?.batteryBuiltIn === true);
  add(power?.batteryChemistry, power?.batterySupported === true || power?.batteryBuiltIn === true);
  add(power?.batteryConnector, power?.batterySupported === true && power?.batteryBuiltIn === false);
  add(power?.charging, power?.batterySupported === true);
  add(power?.pmic, power?.charging === true);
  add(power?.solarInput);
  add(power?.solarPanelBuiltIn, power?.solarInput === true);
  add(power?.solarPanelWatts, power?.solarPanelBuiltIn === true);
  add(power?.consumptionIdleMa);
  add(power?.consumptionTxMa);

  const expansion = d.hardware?.expansion ?? [];
  addEntries(expansion, expansion.length > 0);
  for (const port of expansion) {
    add(port.type);
    add(port.count, port.count != null);
    add(port.pins, port.pins != null);
    addEntries(port.interfaces, port.interfaces?.length > 0);
  }

  const enclosure = d.hardware?.enclosure;
  add(enclosure?.builtIn);
  add(enclosure?.ipRating, enclosure?.builtIn === true);

  const physical = d.hardware?.physical;
  add(physical?.dimensionsMm?.width);
  add(physical?.dimensionsMm?.height);
  add(physical?.dimensionsMm?.depth);
  add(physical?.weightG);

  const environmental = d.hardware?.environmental;
  add(environmental?.operatingTempC?.min);
  add(environmental?.operatingTempC?.max);
  addEntries(d.hardware?.certifications);

  const usb = d.interfaces?.usb;
  add(usb?.connector);
  add(usb?.bridge, usb?.connector != null);
  addEntries(usb?.capabilities, usb?.connector != null);

  const bluetooth = d.interfaces?.bluetooth;
  add(bluetooth?.ble);
  add(bluetooth?.version, bluetooth?.ble === true);

  const wifi = d.interfaces?.wifi;
  addStatus(wifi?.status);
  add(wifi?.standard, wifi?.status === 'present');

  return expected ? Math.round((known / expected) * 100) : 0;
}

const fmtNumber = (v, digits = 1) => {
  if (Number.isInteger(v)) return `${v}`;
  return `${Number(v.toFixed(digits))}`;
};

export const METRICS = [
  {
    id: 'battery',
    label: 'Battery capacity',
    unit: 'mAh',
    dir: 'desc',
    get: (d) => d.hardware?.power?.batteryCapacityMah ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'tx-power',
    label: 'TX power',
    unit: 'dBm',
    dir: 'desc',
    get: (d) => maxRadio(d, 'txPowerDbm'),
    fmt: (v) => `${v}`
  },
  {
    id: 'flash',
    label: 'Flash',
    unit: 'MB',
    dir: 'desc',
    get: (d) => d.hardware?.mcu?.flashMb ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'ram',
    label: 'RAM',
    unit: 'KB',
    dir: 'desc',
    get: (d) => d.hardware?.mcu?.ramKb ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'psram',
    label: 'PSRAM',
    unit: 'MB',
    dir: 'desc',
    get: (d) => d.hardware?.mcu?.psramMb ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'idle-draw',
    label: 'Idle power draw',
    unit: 'mA',
    dir: 'asc',
    get: (d) => d.hardware?.power?.consumptionIdleMa ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'tx-draw',
    label: 'TX power draw',
    unit: 'mA',
    dir: 'asc',
    get: (d) => d.hardware?.power?.consumptionTxMa ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'solar',
    label: 'Solar panel',
    unit: 'W',
    dir: 'desc',
    get: (d) => d.hardware?.power?.solarPanelWatts ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'idle-runtime',
    label: 'Idle runtime estimate',
    unit: 'h',
    dir: 'desc',
    get: idleRuntimeHours,
    fmt: (v) => fmtNumber(v)
  },
  {
    id: 'tx-efficiency',
    label: 'TX efficiency',
    unit: 'mW/mA',
    dir: 'desc',
    get: txEfficiency,
    fmt: (v) => fmtNumber(v, 2)
  },
  {
    id: 'weight',
    label: 'Weight',
    unit: 'g',
    dir: 'asc',
    get: (d) => d.hardware?.physical?.weightG ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'area',
    label: 'Board area',
    unit: 'cm²',
    dir: 'asc',
    get: boardAreaCm2,
    fmt: (v) => fmtNumber(v)
  },
  {
    id: 'volume',
    label: 'Board volume',
    unit: 'cm³',
    dir: 'asc',
    get: boardVolumeCm3,
    fmt: (v) => fmtNumber(v)
  },
  {
    id: 'display-size',
    label: 'Display size',
    unit: '″',
    dir: 'desc',
    get: (d) => d.hardware?.display?.size ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'display-pixels',
    label: 'Display pixels',
    unit: 'px',
    dir: 'desc',
    get: displayPixels,
    fmt: (v) => `${Math.round(v).toLocaleString()}`
  },
  {
    id: 'firmware-support',
    label: 'Firmware support',
    unit: 'firmwares',
    dir: 'desc',
    get: (d) => d.firmwareSupportCount ?? null,
    fmt: (v) => `${v}`
  },
  {
    id: 'completeness',
    label: 'Catalog completeness',
    unit: '%',
    dir: 'desc',
    get: completenessPercent,
    fmt: (v) => `${v}`
  },
  {
    id: 'price',
    label: 'Price',
    unit: '',
    dir: 'asc',
    get: (d) => d.price?.amount ?? null,
    fmt: (v) => `~$${Number.isInteger(v) ? v : v.toFixed(2)}`
  }
];

const byId = new Map(METRICS.map((m) => [m.id, m]));

/** Look up a metric by its url id, or null. */
export function metricById(id) {
  return byId.get(id) ?? null;
}
