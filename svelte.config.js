import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    serviceWorker: {
      register: false
    },
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // SPA fallback for unmatched paths. GitHub Pages serves `404.html` (with
      // an HTTP 404) for any URL that isn't a prerendered file; this shell boots
      // the client router, which renders the localized +error.svelte page.
      fallback: '404.html',
      precompress: false,
      strict: true
    }),
    // Build to a relative base so the site works on GitHub Pages subpaths too.
    paths: {
      base: process.env.BASE_PATH ?? ''
    },
    prerender: {
      handleHttpError: ({ path, message }) => {
        // Ignore 404s from relative links inside changelog release notes
        // (they point to upstream README files we don't host).
        if (path.includes('/firmware/') && (path.endsWith('.md') || path.includes('/releases/'))) {
          return;
        }
        throw new Error(`${path} — ${message}`);
      },
      handleMissingId: () => {
        // Ignore missing anchor IDs in rendered changelog notes
        // (release notes contain links to upstream README sections).
        return;
      }
    }
  }
};

export default config;