import { build } from 'esbuild';
import { readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'src');
const senariosDir = resolve(srcDir, 'scenarios');

const rootEntries = readdirSync(srcDir)
  .filter((file) => file.endsWith('.ts') && !file.startsWith('_'))
  .map((file) => resolve(srcDir, file));

const scenarioEntries = existsSync(senariosDir)
  ? readdirSync(senariosDir)
      .filter((file) => file.endsWith('.ts') && !file.startsWith('_'))
      .map((file) => resolve(senariosDir, file))
  : [];

await build({
  entryPoints: [...rootEntries, ...scenarioEntries],
  outdir: resolve(__dirname, '..', 'dist'),
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'cjs',
  external: ['k6', 'k6/*'],
  sourcemap: false,
  minify: false,
});

console.log('Build complete');
