/**
 * Seeded PRNG implementation using Mulberry32.
 * Ensures 100% determinism: same seed => identical random sequence.
 */

export class SeededRNG {
  private state: number;
  private readonly initialSeed: number;

  constructor(seed: number) {
    this.initialSeed = Math.floor(Math.abs(seed)) || 1337;
    this.state = this.initialSeed;
  }

  public getSeed(): number {
    return this.initialSeed;
  }

  public getState(): number {
    return this.state;
  }

  public setState(state: number): void {
    this.state = state;
  }

  /**
   * Generates a pseudo-random float in [0, 1)
   */
  public nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return result;
  }

  /**
   * Generates an integer in [min, max] inclusive
   */
  public nextInt(min: number, max: number): number {
    if (min >= max) return min;
    const f = this.nextFloat();
    return Math.floor(f * (max - min + 1)) + min;
  }

  /**
   * Generates a boolean with given true probability
   */
  public nextBool(p = 0.5): boolean {
    return this.nextFloat() < p;
  }

  /**
   * Deterministic Fisher-Yates array shuffle (in-place clone)
   */
  public shuffle<T>(array: readonly T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const temp = arr[i];
      arr[i] = arr[j];
      arr[j] = temp;
    }
    return arr;
  }

  /**
   * Picks a random element from an array
   */
  public sample<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error("Cannot sample an empty array");
    }
    const idx = this.nextInt(0, array.length - 1);
    return array[idx];
  }

  /**
   * Clones current PRNG with identical state
   */
  public clone(): SeededRNG {
    const copy = new SeededRNG(this.initialSeed);
    copy.setState(this.state);
    return copy;
  }
}

/**
 * Creates a seeded PRNG helper instance
 */
export function createRNG(seed: number): SeededRNG {
  return new SeededRNG(seed);
}
