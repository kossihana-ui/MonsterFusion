import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameConfig } from '../src/core/config.ts';
import { canFuse, createRootMonster, fuse, fuseDetailed, parentIdsOf } from '../src/core/fusion.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../src/shared/types.ts';
import { fusionChain, testContext } from './helpers.ts';

test('fusion produces a child monster', () => {
  const context = testContext(42);
  const a = createRootMonster(context, { name: 'Alpha' });
  const b = createRootMonster(context, { name: 'Beta' });
  const child = fuse(a, b, context);

  assert.ok(child.id);
  assert.notEqual(child.id, a.id);
  assert.notEqual(child.id, b.id);
  assert.ok(child.name.length > 0);
  assert.ok(child.stats.hp > 0);
});

test('generation increases by one over the older parent', () => {
  const { chain } = fusionChain(5, 7);
  chain.forEach((monster, index) => {
    assert.equal(monster.generation, index, `chain[${index}] generation`);
  });
});

test('parent ids are stored and the parents are left untouched', () => {
  const context = testContext(99);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const snapshotA = JSON.stringify(a);
  const child = fuse(a, b, context);

  assert.equal(child.parentAId, a.id);
  assert.equal(child.parentBId, b.id);
  assert.deepEqual(parentIdsOf(child), [a.id, b.id]);
  assert.equal(JSON.stringify(a), snapshotA, 'parent A must not be mutated');
  assert.equal(a.generation, 0);
});

test('a root monster has no parents', () => {
  const context = testContext(5);
  const root = createRootMonster(context);
  assert.equal(root.parentAId, null);
  assert.equal(root.parentBId, null);
  assert.equal(root.generation, 0);
  assert.deepEqual(root.fusionHistory, []);
});

test('a monster cannot be fused with itself', () => {
  const context = testContext(3);
  const a = createRootMonster(context);
  const check = canFuse(a, a);
  assert.equal(check.ok, false);
  assert.throws(() => fuse(a, a, context), /cannot be fused with itself/);
});

test('data size stays bounded over 150 generations', () => {
  const config = createGameConfig({ fusion: { historyLimit: 8 } });
  const { chain } = fusionChain(150, 2024, config);
  const deepest = chain.at(-1);
  assert.ok(deepest);
  assert.equal(deepest.generation, 150);

  // History is capped, not cumulative.
  assert.ok(
    deepest.fusionHistory.length <= 8,
    `history length ${deepest.fusionHistory.length} exceeds the limit`,
  );

  // Gene count is fixed: same loci, three allele slots, at every generation.
  const lociCount = CATEGORICAL_LOCI.length + NUMERIC_LOCI.length;
  assert.equal(Object.keys(deepest.genes).length, lociCount);

  // Serialised size of generation 150 is within a small factor of generation 1.
  const earlySize = JSON.stringify(chain[1]).length;
  const lateSize = JSON.stringify(deepest).length;
  assert.ok(
    lateSize < earlySize * 3,
    `size grew from ${earlySize} to ${lateSize} across 150 generations`,
  );
});

test('fusion history entries only ever hold ids', () => {
  const { chain } = fusionChain(20, 11);
  for (const monster of chain) {
    for (const record of monster.fusionHistory) {
      assert.equal(typeof record.childId, 'string');
      assert.equal(typeof record.parentAId, 'string');
      assert.equal(typeof record.parentBId, 'string');
      assert.deepEqual(Object.keys(record).sort(), [
        'childId',
        'createdAt',
        'generation',
        'mutationCount',
        'parentAId',
        'parentBId',
      ]);
    }
  }
});

test('the ancestry relation has no cycles', () => {
  const { chain } = fusionChain(40, 77);
  const byId = new Map(chain.map((m) => [m.id, m]));
  for (const monster of chain) {
    // A parent always has a strictly lower generation, which rules out a cycle.
    for (const parentId of parentIdsOf(monster)) {
      const parent = byId.get(parentId);
      if (parent) assert.ok(parent.generation < monster.generation);
    }
    assert.notEqual(monster.parentAId, monster.id);
    assert.notEqual(monster.parentBId, monster.id);
  }
});

test('the same seed reproduces the same fusion', () => {
  const run = () => {
    const context = testContext(12345);
    const a = createRootMonster(context);
    const b = createRootMonster(context);
    return fuseDetailed(a, b, context).child;
  };
  assert.deepEqual(run(), run());
});

test('different seeds generally produce different children', () => {
  const build = (seed: number) => {
    const context = testContext(seed);
    const a = createRootMonster(context);
    const b = createRootMonster(context);
    return JSON.stringify(fuse(a, b, context).genes);
  };
  const results = new Set([build(1), build(2), build(3), build(4), build(5)]);
  assert.ok(results.size > 1, 'seeds must not all collapse to one result');
});

test('an explicit name is kept', () => {
  const context = testContext(8);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const child = fuse(a, b, context, { name: 'Chimera' });
  assert.equal(child.name, 'Chimera');
});

test('the rng is the only source of randomness', () => {
  // Same seed, same system clock stubbed out: identical output means nothing
  // reached for Math.random or Date.now internally.
  const build = () => {
    const rng = createSeededRandom(2024);
    let counter = 0;
    const context = { rng, now: () => 0, nextId: () => `fixed-${counter++}` };
    const a = createRootMonster(context);
    const b = createRootMonster(context);
    return fuse(a, b, context);
  };
  assert.deepEqual(build(), build());
});
