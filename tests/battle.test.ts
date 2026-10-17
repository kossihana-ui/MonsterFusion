import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBattleConfig, DEFAULT_BATTLE_CONFIG } from '../src/core/config.ts';
import {
  computeDamage,
  createBasicPolicy,
  createBattle,
  createCombatant,
  createDuel,
  createScriptedPolicy,
  deriveSkills,
  elementMultiplier,
  runBattle,
  simulateDuel,
  stepTurn,
  turnOrder,
} from '../src/core/battle.ts';
import { createRootMonster, fuse } from '../src/core/fusion.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { testContext } from './helpers.ts';

function twoMonsters(seed = 1) {
  const context = testContext(seed);
  return [createRootMonster(context, { name: 'Alpha' }), createRootMonster(context, { name: 'Beta' })] as const;
}

test('a duel terminates with a decided outcome', () => {
  const [a, b] = twoMonsters(21);
  const final = simulateDuel(a, b, createSeededRandom(21));

  assert.notEqual(final.outcome.status, 'ongoing');
  if (final.outcome.status === 'win') {
    assert.ok(final.outcome.winningSide === 0 || final.outcome.winningSide === 1);
    const losingSide = 1 - final.outcome.winningSide;
    const losers = final.combatants.filter((c) => c.side === losingSide);
    assert.ok(losers.every((c) => c.hp === 0) || final.turn >= DEFAULT_BATTLE_CONFIG.maxTurns);
  }
  assert.ok(final.turn > 0);
  assert.ok(final.turn <= DEFAULT_BATTLE_CONFIG.maxTurns);
});

test('every battle terminates, across many seeds', () => {
  for (let seed = 0; seed < 50; seed++) {
    const [a, b] = twoMonsters(seed);
    const final = simulateDuel(a, b, createSeededRandom(seed + 500));
    assert.notEqual(final.outcome.status, 'ongoing', `seed ${seed} did not finish`);
  }
});

test('the same seed replays the same battle', () => {
  const [a, b] = twoMonsters(77);
  const first = simulateDuel(a, b, createSeededRandom(77));
  const second = simulateDuel(a, b, createSeededRandom(77));

  assert.equal(first.turn, second.turn);
  assert.deepEqual(first.outcome, second.outcome);
  assert.deepEqual(
    first.log.map((e) => e.message),
    second.log.map((e) => e.message),
  );
});

test('a battle log is produced and bracketed by start and end entries', () => {
  const [a, b] = twoMonsters(9);
  const final = simulateDuel(a, b, createSeededRandom(9));

  assert.equal(final.log[0]?.kind, 'start');
  assert.equal(final.log.at(-1)?.kind, 'end');
  assert.ok(final.log.some((e) => e.kind === 'attack' || e.kind === 'skill'));
  assert.ok(final.log.length > 2);
});

test('stepTurn does not mutate the state it was given', () => {
  const [a, b] = twoMonsters(13);
  const start = createDuel(a, b);
  const snapshot = JSON.stringify(start);
  const next = stepTurn(start, createBasicPolicy(createSeededRandom(13)), createSeededRandom(13));

  assert.equal(JSON.stringify(start), snapshot, 'the input state must be untouched');
  assert.equal(next.turn, 1);
  assert.notEqual(next.combatants, start.combatants);
});

test('the faster combatant acts first', () => {
  const [a, b] = twoMonsters(4);
  const slow = createCombatant({ ...a, stats: { ...a.stats, speed: 10 } }, 0);
  const fast = createCombatant({ ...b, stats: { ...b.stats, speed: 200 } }, 1);
  const order = turnOrder([slow, fast], createSeededRandom(1));
  assert.equal(order[0]?.id, fast.id);
});

test('defending reduces incoming damage', () => {
  const [a, b] = twoMonsters(31);
  const attacker = createCombatant(a, 0);
  const open = createCombatant(b, 1);
  const braced = { ...createCombatant(b, 1), defending: true };

  // Same seed on both calls, so the crit roll and the variance roll match and
  // the only difference left is the defend multiplier.
  for (let seed = 0; seed < 25; seed++) {
    const hitOpen = computeDamage(attacker, open, {}, createSeededRandom(seed));
    const hitBraced = computeDamage(attacker, braced, {}, createSeededRandom(seed));
    assert.ok(
      hitBraced.damage < hitOpen.damage,
      `seed ${seed}: defending took ${hitBraced.damage}, open took ${hitOpen.damage}`,
    );
  }
});

test('a defend action is recorded on the combatant and in the log', () => {
  const [a, b] = twoMonsters(31);
  const next = stepTurn(
    createDuel(a, b),
    createScriptedPolicy([{ kind: 'defend' }]),
    createSeededRandom(1),
  );
  assert.ok(next.combatants.every((c) => c.defending));
  assert.ok(next.log.some((e) => e.kind === 'defend'));
});

test('skills cost MP and fall back to a plain attack when it runs out', () => {
  const [a, b] = twoMonsters(44);
  const state = createDuel(a, b, createBattleConfig({ startingMp: 0, mpRegenPerTurn: 0 }));
  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'strike' }]),
    createSeededRandom(2),
    createBattleConfig({ startingMp: 0, mpRegenPerTurn: 0 }),
  );
  // No MP, so nothing is spent and the turn still lands as an attack.
  assert.ok(next.combatants.every((c) => c.mp === 0));
  assert.ok(next.log.some((e) => e.kind === 'attack'));
});

test('skills are derived deterministically from the monster', () => {
  const [a] = twoMonsters(6);
  assert.deepEqual(deriveSkills(a), deriveSkills(a));
  assert.equal(deriveSkills(a).length, 2);
});

test('the element chart is applied and configurable', () => {
  assert.equal(elementMultiplier('fire', 'water'), 0.7);
  assert.equal(elementMultiplier('water', 'fire'), 1.3);
  assert.equal(elementMultiplier('neutral', 'neutral'), 1);

  const custom = createBattleConfig({ elementChart: { fire: { water: 5 } } });
  assert.equal(elementMultiplier('fire', 'water', custom), 5);
});

test('the engine already handles a 3v3 party battle', () => {
  const context = testContext(500);
  const team = (count: number) =>
    Array.from({ length: count }, (_unused, i) => createRootMonster(context, { name: `M${i}` }));
  const state = createBattle([team(3), team(3)]);
  assert.equal(state.combatants.length, 6);
  assert.equal(state.combatants.filter((c) => c.side === 0).length, 3);

  const final = runBattle(state, createBasicPolicy(createSeededRandom(500)), createSeededRandom(501));
  const outcome = final.outcome;
  assert.notEqual(outcome.status, 'ongoing');
  if (outcome.status === 'win') {
    const losing = final.combatants.filter((c) => c.side !== outcome.winningSide);
    assert.ok(losing.every((c) => c.hp === 0) || final.turn >= DEFAULT_BATTLE_CONFIG.maxTurns);
  }
});

test('a fused monster can fight', () => {
  const context = testContext(61);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const child = fuse(a, b, context);
  const final = simulateDuel(child, a, createSeededRandom(61));
  assert.notEqual(final.outcome.status, 'ongoing');
});

test('the turn limit forces a decision instead of an endless battle', () => {
  const [a, b] = twoMonsters(3);
  const config = createBattleConfig({ maxTurns: 2, damageVariance: 0 });
  const final = runBattle(
    createDuel(a, b, config),
    createScriptedPolicy([{ kind: 'defend' }]),
    createSeededRandom(3),
    config,
  );
  assert.equal(final.turn, 2);
  assert.notEqual(final.outcome.status, 'ongoing');
});
