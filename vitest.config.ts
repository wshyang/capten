import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['test/jsdom/**', 'jsdom'],
      ['tests/jsdom/**', 'jsdom'],
    ],
    // jsdom cannot load onnxruntime-web (no wasm streaming, no WebGPU).
    // Auto-inject the ORT mock into every jsdom test so any transitive
    // import of onnxruntime-web resolves to a uniform-policy stub.
    setupFiles: ['./test/jsdom/setupOnnxMock.ts'],
    testTimeout: 30000,
  },
});
