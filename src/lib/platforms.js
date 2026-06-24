// Platform slugs from software.yaml `platforms` — labels and icon ids.
//
// `devicon` (an `<name>-<variant>` id from the official devicon library) is
// preferred when present because its brand-coloured artwork reads better; the
// monochrome Iconify `icon` (simple-icons / lucide) is the fallback for
// platforms Devicon doesn't cover well (e.g. Apple, which is a solid glyph that
// needs `currentColor` to stay visible on dark backgrounds).

/** @typedef {{ label: string, icon?: string, devicon?: string }} PlatformMeta */

/** @type {Record<string, PlatformMeta>} */
export const PLATFORMS = {
  android: { label: 'Android', icon: 'simple-icons:android', devicon: 'android-plain' },
  arduino: { label: 'Arduino', icon: 'simple-icons:arduino', devicon: 'arduino-plain' },
  'commodore-64': { label: 'Commodore 64', icon: 'simple-icons:commodore' },
  docker: { label: 'Docker', icon: 'simple-icons:docker', devicon: 'docker-plain' },
  domoticz: { label: 'Domoticz' },
  'esp-idf': { label: 'ESP-IDF', icon: 'simple-icons:espressif' },
  esp32: { label: 'ESP32', icon: 'simple-icons:espressif' },
  esphome: { label: 'ESPHome', icon: 'simple-icons:esphome' },
  haiku: { label: 'Haiku' },
  'home-assistant': { label: 'Home Assistant', icon: 'simple-icons:homeassistant' },
  ios: { label: 'iOS', icon: 'simple-icons:apple' },
  ipados: { label: 'iPadOS', icon: 'simple-icons:apple' },
  kubernetes: { label: 'Kubernetes', icon: 'simple-icons:kubernetes', devicon: 'kubernetes-plain' },
  linux: { label: 'Linux', icon: 'simple-icons:linux', devicon: 'linux-plain' },
  'm5stack-cardputer': { label: 'M5Stack Cardputer', icon: 'simple-icons:m5stack' },
  macos: { label: 'macOS', icon: 'simple-icons:apple' },
  nixos: { label: 'NixOS', icon: 'simple-icons:nixos', devicon: 'nixos-plain' },
  nrf52: { label: 'nRF52', icon: 'simple-icons:nordicsemiconductor' },
  picomite: { label: 'Picomite', icon: 'simple-icons:micropython' },
  proxmox: { label: 'Proxmox', icon: 'simple-icons:proxmox', devicon: 'proxmox-plain' },
  'raspberry-pi': { label: 'Raspberry Pi', icon: 'simple-icons:raspberrypi', devicon: 'raspberrypi-plain' },
  'raspberry-pi-pico': { label: 'Raspberry Pi Pico', icon: 'simple-icons:raspberrypi', devicon: 'raspberrypi-plain' },
  stm32: { label: 'STM32', icon: 'simple-icons:stmicroelectronics' },
  web: { label: 'Web', icon: 'lucide:globe' },
  windows: { label: 'Windows', icon: 'simple-icons:windows', devicon: 'windows11-original' }
};

/** @param {string} slug */
export function platformMeta(slug) {
  const known = PLATFORMS[slug];
  if (known) return known;
  return { label: slug.replace(/-/g, ' ') };
}

/** @param {string} slug Devicon `<name>-<variant>` id, or null when none. */
export function platformDeviconId(slug) {
  return PLATFORMS[slug]?.devicon ?? null;
}

/** @param {string} slug */
export function platformIconifyId(slug) {
  return PLATFORMS[slug]?.icon ?? null;
}

/** Dedupe platforms that share the same icon (e.g. ios + ipados). */
export function uniquePlatformsForIcons(platforms) {
  const seen = new Set();
  const out = [];
  for (const p of platforms) {
    const key = platformDeviconId(p) ?? platformIconifyId(p) ?? p;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}
