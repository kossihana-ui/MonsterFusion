import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameConfig, DEFAULT_GAME_CONFIG } from '../src/core/config.ts';
import {
  appearanceSimilarity,
  applyTierTitle,
  canFuse,
  createRootMonster,
  fuse,
  fuseDetailed,
  previewEvolution,
} from '../src/core/fusion.ts';
import { createStarterMonster, STARTER_SPECS } from '../src/core/starters.ts';
import { statCapsForTier, statTotal, withinCaps } from '../src/core/stats.ts';
import { deserializeSaveFile, serializeSaveFile } from '../src/core/storage.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI, SIZE_LADDER } from '../src/shared/types.ts';
import type { Monster, StarterSpec } from '../src/core/index.ts';
import type { MonsterContext } from '../src/core/fusion.ts';
import { testContext } from './helpers.ts';

const moss = STARTER_SPECS[0] as StarterSpec;

/** Two separate individuals of the same design: the evolution case. */
function twinPair(seed: number, context: MonsterContext): [Monster, Monster] {
  const a = createStarterMonster(moss, context, { id: `twin-a-${seed}` });
  const b = createStarterMonster(moss, context, { id: `twin-b-${seed}` });
  return [a, b];
}

/** Climbs the tier ladder by repeatedly pairing two monsters of a tier. */
function climb(context: MonsterContext, steps: number): Monster[] {
  const line: Monster[] = [];
  let [a, b] = twinPair(0, context);
  for (let i = 0; i < steps; i++) {
    const left = fuse(a, b, context, { id: `t${i}-l` } as never);
    const right = fuse(b, a, context, { id: `t${i}-r` } as never);
    line.push(left);
    a = left;
    b = right;
  }
  return line;
}

test('two look-alikes evolve, and the result is predictable', () => {
  const context = testContext(1);
  const [a, b] = twinPair(0, context);

  assert.equal(appearanceSimilarity(a, b), 1, 'two of the same design look identical');

  const preview = previewEvolution(a, b);
  assert.equal(preview.willEvolve, true);
  assert.equal(preview.tier, 1);

  // Predictable: the same pairing evolves the same way whatever the seed.
  for (let seed = 0; seed < 25; seed++) {
    const child = fuse(a, b, testContext(seed));
    assert.equal(child.tier, 1);
    assert.equal(child.phenotype.size, 'medium', 'small steps up to medium');
    assert.equal(
      child.phenotype.crest,
      'flower',
      'evolving must not erase the species signature',
    );
    assert.equal(child.phenotype.bodyColor, a.phenotype.bodyColor, 'colour is kept');
    assert.equal(child.phenotype.element, a.phenotype.element, 'element is kept');
    assert.equal(child.phenotype.tail, 'vine', 'shared features are kept');
  }
});

test('an evolved monster keeps its parent name and gains a title', () => {
  const context = testContext(2);
  const [a, b] = twinPair(0, context);
  const child = fuse(a, b, context);
  assert.equal(child.name, 'Great Moss');

  assert.equal(applyTierTitle('Moss', 2, DEFAULT_GAME_CONFIG.fusion.tierTitles), 'King Moss');
  assert.equal(
    applyTierTitle('Great Moss', 2, DEFAULT_GAME_CONFIG.fusion.tierTitles),
    'King Moss',
    'a title must not stack on a title',
  );
  assert.equal(applyTierTitle('Great Moss', 0, DEFAULT_GAME_CONFIG.fusion.tierTitles), 'Moss');
});

test('the crest ladder can force a crest when a game wants one', () => {
  const crowned = createGameConfig({ fusion: { crestLadder: ['none', 'crown'] } });
  const context = testContext(20, crowned);
  const [a, b] = twinPair(0, context);
  const child = fuse(a, b, context);
  assert.equal(child.phenotype.crest, 'crown');
});

test('evolution climbs size, tier and strength together', () => {
  const context = testContext(3);
  const [a, b] = twinPair(0, context);
  const line = climb(context, 3);

  assert.deepEqual(line.map((m) => m.tier), [1, 2, 3]);
  assert.deepEqual(
    line.map((m) => m.phenotype.size),
    ['medium', 'large', 'giant'],
  );

  const totals = [statTotal(a.stats), ...line.map((m) => statTotal(m.stats))];
  for (let i = 1; i < totals.length; i++) {
    assert.ok(
      (totals[i] as number) > (totals[i - 1] as number),
      `tier ${i} (${totals[i]}) is not stronger than tier ${i - 1} (${totals[i - 1]})`,
    );
  }
});

test('the ladder stops: the size ceiling caps the mechanic', () => {
  const context = testContext(4);
  const line = climb(context, 3);
  const top = line.at(-1) as Monster;
  assert.equal(top.phenotype.size, 'giant');
  assert.equal(top.tier, DEFAULT_GAME_CONFIG.fusion.maxTier);

  // Pair two of the top rank: no room left on either ladder.
  const sibling = fuse(top, top.tier === 3 ? line[1] as Monster : top, context);
  assert.ok(sibling.tier <= DEFAULT_GAME_CONFIG.fusion.maxTier);

  const blocked = previewEvolution(top, top);
  assert.equal(blocked.willEvolve, false);
  assert.ok(blocked.blockedBy === 'max-tier' || blocked.blockedBy === 'max-size');
});

