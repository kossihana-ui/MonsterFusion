import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allMoveDefinitions,
  canLearn,
  defaultLoadout,
  getLearnableMoves,
  loadoutFor,
  MAX_MOVE_SLOTS,
  MOVE_CATALOGUE,
  MOVE_TIERS,
  reconcileLoadout,
  skillsForLoadout,
  validateMoveLoadout,
} from '../src/core/moves.ts';
import { createDuelWithLoadouts, runBattle, createBasicPolicy } from '../src/core/battle.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { fuse } from '../src/core/fusion.ts';
import { createSeededRandom } from '../src/core/random.ts';
import {
  createSaveFile,
  deserializeSaveFile,
  serializeSaveFile,
} from '../src/core/storage.ts';
import { CATEGORICAL_LOCI } from '../src/shared/types.ts';
import { DEFAULT_ALLELE_POOLS } from '../src/core/config.ts';
import { fusionChain, testContext } from './helpers.ts';

function starters(seed = 1) {
  return createStarterMonsters(testContext(seed));
}

test('the catalogue is well formed', () => {
  const ids = MOVE_CATALOGUE.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate move id');

  for (const move of MOVE_CATALOGUE) {
    assert.ok(move.name.length > 0, `${move.id}: no name`);
    assert.ok(move.reason.length > 0, `${move.id}: no reason to show the player`);
    assert.ok(
      CATEGORICAL_LOCI.includes(move.source),
      `${move.id}: ${move.source} is not a locus`,
    );
    const pool = DEFAULT_ALLELE_POOLS[move.source] as readonly string[];
    assert.ok(
      pool.includes(move.value),
      `${move.id}: ${move.source} has no value ${move.value}, so nothing can ever learn it`,
    );
    assert.ok(MOVE_TIERS[move.tier], `${move.id}: unknown tier`);
  }
  assert.deepEqual(allMoveDefinitions(), MOVE_CATALOGUE);
});

test('a finisher hits harder and costs more than an ordinary move', () => {
  assert.ok(MOVE_TIERS.finisher.power > MOVE_TIERS.feature.power);
  assert.ok(MOVE_TIERS.finisher.cost > MOVE_TIERS.feature.cost);
  assert.ok(MOVE_TIERS.basic.cost < MOVE_TIERS.signature.cost);
});

test('every monster knows something cheap, whatever body it has', () => {
  const { chain } = fusionChain(40, 9);
  for (const monster of chain) {
    const moves = getLearnableMoves(monster);
    assert.ok(moves.length >= 2, `${monster.name} knows almost nothing`);
    assert.ok(moves.some((m) => m.skill.id === 'strike'));
    assert.ok(moves.some((m) => m.skill.id.startsWith('sig-')));
    for (const move of moves) {
      assert.ok(move.reason.length > 0, `${move.skill.id}: no reason shown`);
    }
  }
});

test('a move is taught by the body the monster is wearing', () => {
  const [, ignis] = starters();
  assert.ok(ignis);
  assert.equal(ignis.phenotype.tail, 'spiked');
  assert.ok(canLearn(ignis, 'final-tail'), 'a spiked tail teaches the tail finisher');

  const [moss] = starters();
  assert.ok(moss);
  assert.equal(moss.phenotype.tail, 'vine');
  assert.ok(!canLearn(moss, 'final-tail'), 'a vine tail must not teach it');
  assert.ok(canLearn(moss, 'bind-whip'));
});

test('a carried but unexpressed allele teaches nothing', () => {
  // The rule that matters for fairness: what a monster could pass on is not
  // what it has. Only the phenotype unlocks a move.
  const { chain } = fusionChain(60, 21);
  for (const monster of chain) {
    const learnable = new Set(getLearnableMoves(monster).map((m) => m.skill.id));
    const phenotype = monster.phenotype as unknown as Record<string, unknown>;
    for (const definition of MOVE_CATALOGUE) {
      const expressed = phenotype[definition.source] === definition.value;
      assert.equal(
        learnable.has(definition.id),
        expressed,
        `${monster.name}: ${definition.id} should be ${expressed ? 'known' : 'unknown'}`,
      );
    }
  }
});

