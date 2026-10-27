import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyStatus,
  blockingStatus,
  getMoveBehavior,
  hasStatus,
  MOVE_BEHAVIOURS,
  offenceMultiplier,
  pendingMoves,
  removePolarity,
  removeStatuses,
  STATUS_LABELS,
  STATUS_POLARITY,
  tickStatuses,
} from '../src/core/effects.ts';
import type { BattleEffectEvent, StatusEffect } from '../src/core/effects.ts';
import {
  computeDamage,
  createCombatant,
  createDuelWithLoadouts,
  createScriptedPolicy,
  stepTurn,
} from '../src/core/battle.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { createMonsterFromAnalysis } from '../src/core/fusion.ts';
import type { CrestType, HornType } from '../src/shared/types.ts';
import { MOVE_CATALOGUE } from '../src/core/moves.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { createBattleConfig, DEFAULT_BATTLE_CONFIG } from '../src/core/config.ts';
import type { BattleState } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

function pair(seed = 1) {
  const [moss, ignis, aqua] = createStarterMonsters(testContext(seed));
  assert.ok(moss && ignis && aqua);
  return { moss, ignis, aqua };
}

/** A monster wearing the feature that teaches the move under test. */
function wearing(
  feature: { horns?: HornType; crest?: CrestType },
  seed: number,
  name: string,
) {
  return createMonsterFromAnalysis(
    { ...feature, confidence: 1 },
    testContext(seed),
    { name, id: name },
  );
}

function effectsOf(state: BattleState): BattleEffectEvent[] {
  return state.log.flatMap((entry) => [...(entry.effects ?? [])]);
}

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

test('a status is added, refreshed by the longer duration, and ages out', () => {
  let statuses: StatusEffect[] = [];
  statuses = applyStatus(statuses, { kind: 'poison', turns: 2 });
  assert.ok(hasStatus(statuses, 'poison'));

  statuses = applyStatus(statuses, { kind: 'poison', turns: 4 });
  assert.equal(statuses.length, 1, 'the same status does not stack up');
  assert.equal(statuses[0]?.turns, 4, 'the longer duration wins');

  statuses = applyStatus(statuses, { kind: 'poison', turns: 1 });
  assert.equal(statuses[0]?.turns, 4, 'and a shorter one does not cut it short');

  for (let i = 0; i < 4; i++) statuses = tickStatuses(statuses);
  assert.equal(hasStatus(statuses, 'poison'), false);
});

test('statuses are stripped by name or by polarity', () => {
  const statuses: StatusEffect[] = [
    { kind: 'poison', turns: 3 },
    { kind: 'bind', turns: 2 },
    { kind: 'attackUp', turns: 1, magnitude: 2 },
  ];

  const byName = removeStatuses(statuses, ['bind']);
  assert.deepEqual(byName.removed, ['bind']);
  assert.equal(byName.statuses.length, 2);

  const buffs = removePolarity(statuses, 'buff');
  assert.deepEqual(buffs.removed, ['attackUp']);
  assert.ok(buffs.statuses.every((s) => STATUS_POLARITY[s.kind] === 'debuff'));

  const debuffs = removePolarity(statuses, 'debuff');
  assert.equal(debuffs.removed.length, 2);
  assert.deepEqual(debuffs.statuses.map((s) => s.kind), ['attackUp']);
});

test('every status has a Japanese label and a side', () => {
  for (const kind of Object.keys(STATUS_POLARITY) as (keyof typeof STATUS_POLARITY)[]) {
    assert.ok(STATUS_LABELS[kind], `${kind}: no label`);
    assert.ok(['buff', 'debuff'].includes(STATUS_POLARITY[kind]));
  }
});

test('bind and recoil stop a turn, a buff multiplies offence', () => {
  assert.equal(blockingStatus([{ kind: 'bind', turns: 1 }]), 'bind');
  assert.equal(blockingStatus([{ kind: 'recoil', turns: 1 }]), 'recoil');
  assert.equal(blockingStatus([{ kind: 'poison', turns: 1 }]), null);
  assert.equal(blockingStatus([]), null);

  assert.equal(offenceMultiplier([]), 1);
  assert.equal(offenceMultiplier([{ kind: 'attackUp', turns: 1, magnitude: 2 }]), 2);
});

// ---------------------------------------------------------------------------
// Behaviour contract
// ---------------------------------------------------------------------------

test('a support move does not attack, and nothing infers that from power', () => {
  const heal = getMoveBehavior('hydro-ram');
  assert.equal(heal.attacks, false);
  assert.equal(heal.actionMode, 'support');
  assert.equal(heal.target, 'self');
  assert.equal(heal.heal, 30);
  assert.equal(heal.noConsecutiveUse, true);

  const cleanse = getMoveBehavior('crystal-ray');
  assert.equal(cleanse.attacks, false);
  assert.equal(cleanse.target, 'both');
  assert.equal(cleanse.cleanse.length, 4, 'both sides, both polarities');

  // A move that strips AND attacks keeps the attack.
  const tusk = getMoveBehavior('tusk-rush');
  assert.equal(tusk.attacks, true);
  assert.equal(tusk.piercesDefense, true);
  assert.deepEqual(tusk.cleanse, [{ target: 'enemy', polarity: 'buff' }]);
});

