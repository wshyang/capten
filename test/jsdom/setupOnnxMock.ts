/**
 * test/jsdom/setupOnnxMock.ts
 *
 * jsdom cannot load onnxruntime-web (no WebAssembly.instantiateStreaming,
 * no fetch of .wasm binaries, no WebGPU). Every jsdom test file gets this
 * setup so any import of `onnxruntime-web` — direct or transitive — is
 * replaced with a dummy session that returns a uniform policy.
 *
 * Behaviourally: as long as the config's `inferenceBackend === 'tfjs'`
 * (the default), this mock is never called. It exists so jsdom-side
 * tests that DO exercise the `'onnx'` branch (e.g. asyncAITurn tests)
 * don't blow up on module init.
 */

import { vi } from 'vitest';

vi.mock('onnxruntime-web', () => {
  class MockTensor {
    constructor(
      public type: string,
      public data: Float32Array | Int32Array,
      public dims: number[],
    ) {}
  }

  const inputName = 'input1';
  const mockSession = {
    inputNames: [inputName],
    outputNames: ['policy_head', 'value_head'],
    run: async () => ({
      policy_head: {
        data: new Float32Array(64).fill(1 / 64),
        dims: [1, 64],
      },
      value_head: {
        data: new Float32Array([0]),
        dims: [1, 1],
      },
    }),
  };

  return {
    InferenceSession: {
      create: async () => mockSession,
    },
    Tensor: MockTensor,
    env: {
      wasm: { wasmPaths: '' },
    },
  };
});
