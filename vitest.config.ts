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
      '@libs/utils': path.resolve(__dirname, './libs/utils/index.ts'),
      '@libs/schemas': path.resolve(__dirname, './libs/schemas/index.ts'),
      '@libs/middleware': path.resolve(__dirname, './libs/middleware/index.ts'),
    },
  },
});
