/** Shared test fixtures. Everything here is deterministic. */

import type { Monster } from '../src/shared/types.ts';
import type { MonsterContext } from '../src/core/fusion.ts';
import { createRootMonster, fuse } from '../src/core/fusion.ts';
import type { GameConfig } from '../src/core/config.ts';
import { createSeededRandom } from '../src/core/random.ts';

/**
 * A context with a seeded rng, a fixed clock and sequential ids, so a test run
 * is byte-identical every time.
 */
export function testContext(seed: number, config?: GameConfig): MonsterContext {
  const rng = createSeededRandom(seed);
  let tick = 0;
  let counter = 0;
  return {
    rng,
    ...(config ? { config } : {}),
    now: () => 1_700_000_000_000 + tick++ * 1000,
    nextId: () => `m${(counter++).toString().padStart(4, '0')}`,
  };
}

/** Builds a chain of fusions: roots, then child = fuse(previous, freshRoot). */
export function fusionChain(
  depth: number,
  seed = 1,
  config?: GameConfig,
): { chain: Monster[]; context: MonsterContext } {
  const context = testContext(seed, config);
  let current = createRootMonster(context);
  const chain: Monster[] = [current];
  for (let i = 0; i < depth; i++) {
    const partner = createRootMonster(context);
    current = fuse(current, partner, context);
    chain.push(current);
  }
  return { chain, context };
}
