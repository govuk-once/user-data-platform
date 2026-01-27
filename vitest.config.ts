import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@libs/data-access': path.resolve(
        __dirname,
        './libs/data-access/index.ts',
      ),
      '@libs/appconfig': path.resolve(__dirname, './libs/appconfig/index.ts'),
      '@libs/utils': path.resolve(__dirname, './libs/utils/index.ts'),
    },
  },
});