test('the top tier stays within its raised caps and does not run away', () => {
  const context = testContext(5);
  const [base] = twinPair(0, context);
  const line = climb(context, 3);
  const top = line.at(-1) as Monster;

  assert.ok(withinCaps(top.stats, DEFAULT_GAME_CONFIG.stats, top.tier));

  const caps = statCapsForTier(DEFAULT_GAME_CONFIG.stats, DEFAULT_GAME_CONFIG.fusion.maxTier);
  const plain = statCapsForTier(DEFAULT_GAME_CONFIG.stats, 0);
  assert.ok(caps.totalCap > plain.totalCap, 'the top tier gets more headroom');

  // The ladder is a real climb, but it never doubles a monster: eight base
  // monsters buy roughly half again as much power, not an unbeatable one.
  const growth = statTotal(top.stats) / statTotal(base.stats);
  assert.ok(growth > 1.2, `tier 3 is only ${growth.toFixed(2)}x the base monster`);
  assert.ok(growth < 1.8, `tier 3 is ${growth.toFixed(2)}x the base monster`);
});

test('mismatched monsters do not evolve', () => {
  const context = testContext(6);
  const a = createStarterMonster(moss, context, { id: 'a' });
  const other = createStarterMonster(STARTER_SPECS[2] as StarterSpec, context, { id: 'b' });

  const preview = previewEvolution(a, other);
  assert.equal(preview.willEvolve, false);
  assert.equal(preview.blockedBy, 'not-similar');
  assert.ok(preview.similarity < DEFAULT_GAME_CONFIG.fusion.evolveThreshold);

  const child = fuse(a, other, context);
  assert.equal(child.tier, 0);
});

test('tiers cannot be laundered through a weaker partner', () => {
  const context = testContext(7);
  const line = climb(context, 2);
  const king = line.at(-1) as Monster;
  const plain = createRootMonster(context, { name: 'Nobody' });

  const preview = previewEvolution(king, plain);
  assert.equal(preview.willEvolve, false);

  // A cross with a lower tier drops to the lower tier, so a high tier cannot
  // be carried along cheaply.
  const child = fuse(king, plain, context);
  assert.equal(child.tier, 0);
  assert.ok(withinCaps(child.stats, DEFAULT_GAME_CONFIG.stats, child.tier));
});

test('same-tier but dissimilar monsters are blocked by similarity, not by tier', () => {
  const context = testContext(8);
  const a = createStarterMonster(moss, context, { id: 'x' });
  const b = createStarterMonster(STARTER_SPECS[1] as StarterSpec, context, { id: 'y' });
  assert.equal(a.tier, b.tier);
  assert.equal(previewEvolution(a, b).blockedBy, 'not-similar');
});

test('the threshold and the ceiling are configurable', () => {
  const strict = createGameConfig({ fusion: { evolveThreshold: 1.01 } });
  const context = testContext(9, strict);
  const [a, b] = twinPair(0, context);
  assert.equal(previewEvolution(a, b, strict).willEvolve, false);
  assert.equal(fuse(a, b, context).tier, 0);

  const noEvolution = createGameConfig({ fusion: { maxTier: 0 } });
  const ctx2 = testContext(10, noEvolution);
  const [c, d] = twinPair(0, ctx2);
  assert.equal(previewEvolution(c, d, noEvolution).blockedBy, 'max-tier');
});

test('canFuse previews the evolution for the UI', () => {
  const context = testContext(11);
  const [a, b] = twinPair(0, context);
  const check = canFuse(a, b);
  assert.equal(check.ok, true);
  if (!check.ok) return;
  assert.equal(check.evolution.willEvolve, true);
  assert.equal(check.evolution.tier, 1);
  assert.equal(check.evolution.similarity, 1);
});

test('fuseDetailed reports which loci were pinned', () => {
  const context = testContext(12);
  const [a, b] = twinPair(0, context);
  const result = fuseDetailed(a, b, context);

  assert.equal(result.evolution.willEvolve, true);
  // Every appearance locus is pinned, so the look cannot drift...
  assert.deepEqual([...result.lockedLoci].sort(), [...CATEGORICAL_LOCI].sort());
  for (const locus of CATEGORICAL_LOCI) {
    assert.ok(!result.mutatedLoci.includes(locus), `${locus} mutated during an evolution`);
  }
  // ...while the ability tendencies are still free to drift a little, so two
  // King Mosses are not numerically identical.
  assert.ok(result.mutatedLoci.every((locus) => NUMERIC_LOCI.includes(locus as never)));
});

test('an evolved monster still carries recessive variety', () => {
  const context = testContext(13);
  const [a, b] = twinPair(0, context);
  const child = fuse(a, b, context);
  const carriers = Object.values(child.genes).filter((pair) => pair.hidden !== null);
  assert.ok(carriers.length > 0, 'evolving must not strip the hidden carriers');
});

test('tier survives a save round-trip', () => {
  const context = testContext(14);
  const line = climb(context, 2);
  const restored = deserializeSaveFile(serializeSaveFile(line, { now: () => 0 }));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value.monsters.map((m) => m.tier), [1, 2]);
});

test('the size ladder is the ordering the evolution walks', () => {
  assert.deepEqual(SIZE_LADDER, ['tiny', 'small', 'medium', 'large', 'giant']);
});
