import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createStarterMonster,
  createStarterMonsters,
  findStarterSpec,
  STARTER_SPECS,
} from '../src/core/starters.ts';
import { fuse } from '../src/core/fusion.ts';
import { simulateDuel } from '../src/core/battle.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { withinCaps } from '../src/core/stats.ts';
import { deserializeSaveFile, serializeSaveFile } from '../src/core/storage.ts';
import { CATEGORICAL_LOCI } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

test('there are three starters with stable ids', () => {
  const ids = STARTER_SPECS.map((s) => s.id);
  assert.deepEqual(ids, ['starter-moss', 'starter-ignis', 'starter-aqua']);

  const monsters = createStarterMonsters(testContext(1));
  assert.deepEqual(monsters.map((m) => m.id), ids);

  // Ids must not depend on the rng, or saves would stop matching the art.
  const other = createStarterMonsters(testContext(999));
  assert.deepEqual(other.map((m) => m.id), ids);
});

test('each starter expresses exactly the appearance its art shows', () => {
  for (const spec of STARTER_SPECS) {
    for (let seed = 0; seed < 20; seed++) {
      const monster = createStarterMonster(spec, testContext(seed));
      for (const locus of CATEGORICAL_LOCI) {
        const designed = (spec.appearance as unknown as Record<string, unknown>)[locus];
        if (designed === undefined) continue;
        assert.equal(
          (monster.phenotype as unknown as Record<string, unknown>)[locus],
          designed,
          `${spec.id} seed ${seed}: ${locus} did not match the art`,
        );
      }
    }
  }
});

test('the new loci carry the designed features', () => {
  const [moss, ignis, aqua] = createStarterMonsters(testContext(2));
  assert.ok(moss && ignis && aqua);

  assert.equal(moss.phenotype.crest, 'flower');
  assert.equal(moss.phenotype.tail, 'vine');
  assert.equal(ignis.phenotype.eyes, 'slit');
  assert.equal(ignis.phenotype.horns, 'spiral');
  assert.equal(aqua.phenotype.bodyShape, 'finned');
  assert.equal(aqua.phenotype.jaw, 'maw');
});

test('the designed tendencies are what the starter plays with', () => {
  for (const spec of STARTER_SPECS) {
    const monster = createStarterMonster(spec, testContext(5));
    for (const [locus, value] of Object.entries(spec.tendencies)) {
      assert.equal(
        (monster.phenotype as unknown as Record<string, number>)[locus],
        value,
        `${spec.id}: ${locus}`,
      );
    }
  }
});

test('starters stay within the stat caps and are roughly balanced', () => {
  const monsters = createStarterMonsters(testContext(3));
  const totals = monsters.map((m) => {
    assert.ok(withinCaps(m.stats), `${m.name} breached a cap`);
    return m.stats.hp + m.stats.attack + m.stats.defense + m.stats.magic + m.stats.speed;
  });
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  assert.ok(max <= min * 1.2, `starter totals are uneven: ${totals.join(', ')}`);
});

test('starters keep hidden variety, so two players differ underneath', () => {
  const first = createStarterMonster(STARTER_SPECS[0] as never, testContext(10));
  const second = createStarterMonster(STARTER_SPECS[0] as never, testContext(11));

  assert.deepEqual(first.phenotype, second.phenotype, 'the visible design is fixed');
  assert.notDeepEqual(first.genes, second.genes, 'the hidden carriers should differ');
});

test('starters are generation 0 and fuse like any other monster', () => {
  const context = testContext(4);
  const [moss, ignis] = createStarterMonsters(context);
  assert.ok(moss && ignis);
  assert.equal(moss.generation, 0);
  assert.equal(moss.parentAId, null);

  const child = fuse(moss, ignis, context);
  assert.equal(child.generation, 1);
  assert.equal(child.parentAId, 'starter-moss');
  assert.ok(withinCaps(child.stats));
});

test('a designed feature can reach a fused child', () => {
  const context = testContext(6);
  const [moss, ignis] = createStarterMonsters(context);
  assert.ok(moss && ignis);

  let flowered = 0;
  let slitEyed = 0;
  for (let seed = 0; seed < 60; seed++) {
    const child = fuse(moss, ignis, testContext(seed));
    if (child.phenotype.crest === 'flower') flowered++;
    if (child.phenotype.eyes === 'slit') slitEyed++;
  }
  assert.ok(flowered > 0, 'the flower crest never reached a child');
  assert.ok(slitEyed > 0, 'the slit eyes never reached a child');
});

test('starters battle and save correctly', () => {
  const monsters = createStarterMonsters(testContext(7));
  const [moss, ignis] = monsters;
  assert.ok(moss && ignis);

  const final = simulateDuel(moss, ignis, createSeededRandom(7));
  assert.notEqual(final.outcome.status, 'ongoing');

  const restored = deserializeSaveFile(serializeSaveFile(monsters, { now: () => 0 }));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value.monsters, monsters);
});

test('a spec can be looked up by id for art resolution', () => {
  const spec = findStarterSpec('starter-aqua');
  assert.ok(spec);
  assert.equal(spec.art, 'aqua-v2-64.png');
  assert.equal(findStarterSpec('nope'), undefined);
});
