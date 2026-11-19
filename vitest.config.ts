import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Pure-function tests only for now. Component tests arrive with Phase 04 and
    // will need the jsdom environment plus @testing-library/react.
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/utils/**'],
    },
  },
});
