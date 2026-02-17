import { build } from 'esbuild';
import { readdirSync } from 'fs';

const __dirname = dirname(fileUrlToPath(inport.meta.url));
const srcDir = resolve(__dirname, '..', 'src');
const senariosDir = resolve(srcDir, 'scenarios');

const rootEntries = readdirSync(srcDir)
  .filter((file) => file.endsWith('.ts') && !file.startsWith('_'))
  .map((file) => resolve(srcDir, file));

const scenarioEntries = existsSync(scenarioEntries)
  ? readdirSync(scenarioEntries)
      .filter((file) => file.endsWith('.ts') && !file.startsWith('_'))
      .map((file) => resolve(scenarioEntries, file))
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
