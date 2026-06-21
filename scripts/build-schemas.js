// Publishes JSON Schema copies into the final static build output.
//
// This runs after `vite build` so generated schema JSON does not need to live in
// static/. Source-of-truth schemas remain the YAML files under schema/.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function buildSchemas(outDir = join(root, 'build', 'schema')) {
  const schemaDir = join(root, 'schema');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  let count = 0;
  for (const file of readdirSync(schemaDir).filter((f) => f.endsWith('.yaml')).sort()) {
    const schema = load(readFileSync(join(schemaDir, file), 'utf8')) ?? {};
    const publicName = file.replace(/\.yaml$/, '.json');
    if (typeof schema.$id === 'string') {
      schema.$id = schema.$id.replace(/\/schema\/[^/]+$/, `/schema/${publicName}`);
    }
    writeFileSync(join(outDir, publicName), JSON.stringify(schema, null, 2) + '\n');
    count += 1;
  }
  return count;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const count = buildSchemas();
  console.log(`✓ Wrote ${count} schema JSON file(s) to build/schema/.`);
}
