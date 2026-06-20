import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildData } from './scripts/build-data.js';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Recompile data.json whenever a YAML file under data/ changes. Rewriting
// src/lib/generated/data.json makes Vite hot-reload the modules that import it.
function yamlDataPlugin() {
  const dataDir = join(projectRoot, 'data');
  const isYaml = (f) => f.startsWith(dataDir) && /\.ya?ml$/.test(f);
  return {
    name: 'meshcore-yaml-data',
    configureServer(server) {
      server.watcher.add(dataDir);
      const regen = (file) => {
        if (!isYaml(file)) return;
        try {
          const c = buildData(projectRoot);
          server.config.logger.info(
            `[32m[data][0m rebuilt data.json — ${c.firmwares} firmwares, ${c.devices} devices`
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

export default defineConfig({
  plugins: [yamlDataPlugin(), tailwindcss(), sveltekit()],
  server: {
    // Allow the dev server to serve device images that live under data/.
    fs: { allow: [projectRoot] }
  }
});
