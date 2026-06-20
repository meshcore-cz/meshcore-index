import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: false,
      strict: true
    }),
    // Build to a relative base so the site works on GitHub Pages subpaths too.
    paths: {
      base: process.env.BASE_PATH ?? ''
    }
  }
};

export default config;
