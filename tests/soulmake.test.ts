import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_GAME_CONFIG, createGameConfig } from '../src/core/config.ts';
import { createRootMonster } from '../src/core/fusion.ts';
import {
  addPart,
  createPartInventory,
  countOf,
  partFromFeature,
  partIdFor,
} from '../src/core/parts.ts';
import type { GenePart, PartInventory } from '../src/core/parts.ts';
import {
  getSoulMakeRecipe,
  previewSoulMake,
  soulMake,
  soulMakeLoci,
} from '../src/core/soulmake.ts';
import { CATEGORICAL_LOCI } from '../src/shared/types.ts';
import type { CategoricalLocus } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

/** A part for a feature, as a drop would produce it. */
function part(locus: CategoricalLocus, value: string): GenePart {
  return {
    id: partIdFor(locus, value),
    name: `${locus}:${value}`,
    locus,
    value,
    fromMonsterName: 'どこかの個体',
  };
}

/** An inventory holding one of each named part. */
function holding(...parts: readonly GenePart[]): PartInventory {
  let inventory = createPartInventory();
  for (const entry of parts) inventory = addPart(inventory, entry, 1);
  return inventory;
}

const BODY = part('bodyShape', 'serpentine');
const EYES = part('eyes', 'glowing');
const TAIL = part('tail', 'spiked');

// ---------------------------------------------------------------------------
// The recipe
// ---------------------------------------------------------------------------

test('the recipe says which slots are required and which are not', () => {
  const recipe = getSoulMakeRecipe();
  assert.deepEqual(recipe.requiredLoci, ['bodyShape', 'eyes']);
  assert.ok(recipe.optionalLoci.length > 0);

  // Every slot is a real locus, and no locus is in both lists.
  for (const locus of soulMakeLoci()) {
    assert.ok(CATEGORICAL_LOCI.includes(locus), `${locus} is not a locus`);
  }
  for (const locus of recipe.requiredLoci) {
    assert.ok(!recipe.optionalLoci.includes(locus), `${locus} is in both lists`);
  }
});

test('every slot in the recipe can actually be dropped', () => {
  // A recipe whose ingredients cannot be obtained is a screen that never
  // opens, which is the bug this check exists to catch.
  for (const locus of soulMakeLoci()) {
    assert.ok(
      DEFAULT_GAME_CONFIG.arena.dropLoci.includes(locus),
      `${locus} is a soul make slot but never drops`,
    );
  }
});

test('the recipe is config, not a constant', () => {
  const config = createGameConfig({ soulMake: { requiredLoci: ['tail'] } });
  assert.deepEqual(getSoulMakeRecipe(config.soulMake).requiredLoci, ['tail']);
});

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

test('a body and a pair of eyes is enough; neither alone is', () => {
  const full = previewSoulMake({ partIds: [BODY.id, EYES.id] }, holding(BODY, EYES));
  assert.equal(full.ok, true);
  assert.equal(full.cost, 2);
  assert.deepEqual(full.missingLoci, []);

  const noEyes = previewSoulMake({ partIds: [BODY.id] }, holding(BODY));
  assert.equal(noEyes.ok, false);
  assert.deepEqual(noEyes.missingLoci, ['eyes']);
  assert.ok(noEyes.message.includes('目'), noEyes.message);

  const nothing = previewSoulMake({ partIds: [] }, holding(BODY, EYES));
  assert.equal(nothing.ok, false);
  assert.deepEqual(nothing.missingLoci, ['bodyShape', 'eyes']);
});

test('optional slots are taken when offered, and cost one each', () => {
  const preview = previewSoulMake(
    { partIds: [BODY.id, EYES.id, TAIL.id] },
    holding(BODY, EYES, TAIL),
  );
  assert.equal(preview.ok, true);
  assert.equal(preview.cost, 3);
  assert.deepEqual(
    preview.placed.map((entry) => entry.locus),
    ['bodyShape', 'eyes', 'tail'],
    'required first, then optional, in recipe order',
  );
});

