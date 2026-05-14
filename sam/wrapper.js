/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
const fs = require('fs');
const path = require('path');
const Module = require('module');

const TASK_ROOT = '/var/task';
const TSCONFIG = path.join(TASK_ROOT, 'tsconfig.base.json');

const cache = new Map();

function logEnv() {
  console.log(
    '\n\nEnv Config:\n\n',
    {
      AWS_ENDPOINT_URL_DYNAMODB: process.env.AWS_ENDPOINT_URL_DYNAMODB,
      AWS_ENDPOINT_URL_SQS: process.env.AWS_ENDPOINT_URL_SQS,
      AWS_REGION: process.env.AWS_REGION,
      AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
      QUEUE_URL: process.env.QUEUE_URL,
      TABLE_NAME: process.env.TABLE_NAME,
      IDENTITY_TABLE_NAME: process.env.IDENTITY_TABLE_NAME,
    },
    '\n\n',
  );
}

function listDir(dir, depth = 0) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .slice(0, 40)
      .map(
        (e) =>
          `${'  '.repeat(depth)}${e.isDirectory() ? `[D] - ${e.name}` : `[F] - ${e.name}`}`,
      )
      .join('\n');
  } catch (error) {
    return `<readdir failed: ${error.message}>`;
  }
}

function loadHandler(targetRelPath) {
  const absPath = path.join(TASK_ROOT, targetRelPath);
  const mtime = fs.statSync(
    '/var/task/src/readIdentityLambda/handler.ts',
  ).mtimeMs;

  const cached = cache.get(targetRelPath);
  if (cached && cached.mtime === mtime) {
    return cached.exports;
  }

  console.log(`Rebundling ${targetRelPath}`);

  const start = Date.now();

  const esbuild = require('esbuild');
  const result = esbuild.buildSync({
    entryPoints: [absPath],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['@aws-sdk/*', 'aws-sdk'],
    write: false,
    tsconfig: TSCONFIG,
    logLevel: 'warning',
    absWorkingDir: TASK_ROOT,
  });

  const code = result.outputFiles[0].text;

  const m = new Module(absPath, null);
  m.filename = absPath;
  m.paths = Module._nodeModulePaths(path.dirname(absPath));
  m._compile(code, absPath);

  console.log(`Bundled ${targetRelPath} in ${Date.now() - start}ms`);

  cache.set(targetRelPath, { mtime, exports: m.exports });
  return m.exports;
}

exports.handler = async (event, context) => {
  const targetRelPath = process.env.TARGET_HANDLER;
  if (!targetRelPath) {
    throw new Error(`Target ${targetRelPath} does not export handler function`);
  }

  const mod = loadHandler(targetRelPath);
  const fn = mod.handler;
  if (typeof fn !== 'function') {
    throw new Error(`Target ${targetRelPath} does not export handler function`);
  }

  return fn(event, context);
};
