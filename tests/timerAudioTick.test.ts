import { describe, it, expect } from 'vitest';
import { soundEngine } from '../src/ui/TacticalAudio';

describe('Procedural Planning Timer Rhythm Tick & Sound Engine', () => {
  it('exposes playTimerTick and handles both regular and urgent ticks cleanly without errors', () => {
    expect(typeof soundEngine.playTimerTick).toBe('function');

    // Test regular "doo" tick (>10s)
    expect(() => soundEngine.playTimerTick(false)).not.toThrow();

    // Test urgent louder "doo" tick (<=10s)
    expect(() => soundEngine.playTimerTick(true)).not.toThrow();
  });

  it('exposes playTimerExpiredDooo for 3-second loud alarm on countdown expiration', () => {
    expect(typeof soundEngine.playTimerExpiredDooo).toBe('function');
    expect(() => soundEngine.playTimerExpiredDooo()).not.toThrow();
  });

  it('exposes playCrowdCheer and playJumpBallWin with distinct acoustics', () => {
    expect(typeof soundEngine.playCrowdCheer).toBe('function');
    expect(typeof soundEngine.playJumpBallWin).toBe('function');

    expect(() => soundEngine.playCrowdCheer(1.5)).not.toThrow();
    expect(() => soundEngine.playJumpBallWin()).not.toThrow();
  });
});