test('a part not held is refused, whatever the id looks like', () => {
  const held = holding(BODY, EYES);

  const unowned = previewSoulMake({ partIds: [BODY.id, EYES.id, TAIL.id] }, held);
  assert.equal(unowned.ok, false);
  assert.equal(unowned.cost, 0);

  const nonsense = previewSoulMake({ partIds: [BODY.id, EYES.id, 'part-nope'] }, held);
  assert.equal(nonsense.ok, false);

  const empty = previewSoulMake({ partIds: [BODY.id, EYES.id] }, createPartInventory());
  assert.equal(empty.ok, false);
});

test('two parts cannot share a slot, and one part cannot fill two', () => {
  const twoBodies = previewSoulMake(
    { partIds: [BODY.id, part('bodyShape', 'finned').id, EYES.id] },
    holding(BODY, part('bodyShape', 'finned'), EYES),
  );
  assert.equal(twoBodies.ok, false);
  assert.ok(twoBodies.message.includes('体型'), twoBodies.message);

  // The same id twice is two parts out of a stack of one.
  const twice = previewSoulMake({ partIds: [BODY.id, BODY.id, EYES.id] }, holding(BODY, EYES));
  assert.equal(twice.ok, false);
});

test('a part for a slot the recipe has no room for is refused', () => {
  const colour = part('bodyColor', 'red');
  const preview = previewSoulMake(
    { partIds: [BODY.id, EYES.id, colour.id] },
    holding(BODY, EYES, colour),
  );
  assert.equal(preview.ok, false);
  assert.ok(!soulMakeLoci().includes('bodyColor'), 'colour is not a slot');
});

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

test('the monster wears exactly what was placed', () => {
  const inventory = holding(BODY, EYES, TAIL);
  const result = soulMake(
    { partIds: [BODY.id, EYES.id, TAIL.id], name: 'ソウル' },
    inventory,
    testContext(1),
    'req-1',
  );

  assert.equal(result.ok, true, result.message);
  assert.ok(result.monster);
  assert.equal(result.monster.name, 'ソウル');
  assert.equal(result.monster.phenotype.bodyShape, 'serpentine');
  assert.equal(result.monster.phenotype.eyes, 'glowing');
  assert.equal(result.monster.phenotype.tail, 'spiked');
});

test('what was not placed is decided here, not left blank', () => {
  const result = soulMake(
    { partIds: [BODY.id, EYES.id] },
    holding(BODY, EYES),
    testContext(2),
    'req-2',
  );
  assert.ok(result.monster);
  const monster = result.monster;

  // A monster needs all of these to exist, and a screen must not invent them.
  for (const locus of CATEGORICAL_LOCI) {
    const value = (monster.phenotype as unknown as Record<string, unknown>)[locus];
    assert.equal(typeof value, 'string', `${locus} was left unset`);
  }
  assert.ok(monster.name.length > 0, 'it was not even named');
  assert.equal(monster.generation, 0, 'it has no ancestors');
  assert.equal(monster.parentAId, null);
  assert.equal(monster.parentBId, null);
  assert.equal(monster.tier, 0);
  assert.deepEqual(monster.fusionHistory, []);
  for (const [key, value] of Object.entries(monster.stats)) {
    assert.equal(typeof value, 'number', `${key} is not a number`);
    assert.ok((value as number) > 0, `${key} came out as ${value}`);
  }
});

test('the genome agrees with the body it produced', () => {
  const result = soulMake(
    { partIds: [BODY.id, EYES.id, TAIL.id] },
    holding(BODY, EYES, TAIL),
    testContext(3),
    'req-3',
  );
  assert.ok(result.monster);
  const monster = result.monster;

  // Placed or rolled, every expressed feature must be an allele the monster
  // actually carries - otherwise the phenotype is decoration.
  for (const locus of CATEGORICAL_LOCI) {
    const pair = (monster.genes as unknown as Record<string, { a: { value: unknown }; b: { value: unknown } }>)[locus];
    assert.ok(pair, `${locus} has no gene pair`);
    const shown = (monster.phenotype as unknown as Record<string, unknown>)[locus];
    assert.ok(
      pair.a.value === shown || pair.b.value === shown,
      `${locus} shows ${String(shown)}, which it does not carry`,
    );
  }

  // And a part placed on it drops back out as the same part.
  const dropped = partFromFeature(monster, 'bodyShape');
  assert.ok(dropped);
  assert.equal(dropped.id, BODY.id);
});

