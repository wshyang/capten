import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['test/jsdom/**', 'jsdom'],
      ['tests/jsdom/**', 'jsdom'],
    ],
    testTimeout: 30000,
  },
});
