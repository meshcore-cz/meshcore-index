// Site-wide constants for SEO/social metadata and absolute-URL building.
// Production site: https://meshcore.ninja — override at build with SITE_ORIGIN /
// VITE_SITE_ORIGIN. The same default is mirrored in scripts/build-data.js.
export const SITE_ORIGIN = (
  import.meta.env?.VITE_SITE_ORIGIN ?? 'https://meshcore.ninja'
).replace(/\/+$/, '');

export const SITE_NAME = 'MeshCore Ninja';

export const REPO_URL = 'https://github.com/meshcore-cz/meshcore-index';

// Origin + deploy base path (e.g. "" or "/meshcore-ninja"). The base
// is injected by vite.config.js from BASE_PATH; SvelteKit's $app/paths `base`
// is *relative* in this static build, so it can't build absolute URLs.
const BASE = (import.meta.env?.VITE_BASE_PATH ?? '').replace(/\/+$/, '');
const SITE_BASE = `${SITE_ORIGIN}${BASE}`;

/** Absolute URL for a path that already includes the base (e.g. asset URLs). */
export const abs = (rootedPath) => `${SITE_ORIGIN}${rootedPath}`;

/** Absolute URL for an app route, prefixing origin + base path. */
export const absUrl = (path = '/') => `${SITE_BASE}${path.startsWith('/') ? path : `/${path}`}`;

/**
 * Rooted path (base-path aware) to a generated OG card for a data item, e.g.
 * `/og/device/<id>.png`. Cards are produced at build time by
 * scripts/build-og.js. Pass straight into <Seo image={...}> — it absolutizes.
 */
export const ogImageFor = (kind, id) => `${BASE}/og/${kind}/${id}.png`;

/** Trim a string to a tidy meta-description length, breaking on a word. */
export function clampDescription(text, max = 160) {
  const s = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, s.lastIndexOf(' ', max - 1)).trimEnd() + '…';
}
