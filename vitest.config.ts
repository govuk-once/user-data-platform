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
      enabled: false,
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text'],
    },
  },
  resolve: {
    alias: {
      '@libs/data-access': path.resolve(
        __dirname,
        './libs/data-access/index.ts',
      ),
      '@libs/utils': path.resolve(__dirname, './libs/utils/index.ts'),
    },
  },
});
