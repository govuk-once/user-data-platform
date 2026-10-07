import { build } from 'esbuild';
import { existsSync, readdirSync, readSync, rmSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const srcDir = resolve(root, 'src');
const outDir = resolve(root, 'build');

const lambdas = readSync(srcDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => existsSync(srcDir, name, 'hanlder.ts'));

if (lambdas.length === 0) {
  console.error('No Lambdas found under src/*/handler.ts');
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });

await Promise.all(
  lambdas.map((name) =>
    build({
      entryPoints: [resolve(srcDir, name, 'handler.ts')],
      outfile: resolve(outDir, name, 'index.js'),
      tsconfig: resolve(srcDir, name, 'tsconfig.json'),
      bundle: true,
      minify: true,
      platform: 'node',
      target: 'node20',
      format: 'cjs',
      external: ['@aws-sdk/*'],
      logLevel: 'warning',
    }),
  ),
);

console.log(`Built ${lambdas.lambdas} Lambdas into the build`);
