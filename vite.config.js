import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildData } from './scripts/build-data.js';
import { buildParaglideUrlPatterns } from './scripts/route-slugs.js';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Absolute deploy base path (e.g. "" for a root site, "/meshcore-ninja" for a
// GitHub-Pages project site). Paraglide's URL strategy must know about it so it
// can locate the locale segment after the base path.
const BASE_PATH = (process.env.BASE_PATH ?? '').replace(/\/+$/, '');
const paraglideUrlPatterns = buildParaglideUrlPatterns(BASE_PATH, projectRoot);

// Recompile data.json whenever a YAML file under data/ changes. Rewriting
// src/lib/generated/data.json makes Vite hot-reload the modules that import it.
function yamlDataPlugin() {
  const dataDir = join(projectRoot, 'data');
  const isYaml = (f) => f.startsWith(dataDir) && /\.ya?ml$/.test(f);
  const isDeviceAsset = (f) => f.startsWith(join(dataDir, 'devices')) && /\.(svg|pdf)$/.test(f);
  return {
    name: 'meshcore-yaml-data',
    configureServer(server) {
      server.watcher.add(dataDir);
      const regen = async (file) => {
        if (!isYaml(file) && !isDeviceAsset(file)) return;
        try {
          const c = await buildData(projectRoot);
          server.config.logger.info(
            `\x1b[32m[data]\x1b[0m rebuilt data.json - ${c.firmwares} firmwares, ${c.devices} devices`
          );
        } catch (err) {
          server.config.logger.error(`[data] failed to rebuild: ${err.message}`);
        }
      };
      server.watcher.on('change', regen);
      server.watcher.on('add', regen);
      server.watcher.on('unlink', regen);
    }
  };
}

const pwaStartUrl = BASE_PATH ? `${BASE_PATH}/` : '/';
const pwaScope = pwaStartUrl;

export default defineConfig({
  base: BASE_PATH ? `${BASE_PATH}/` : '/',
  plugins: [
    yamlDataPlugin(),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['url', 'baseLocale'],
      urlPatterns: paraglideUrlPatterns
    }),
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      kit: {
        adapterFallback: '404.html'
      },
      workbox: {
        // The app bundle includes a large tools/devicon chunk (~5.3 MB).
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024
      },
      manifest: {
        name: 'MeshCore Ninja',
        short_name: 'MeshCore Ninja',
        description: 'MeshCore devices, firmware, software and networks.',
        start_url: pwaStartUrl,
        scope: pwaScope,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#111111',
        icons: [
          {
            src: `${BASE_PATH}/pwa-192.png`,
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: `${BASE_PATH}/pwa-512.png`,
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: `${BASE_PATH}/pwa-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  // Expose the deploy base path to app code for building absolute (canonical /
  // OG / JSON-LD) URLs. SvelteKit's $app/paths `base` is relative in this static
  // build, so it can't be used for that; this mirrors what build-data.js reads.
  define: {
    'import.meta.env.VITE_BASE_PATH': JSON.stringify(
      (process.env.BASE_PATH ?? '').replace(/\/+$/, '')
    ),
    'import.meta.env.VITE_SITE_ORIGIN': JSON.stringify(
      (process.env.VITE_SITE_ORIGIN ?? process.env.SITE_ORIGIN ?? 'https://meshcore.ninja').replace(
        /\/+$/,
        ''
      )
    ),
    'import.meta.env.VITE_VERSION_SUFFIX': JSON.stringify(process.env.VITE_VERSION_SUFFIX ?? '')
  },
  server: {
    // Allow the dev server to serve device images that live under data/.
    fs: { allow: [projectRoot] }
  }
});