test('each placed part costs exactly one, and only on success', () => {
  let inventory = holding(BODY, EYES);
  inventory = addPart(inventory, BODY, 2); // three bodies, one pair of eyes
  assert.equal(countOf(inventory, BODY.id), 3);

  const made = soulMake({ partIds: [BODY.id, EYES.id] }, inventory, testContext(4), 'req-4');
  assert.equal(made.ok, true, made.message);
  assert.equal(countOf(made.inventory, BODY.id), 2, 'one body, not all of them');
  assert.equal(countOf(made.inventory, EYES.id), 0);
  assert.deepEqual(
    made.spent.map((entry) => entry.locus),
    ['bodyShape', 'eyes'],
  );
});

test('a refusal spends nothing at all', () => {
  const inventory = holding(BODY, EYES, TAIL);
  const before = inventory.stacks.map((stack) => [stack.part.id, stack.count] as const);

  for (const selection of [
    { partIds: [BODY.id] }, // short of eyes
    { partIds: [BODY.id, EYES.id, 'part-nope'] }, // an id for nothing
    { partIds: [BODY.id, BODY.id, EYES.id] }, // the same stack twice
    { partIds: [] }, // nothing at all
  ]) {
    const result = soulMake(selection, inventory, testContext(5), `fail-${selection.partIds.length}`);
    assert.equal(result.ok, false, `${JSON.stringify(selection)} should have been refused`);
    assert.equal(result.monster, null);
    assert.deepEqual(result.spent, []);
    assert.deepEqual(
      result.inventory.stacks.map((stack) => [stack.part.id, stack.count] as const),
      before,
      `${JSON.stringify(selection)} changed the inventory`,
    );
  }
});

test('the same request twice makes one monster and spends one set', () => {
  const inventory = holding(BODY, EYES);
  const first = soulMake({ partIds: [BODY.id, EYES.id] }, inventory, testContext(6), 'once');
  assert.equal(first.ok, true, first.message);

  // The retry sees the inventory the first call returned, as a UI would.
  const again = soulMake({ partIds: [BODY.id, EYES.id] }, first.inventory, testContext(6), 'once');
  assert.equal(again.ok, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.monster, null);
  assert.deepEqual(again.spent, []);
  assert.deepEqual(again.inventory.stacks, first.inventory.stacks);
});

test('two different requests make two different monsters', () => {
  let inventory = holding(BODY, EYES);
  inventory = addPart(inventory, BODY, 1);
  inventory = addPart(inventory, EYES, 1);

  // One context, as a running game has: ids come from it in order.
  const context = testContext(7);
  const first = soulMake({ partIds: [BODY.id, EYES.id] }, inventory, context, 'a');
  assert.equal(first.ok, true, first.message);
  const second = soulMake({ partIds: [BODY.id, EYES.id] }, first.inventory, context, 'b');
  assert.equal(second.ok, true, second.message);
  assert.notEqual(first.monster?.id, second.monster?.id);
  assert.equal(countOf(second.inventory, BODY.id), 0);
});

test('a hand-built monster can be fused like any other', () => {
  const context = testContext(9);
  const built = soulMake({ partIds: [BODY.id, EYES.id] }, holding(BODY, EYES), context, 'req-9');
  assert.ok(built.monster);

  // It has to be an ordinary monster, not a special case downstream.
  const other = createRootMonster(context);
  assert.equal(typeof built.monster.createdAt, 'number');
  assert.equal(built.monster.schemaVersion, other.schemaVersion);
  assert.deepEqual(Object.keys(built.monster).sort(), Object.keys(other).sort());
});