test('a move takes its colour from the monster when it should', () => {
  for (const monster of starters(3)) {
    for (const move of getLearnableMoves(monster)) {
      const definition = MOVE_CATALOGUE.find((d) => d.id === move.skill.id);
      if (!definition || definition.element !== 'self') continue;
      assert.equal(
        move.skill.element,
        monster.phenotype.element,
        `${move.skill.id}: a self-element move should match its owner`,
      );
    }
  }
});

test('the default loadout fits the slots and leads with the cheap moves', () => {
  const { chain } = fusionChain(30, 11);
  for (const monster of chain) {
    const loadout = defaultLoadout(monster);
    assert.equal(loadout.monsterId, monster.id);
    assert.ok(loadout.skillIds.length >= 1);
    assert.ok(loadout.skillIds.length <= MAX_MOVE_SLOTS);
    assert.equal(new Set(loadout.skillIds).size, loadout.skillIds.length);
    assert.ok(
      loadout.skillIds.includes('strike'),
      'a monster must always have something it can afford',
    );
    assert.equal(validateMoveLoadout(monster, loadout.skillIds).ok, true);
  }
});

test('a loadout is checked against what the monster can learn', () => {
  const [moss] = starters(5);
  assert.ok(moss);

  const good = validateMoveLoadout(moss, ['strike', 'bind-whip']);
  assert.equal(good.ok, true);
  if (good.ok) assert.deepEqual(good.loadout.skillIds, ['strike', 'bind-whip']);

  for (const [ids, expected] of [
    [[], '1つ以上'],
    [['strike', 'strike'], '同じ技'],
    [['final-tail'], '覚えていません'],
    [['strike', 'bind-whip', 'pollen-burst', 'sig-earth', 'strike'], '4つまで'],
  ] as const) {
    const result = validateMoveLoadout(moss, ids);
    assert.equal(result.ok, false, `${ids.join(',')} should have been rejected`);
    if (!result.ok) {
      assert.ok(
        result.message.includes(expected),
        `message "${result.message}" does not explain the problem`,
      );
    }
  }
});

test('a loadout is repaired rather than rejected when the body changed', () => {
  const context = testContext(13);
  const [moss, ignis] = starters(13);
  assert.ok(moss && ignis);

  // Ignis knows the tail finisher; its child may well not.
  const child = fuse(ignis, moss, context);
  const repaired = reconcileLoadout(child, ['final-tail', 'strike']);

  assert.equal(repaired.monsterId, child.id);
  assert.ok(repaired.skillIds.includes('strike'), 'what still applies is kept');
  for (const id of repaired.skillIds) {
    assert.ok(canLearn(child, id), `${id} survived a repair but cannot be learnt`);
  }
  assert.ok(repaired.skillIds.length > 0, 'a repair must not leave a monster mute');
  assert.ok(repaired.skillIds.length <= MAX_MOVE_SLOTS);
});

test('a monster with no loadout still goes in armed', () => {
  const [a, b] = starters(17);
  assert.ok(a && b);
  const state = createDuelWithLoadouts(a, b, []);
  for (const combatant of state.combatants) {
    assert.ok(combatant.skills.length > 0, `${combatant.name} went in with nothing`);
    assert.ok(combatant.skills.some((s) => s.id === 'strike'));
  }
});

test('a chosen loadout is what the combatant takes in', () => {
  const [moss, , aqua] = starters(19);
  assert.ok(moss && aqua);
  const state = createDuelWithLoadouts(moss, aqua, [
    { monsterId: moss.id, skillIds: ['strike', 'pollen-burst'] },
  ]);

  const mine = state.combatants.find((c) => c.monsterId === moss.id);
  assert.ok(mine);
  assert.deepEqual(mine.skills.map((s) => s.id), ['strike', 'pollen-burst']);

  // The opponent had none, so it falls back rather than going in empty.
  const theirs = state.combatants.find((c) => c.monsterId === aqua.id);
  assert.ok(theirs);
  assert.ok(theirs.skills.length > 0);
});

test('an illegal loadout cannot be smuggled into a battle', () => {
  const [moss, ignis] = starters(23);
  assert.ok(moss && ignis);
  const state = createDuelWithLoadouts(moss, ignis, [
    // final-tail belongs to Ignis; Moss has a vine tail.
    { monsterId: moss.id, skillIds: ['final-tail', 'nonsense'] },
  ]);
  const mine = state.combatants.find((c) => c.monsterId === moss.id);
  assert.ok(mine);
  for (const skill of mine.skills) {
    assert.ok(canLearn(moss, skill.id), `${skill.id} is not Moss's to use`);
  }
});

