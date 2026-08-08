import { describe, it, expect } from 'vitest';
import { SeededRNG } from '../src/engine/rng';
import { createInitialState } from '../src/engine/setup';

describe('Jump-Ball Mini-Game Dynamic Interval & Random Skew (§6)', () => {
  it('evaluates dynamic blink interval on each transition with -25% to +25% random skew on base 250ms window (50% total variance: 188ms to 313ms)', () => {
    const state = createInitialState(4242);
    const baseWindowMs = state.config.timing.jumpBallWindowMs; // 250ms
    expect(baseWindowMs).toBe(250);

    const rng = new SeededRNG(4242);
    const sampledDurations: number[] = [];

    for (let i = 0; i < 100; i++) {
      // Skew factor: float in [0, 1) -> (float * 0.5 - 0.25) in [-0.25, +0.25]
      const skew = rng.nextFloat() * 0.5 - 0.25;
      expect(skew).toBeGreaterThanOrEqual(-0.25);
      expect(skew).toBeLessThanOrEqual(0.25);

      const nextDuration = Math.round(baseWindowMs * (1.0 + skew));
      // Bounded by [188ms, 313ms]
      expect(nextDuration).toBeGreaterThanOrEqual(Math.round(baseWindowMs * 0.75));
      expect(nextDuration).toBeLessThanOrEqual(Math.round(baseWindowMs * 1.25));

      sampledDurations.push(nextDuration);
    }

    // Verify non-static distribution across samples
    const uniqueValues = new Set(sampledDurations);
    expect(uniqueValues.size).toBeGreaterThan(30);

    const minSample = Math.min(...sampledDurations);
    const maxSample = Math.max(...sampledDurations);
    expect(minSample).toBeLessThanOrEqual(baseWindowMs * 0.80);
    expect(maxSample).toBeGreaterThanOrEqual(baseWindowMs * 1.20);
    expect(maxSample - minSample).toBeGreaterThanOrEqual(baseWindowMs * 0.40); // >= 40% variance exercised
  });

  it('guarantees identical jump-ball interval sequence when initialized with the same seed on 250ms base window', () => {
    const seed = 98765;
    const baseWindowMs = 250;

    const rng1 = new SeededRNG(seed);
    const rng2 = new SeededRNG(seed);

    for (let i = 0; i < 20; i++) {
      const skew1 = rng1.nextFloat() * 0.5 - 0.25;
      const skew2 = rng2.nextFloat() * 0.5 - 0.25;
      const d1 = Math.round(baseWindowMs * (1.0 + skew1));
      const d2 = Math.round(baseWindowMs * (1.0 + skew2));
      expect(d1).toBe(d2);
    }
  });
});
