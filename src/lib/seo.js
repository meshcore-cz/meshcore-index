// Site-wide constants for SEO/social metadata and absolute-URL building.
// The origin is where the production site is served (GitHub Pages project
// site). Override at build with the SITE_ORIGIN env var; the same default is
// mirrored in scripts/build-data.js for the sitemap/robots generator.
export const SITE_ORIGIN = (
  import.meta.env?.VITE_SITE_ORIGIN ?? 'https://meshcore-cz.github.io'
).replace(/\/+$/, '');

export const SITE_NAME = 'MeshCore Index';

export const REPO_URL = 'https://github.com/meshcore-cz/meshcore-firmware-atlas';

// Origin + deploy base path (e.g. "" or "/meshcore-firmware-atlas"). The base
// is injected by vite.config.js from BASE_PATH; SvelteKit's $app/paths `base`
// is *relative* in this static build, so it can't build absolute URLs.
const BASE = (import.meta.env?.VITE_BASE_PATH ?? '').replace(/\/+$/, '');
const SITE_BASE = `${SITE_ORIGIN}${BASE}`;

/** Absolute URL for a path that already includes the base (e.g. asset URLs). */
export const abs = (rootedPath) => `${SITE_ORIGIN}${rootedPath}`;

/** Absolute URL for an app route, prefixing origin + base path. */
export const absUrl = (path = '/') => `${SITE_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/** Trim a string to a tidy meta-description length, breaking on a word. */
export function clampDescription(text, max = 160) {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, s.lastIndexOf(' ', max - 1)).trimEnd() + '…';
}