test('a battle with chosen moves still finishes', () => {
  const [a, b] = starters(29);
  assert.ok(a && b);
  const rng = createSeededRandom(29);
  const final = runBattle(
    createDuelWithLoadouts(a, b, [
      { monsterId: a.id, skillIds: defaultLoadout(a).skillIds },
      { monsterId: b.id, skillIds: defaultLoadout(b).skillIds },
    ]),
    createBasicPolicy(rng),
    rng,
  );
  assert.notEqual(final.outcome.status, 'ongoing');
});

test('a finisher is affordable eventually, not immediately', () => {
  const [, ignis] = starters(31);
  assert.ok(ignis);
  const finisher = getLearnableMoves(ignis).find((m) => m.category === 'finisher');
  assert.ok(finisher, 'Ignis should know a finisher');

  const state = createDuelWithLoadouts(ignis, ignis, []);
  const combatant = state.combatants[0];
  assert.ok(combatant);
  assert.ok(
    finisher.skill.cost > combatant.mp,
    'a finisher you can open with is just a better basic attack',
  );
});

test('loadouts are saved beside the monsters, not inside them', () => {
  const monsters = starters(37);
  const [moss] = monsters;
  assert.ok(moss);
  const loadouts = [{ monsterId: moss.id, skillIds: ['strike', 'bind-whip'] }];

  const save = createSaveFile(monsters, { now: () => 0, loadouts });
  assert.deepEqual(save.loadouts[0]?.skillIds, ['strike', 'bind-whip']);
  // Nothing about the loadout leaks into the monster itself.
  assert.ok(!JSON.stringify(save.monsters).includes('bind-whip'));

  const restored = deserializeSaveFile(serializeSaveFile(monsters, { now: () => 0, loadouts }));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value.loadouts[0]?.skillIds, ['strike', 'bind-whip']);
});

test('a save with no loadouts loads, and a stale one is repaired', () => {
  const monsters = starters(41);
  const [moss] = monsters;
  assert.ok(moss);

  const bare = deserializeSaveFile(serializeSaveFile(monsters, { now: () => 0 }));
  assert.equal(bare.ok, true);
  if (!bare.ok) return;
  assert.deepEqual(bare.value.loadouts, []);

  // A loadout naming a move this monster cannot learn, and one naming a
  // monster that is not in the save at all.
  const payload = JSON.parse(serializeSaveFile(monsters, { now: () => 0 })) as Record<string, unknown>;
  payload.loadouts = [
    { monsterId: moss.id, skillIds: ['final-tail', 'strike'] },
    { monsterId: 'ghost', skillIds: ['strike'] },
  ];

  const restored = deserializeSaveFile(JSON.stringify(payload));
  assert.equal(restored.ok, true, 'a stale loadout must not cost the player the save');
  if (!restored.ok) return;
  assert.equal(restored.value.loadouts.length, 1, 'the dangling one is dropped');
  for (const id of restored.value.loadouts[0]?.skillIds ?? []) {
    assert.ok(canLearn(moss, id), `${id} survived loading but cannot be learnt`);
  }
});

test('nothing the caller handed in is modified', () => {
  const [moss, ignis] = starters(43);
  assert.ok(moss && ignis);
  const before = JSON.stringify(moss);
  const loadouts = [{ monsterId: moss.id, skillIds: ['strike'] }];
  const loadoutsBefore = JSON.stringify(loadouts);

  createDuelWithLoadouts(moss, ignis, loadouts);
  skillsForLoadout(moss, loadouts[0]);
  reconcileLoadout(moss, ['final-tail']);

  assert.equal(JSON.stringify(moss), before);
  assert.equal(JSON.stringify(loadouts), loadoutsBefore);
});

test('a loadout is found by the monster it belongs to', () => {
  const [moss, ignis] = starters(47);
  assert.ok(moss && ignis);
  const loadouts = [{ monsterId: ignis.id, skillIds: ['strike'] }];
  assert.equal(loadoutFor(moss, loadouts), undefined);
  assert.deepEqual(loadoutFor(ignis, loadouts)?.skillIds, ['strike']);
});
