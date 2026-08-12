/**
 * src/engine/ai/nn/browser.ts
 *
 * Browser-safe re-exports of the NN surface. This barrel deliberately
 * excludes anything that touches Node built-ins (fs, path, worker_threads)
 * so Vite's tree-shaker keeps the browser bundle lean.
 *
 * If you find yourself needing to import something that lives in the
 * training-only barrel (`nn/index.ts`), that is a signal that the code
 * calling it should move to a Node script instead.
 */

export { NNEngine, defaultNNEngine, getCNNModel, setCNNModel } from './engine';
export { createCNNModel, predictActionSync, predictAction } from './model';
export {
  createCNNModelFromCheckpoint,
  importModelCheckpoint,
  exportModelCheckpoint,
  promoteCheckpointTo64Channels,
  getCheckpointChannels,
} from './checkpoints';

export type { ModelCheckpoint } from './checkpoints';
export type { TrainingSample } from './model';
