/**
 * Swappable randomness.
 *
 * Every stochastic path in the core takes a `Random`, never `Math.random`, so
 * tests can pin a seed and get byte-identical results.
 */

export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
}

/** Uniform integer in [minInclusive, maxInclusive]. */
export function nextInt(rng: Random, minInclusive: number, maxInclusive: number): number {
  if (maxInclusive < minInclusive) {
    throw new Error(`nextInt: empty range ${minInclusive}..${maxInclusive}`);
  }
  const span = maxInclusive - minInclusive + 1;
  return minInclusive + Math.floor(rng.next() * span);
}

/** Uniform float in [min, max). */
export function nextFloat(rng: Random, min: number, max: number): number {
  return min + rng.next() * (max - min);
}

/** True with probability `p` (p <= 0 never, p >= 1 always). */
export function chance(rng: Random, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return rng.next() < p;
}

/** Picks one element. Throws on an empty array so bugs surface immediately. */
export function pick<T>(rng: Random, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick: empty array');
  const item = items[nextInt(rng, 0, items.length - 1)];
  return item as T;
}

/** Non-destructive Fisher-Yates shuffle. */
export function shuffled<T>(rng: Random, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = nextInt(rng, 0, i);
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * mulberry32: small, fast, good enough for gameplay, and fully reproducible
 * from a 32-bit seed.
 */
/**
 * A seeded stream that can say where it is.
 *
 * `Random` stays a single method so a caller can still inject anything that
 * produces numbers. This is the one core makes, and it can be saved and
 * picked up again - without that, loading a game would rewind the stream
 * and hand out ids that already exist.
 */
export interface SeededRandom extends Random {
  /** The position in the stream. Pass it to `resumeSeededRandom`. */
  state(): number;
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = Math.trunc(seed) >>> 0;
  // A zero state would degenerate, so nudge it.
  if (state === 0) state = 0x9e3779b9;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state(): number {
      return state;
    },
  };
}

/** Picks the stream up exactly where `state()` left it. */
export function resumeSeededRandom(state: number): SeededRandom {
  return createSeededRandom(Math.trunc(state) >>> 0);
}

/** Derives a stable seed from a string, for "same name -> same monster" flows. */
export function seedFromString(text: string): number {
  // FNV-1a 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Non-deterministic source. Only for production code paths, never in tests. */
export function createSystemRandom(): Random {
  return { next: () => Math.random() };
}