test('an unknown or pending move behaves exactly as it does today', () => {
  const unknown = getMoveBehavior('no-such-move');
  assert.equal(unknown.attacks, true);
  assert.equal(unknown.hits, 1);
  assert.equal(unknown.piercesDefense, false);

  const waiting = getMoveBehavior('crown-break');
  assert.equal(waiting.specified, false, 'this one is still waiting on a number');
  assert.equal(waiting.attacks, true, 'and until then it is a plain attack');
  assert.equal(waiting.hits, 1);
  assert.equal(waiting.heal, 0);
  assert.deepEqual(waiting.applies, []);
  assert.ok(waiting.pending && waiting.pending.length > 0, 'it should say what it needs');
});

test('the pending list names every move still waiting, and why', () => {
  const list = pendingMoves();
  assert.ok(list.length > 0);
  for (const entry of list) {
    assert.ok(entry.question.length > 0, `${entry.skillId}: no question recorded`);
    assert.equal(getMoveBehavior(entry.skillId).specified, false);
  }
  const ids = new Set(MOVE_CATALOGUE.map((m) => m.id));
  for (const entry of list) {
    assert.ok(ids.has(entry.skillId), `${entry.skillId} is not a move in the catalogue`);
  }
});

test('every behaviour entry names a move that exists', () => {
  const ids = new Set(MOVE_CATALOGUE.map((m) => m.id));
  for (const id of Object.keys(MOVE_BEHAVIOURS)) {
    assert.ok(ids.has(id), `${id} has a behaviour but is not in the catalogue`);
  }
});

// ---------------------------------------------------------------------------
// In battle
// ---------------------------------------------------------------------------

test('a heal restores HP, reports what it actually restored, and never attacks', () => {
  const { aqua } = pair(3);
  const state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram', 'strike'] },
  ]);
  const hurt = state.combatants[0];
  assert.ok(hurt);
  hurt.hp = 40;

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]),
    createSeededRandom(1),
  );

  const events = effectsOf(next);
  const heals = events.filter((e) => e.type === 'heal');
  assert.ok(heals.length > 0, 'nothing was healed');
  assert.ok(
    events.every((e) => e.type !== 'damage'),
    'a heal-only move must not go through damage at all',
  );

  const healed = next.combatants.find((c) => c.id === hurt.id);
  assert.ok(healed);
  assert.equal(healed.hp, 70);
  const mine = heals.find((e) => e.type === 'heal' && e.targetId === hurt.id);
  assert.ok(mine && mine.type === 'heal');
  assert.equal(mine.amount, 30, 'the event reports the real amount');
});

test('a heal is capped at full health and says so', () => {
  const { aqua } = pair(5);
  const state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram', 'strike'] },
  ]);
  const full = state.combatants[0];
  assert.ok(full);
  full.hp = full.maxHp - 5;

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]),
    createSeededRandom(2),
  );
  const healed = next.combatants.find((c) => c.id === full.id);
  assert.ok(healed);
  assert.equal(healed.hp, healed.maxHp, 'never past the cap');

  const event = effectsOf(next).find(
    (e): e is Extract<BattleEffectEvent, { type: 'heal' }> =>
      e.type === 'heal' && e.targetId === full.id,
  );
  assert.ok(event);
  assert.equal(event.amount, 5, 'the real amount, not the nominal 30');
});

test('a move that cannot repeat is refused on the second turn', () => {
  const { aqua } = pair(7);
  let state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram', 'strike'] },
  ]);
  const hurt = state.combatants[0];
  assert.ok(hurt);
  hurt.hp = 20;

  const rng = createSeededRandom(3);
  const policy = createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]);
  state = stepTurn(state, policy, rng);
  const afterFirst = state.combatants.find((c) => c.id === hurt.id)?.hp ?? 0;

  state = stepTurn(state, policy, rng);
  const blocked = effectsOf(state).filter(
    (e) => e.type === 'blocked' && e.reason === 'consecutive',
  );
  assert.ok(blocked.length > 0, 'the second use should have been refused');
  const afterSecond = state.combatants.find((c) => c.id === hurt.id)?.hp ?? 0;
  assert.ok(afterSecond <= afterFirst + 1, 'and it should not have healed again');
});

test('a cleanse strips both sides and reports what went', () => {
  // crystal-ray is taught by a crystal crest, so the caster needs one.
  const caster = wearing({ crest: 'crystal' }, 11, 'caster');
  const { ignis } = pair(11);
  const state = createDuelWithLoadouts(caster, ignis, [
    { monsterId: caster.id, skillIds: ['crystal-ray', 'strike'] },
  ]);
  for (const combatant of state.combatants) {
    combatant.statuses = [
      { kind: 'poison', turns: 3 },
      { kind: 'attackUp', turns: 3, magnitude: 2 },
    ];
  }

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'crystal-ray' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(4),
  );

  const cleanses = effectsOf(next).filter((e) => e.type === 'cleanse');
  assert.ok(cleanses.length > 0);
  for (const combatant of next.combatants) {
    assert.equal(combatant.statuses.length, 0, `${combatant.name} kept a status`);
  }
  assert.ok(
    effectsOf(next).every((e) => e.type !== 'damage'),
    'a cleanse-only move must not deal damage',
  );
});

