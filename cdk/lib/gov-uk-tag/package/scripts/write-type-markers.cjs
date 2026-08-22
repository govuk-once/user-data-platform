#!/usr/bin/env node
/**
 * Writes the type marker files that make dual CJS/ESM output work.
 *
 * `tsc` emits `.js` into `dist/esm` and `dist/cjs`, but the extension alone
 * tells Node nothing — it resolves module format from the nearest
 * `package.json` `type` field, which would otherwise be the package root's.
 * Without these markers, whichever format disagrees with the root fails at
 * require/import time ("Cannot use import statement outside a module").
 *
 * Run after both `tsc` passes; see the `build` script.
 */

const { writeFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');

/** Output directory to the module type Node should assume for its contents. */
const MARKERS = {
  'dist/esm': 'module',
  'dist/cjs': 'commonjs',
};

for (const [dir, type] of Object.entries(MARKERS)) {
  const absoluteDir = join(ROOT, dir);

  // A missing directory means the corresponding tsc pass did not run or
  // failed — better to say so than to create an empty dir with a marker in
  // it and produce a package that resolves to nothing.
  if (!existsSync(absoluteDir)) {
    console.error(`[markers] ${dir} does not exist — did the build run?`);
    process.exit(1);
  }

  const target = join(absoluteDir, 'package.json');

  writeFileSync(target, `${JSON.stringify({ type }, null, 2)}\n`);

  console.log(`[markers] ${dir}/package.json → type: ${type}`);
}
