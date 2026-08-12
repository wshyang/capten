import * as fs from 'fs';
import * as path from 'path';
import type { ModelCheckpoint } from './checkpoints';
import type { TrainingSample } from './model';

export type FlywheelStatus =
  | 'IDLE'
  | 'COLLECTING_SELF_PLAY'
  | 'TRAINING_CHALLENGER'
  | 'EVALUATING_ARENA'
  | 'PROMOTED'
  | 'REJECTED';

export interface ResumableFlywheelState {
  currentGeneration: number;
  status: FlywheelStatus;
  completedSelfPlayGames: number;
  completedArenaMatches: number;
  arenaScore: {
    challengerScore: number;
    championScore: number;
    w: number;
    l: number;
    d: number;
  };
  championCheckpointKey: string;
  challengerCheckpointKey?: string;
  replayBufferKey: string;
  timestamp: number;
  progressionHistory?: Array<any>;
}

/**
 * Storage backend abstraction supporting browser LocalStorage, IndexedDB adapters, or in-memory test stores.
 */
export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  exists(key: string): boolean;
}

export class LocalStorageBackend implements StorageBackend {
  read(key: string): string | null {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch (_e) {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (_e) {
      // ignore quota exceeded or SSR environment
    }
  }

  exists(key: string): boolean {
    return this.read(key) !== null;
  }
}

export class InMemoryStorageBackend implements StorageBackend {
  private store = new Map<string, string>();

  read(key: string): string | null {
    return this.store.get(key) || null;
  }

  write(key: string, value: string): void {
    this.store.set(key, value);
  }

  exists(key: string): boolean {
    return this.store.has(key);
  }
}

export class FileStorageBackend implements StorageBackend {
  private baseDir: string;

  constructor(baseDir = './checkpoints') {
    this.baseDir = baseDir;
  }

  read(key: string): string | null {
    try {
      const filePath = path.join(this.baseDir, `${key}.json`);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
      return null;
    } catch (_e) {
      return null;
    }
  }

  write(key: string, value: string): void {
    try {
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
      const filePath = path.join(this.baseDir, `${key}.json`);
      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, value, 'utf8');
      fs.renameSync(tmpPath, filePath);
    } catch (_e) {
      // ignore in browser
    }
  }

  exists(key: string): boolean {
    return this.read(key) !== null;
  }
}

/**
 * Saves the ResumableFlywheelState manifest to a storage backend.
 */
export function saveFlywheelManifest(
  key: string,
  manifest: ResumableFlywheelState,
  backend: StorageBackend = new LocalStorageBackend()
): void {
  backend.write(key, JSON.stringify(manifest, null, 2));
}

/**
 * Reads a saved ResumableFlywheelState manifest from a storage backend if it exists.
 */
export function loadFlywheelManifest(
  key: string,
  backend: StorageBackend = new LocalStorageBackend()
): ResumableFlywheelState | null {
  const raw = backend.read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ResumableFlywheelState;
  } catch (_e) {
    return null;
  }
}

/**
 * Saves a ModelCheckpoint as JSON to a storage backend.
 */
export function saveCheckpointToStorage(
  key: string,
  checkpoint: ModelCheckpoint,
  backend: StorageBackend = new LocalStorageBackend()
): void {
  backend.write(key, JSON.stringify(checkpoint, null, 2));
}

/**
 * Loads a ModelCheckpoint from a storage backend JSON string.
 */
export function loadCheckpointFromStorage(
  key: string,
  backend: StorageBackend = new LocalStorageBackend()
): ModelCheckpoint | null {
  const raw = backend.read(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ModelCheckpoint;
  } catch (_e) {
    return null;
  }
}

/**
 * Saves an Experience Replay Buffer of TrainingSamples to JSONL string in storage backend.
 */
export function saveReplayBufferToStorage(
  key: string,
  samples: TrainingSample[],
  backend: StorageBackend = new LocalStorageBackend()
): void {
  const lines = samples.map((s: TrainingSample) =>
    JSON.stringify({
      stateTensor: Array.from(s.stateTensor),
      policyTarget: Array.from(s.policyTarget),
      valueTarget: s.valueTarget,
    })
  );
  backend.write(key, lines.join('\n') + '\n');
}

/**
 * Loads an Experience Replay Buffer from JSONL string in storage backend.
 */
export function loadReplayBufferFromStorage(
  key: string,
  backend: StorageBackend = new LocalStorageBackend()
): TrainingSample[] {
  const raw = backend.read(key);
  if (!raw) return [];
  try {
    const lines = raw.split('\n').filter((l: string) => l.trim().length > 0);
    return lines.map((line: string) => {
      const parsed = JSON.parse(line);
      return {
        stateTensor: new Float32Array(parsed.stateTensor),
        policyTarget: new Float32Array(parsed.policyTarget),
        valueTarget: parsed.valueTarget,
      };
    });
  } catch (_e) {
    return [];
  }
}