test('piercing ignores both the defence stat and the guard', () => {
  const { moss, ignis } = pair(13);
  const attacker = createCombatant(ignis, 0);
  const guarded = { ...createCombatant(moss, 1), defending: true };
  const config = createBattleConfig({ damageVariance: 0 });

  const normal = computeDamage(attacker, guarded, {}, createSeededRandom(5), config);
  const pierced = computeDamage(attacker, guarded, { pierce: true }, createSeededRandom(5), config);

  assert.ok(pierced.damage > normal.damage, 'piercing should get through a guard');
  assert.equal(pierced.mitigated, 0, 'and nothing is reported as absorbed');
  assert.ok(normal.mitigated > 0);
});

test('a two-hit move reports each hit', () => {
  // double-gore is taught by twin horns.
  const gorer = wearing({ horns: 'twin' }, 17, 'gorer');
  const { moss } = pair(17);
  const state = createDuelWithLoadouts(gorer, moss, [
    { monsterId: gorer.id, skillIds: ['double-gore', 'strike'] },
  ]);
  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'double-gore' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(6),
  );

  const hits = effectsOf(next).filter(
    (e): e is Extract<BattleEffectEvent, { type: 'damage' }> =>
      e.type === 'damage' && e.skillId === 'double-gore',
  );
  assert.equal(hits.length, 2, 'two hits, two events');
  assert.deepEqual(hits.map((h) => h.hit), [1, 2]);
  assert.ok(hits.every((h) => h.hits === 2));

  // The entry still carries the totals the UI already reads.
  const entry = next.log.find((e) => e.skillId === 'double-gore');
  assert.ok(entry);
  assert.equal(entry.damage, hits[0]!.amount + hits[1]!.amount);
});

test('a bound monster loses its turn, and the log says why', () => {
  const { moss, ignis } = pair(19);
  const state = createDuelWithLoadouts(ignis, moss, []);
  const bound = state.combatants[0];
  assert.ok(bound);
  bound.statuses = [{ kind: 'bind', turns: 1 }];

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'attack' }]),
    createSeededRandom(7),
  );

  const skipped = effectsOf(next).filter(
    (e): e is Extract<BattleEffectEvent, { type: 'skip' }> => e.type === 'skip',
  );
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0]?.actorId, bound.id);
  assert.equal(skipped[0]?.reason, 'bind');
  assert.ok(
    !effectsOf(next).some((e) => e.type === 'damage' && e.actorId === bound.id),
    'a bound monster should not have attacked',
  );
});

test('poison takes HP at the end of the turn, within the stated range', () => {
  const { moss, ignis } = pair(23);
  const state = createDuelWithLoadouts(ignis, moss, []);
  const poisoned = state.combatants[0];
  assert.ok(poisoned);
  poisoned.statuses = [{ kind: 'poison', turns: 3 }];
  const before = poisoned.hp;

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'defend' }]),
    createSeededRandom(8),
  );

  const after = next.combatants.find((c) => c.id === poisoned.id);
  assert.ok(after);
  const lost = before - after.hp;
  const [low, high] = DEFAULT_BATTLE_CONFIG.poisonDamage;
  assert.ok(lost >= low && lost <= high, `poison took ${lost}, outside ${low}-${high}`);
  assert.equal(after.statuses.find((s) => s.kind === 'poison')?.turns, 2, 'and it ages');
});

test('a buff doubles offence while it lasts', () => {
  const { moss, ignis } = pair(29);
  const plain = createCombatant(ignis, 0);
  const buffed = {
    ...createCombatant(ignis, 0),
    statuses: [{ kind: 'attackUp' as const, turns: 1, magnitude: 2 }],
  };
  const target = createCombatant(moss, 1);
  const config = createBattleConfig({ damageVariance: 0 });

  const normal = computeDamage(plain, target, {}, createSeededRandom(9), config);
  const strong = computeDamage(buffed, target, {}, createSeededRandom(9), config);
  assert.ok(strong.damage > normal.damage, 'a doubled attack should land harder');
});

test('statuses survive the state being handed back', () => {
  const { moss, ignis } = pair(31);
  const state = createDuelWithLoadouts(ignis, moss, []);
  const first = state.combatants[0];
  assert.ok(first);
  first.statuses = [{ kind: 'poison', turns: 2 }];
  const snapshot = JSON.stringify(state);

  const next = stepTurn(state, createScriptedPolicy([{ kind: 'attack' }]), createSeededRandom(10));
  assert.equal(JSON.stringify(state), snapshot, 'the input state must not change');
  assert.ok(next.combatants.every((c) => Array.isArray(c.statuses)));
});
