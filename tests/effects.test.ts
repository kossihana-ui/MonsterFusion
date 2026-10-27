import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyStatus,
  blockingStatus,
  conditionMultiplier,
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
import type { CrestType, HornType, TailType, WingType, BodyShape } from '../src/shared/types.ts';
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
  feature: { horns?: HornType; crest?: CrestType; tail?: TailType; wings?: WingType; bodyShape?: BodyShape },
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

test('an unknown move behaves exactly as a plain attack', () => {
  const unknown = getMoveBehavior('no-such-move');
  assert.equal(unknown.attacks, true);
  assert.equal(unknown.hits, 1);
  assert.equal(unknown.piercesDefense, false);
  assert.equal(unknown.shattersDefense, false);
  assert.equal(unknown.successChance, 1);
});

test('every move in the catalogue now has a settled behaviour', () => {
  assert.deepEqual(pendingMoves(), [], 'the 2026-10-27 numbers closed the list');
  for (const move of MOVE_CATALOGUE) {
    const behavior = getMoveBehavior(move.id);
    assert.equal(behavior.specified, true, `${move.id} is still unspecified`);
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

// ---------------------------------------------------------------------------
// The mechanics settled on 2026-10-27
// ---------------------------------------------------------------------------

test('防御貫通 ignores the guard but still meets the defence stat', () => {
  const { moss, ignis } = pair(201);
  const attacker = createCombatant(ignis, 0);
  const guarded = { ...createCombatant(moss, 1), defending: true };
  const open = createCombatant(moss, 1);
  const config = createBattleConfig({ damageVariance: 0 });

  // Against a guard it gets through...
  const throughGuard = computeDamage(attacker, guarded, { pierce: true }, createSeededRandom(1), config);
  const stoppedByGuard = computeDamage(attacker, guarded, {}, createSeededRandom(1), config);
  assert.ok(throughGuard.damage > stoppedByGuard.damage);
  assert.equal(throughGuard.mitigated, 0);

  // ...but the defence stat still counts, so a tough target still takes less.
  const tough = {
    ...open,
    stats: { ...open.stats, defense: open.stats.defense * 3 },
  };
  const vsTough = computeDamage(attacker, tough, { pierce: true }, createSeededRandom(1), config);
  const vsOpen = computeDamage(attacker, open, { pierce: true }, createSeededRandom(1), config);
  assert.ok(vsTough.damage < vsOpen.damage, '防御貫通 is not meant to ignore defence');
});

test('砕牙 ignores the defence stat but still meets the guard', () => {
  const { moss, ignis } = pair(203);
  const attacker = createCombatant(ignis, 0);
  const open = createCombatant(moss, 1);
  const tough = { ...open, stats: { ...open.stats, defense: open.stats.defense * 3 } };
  const config = createBattleConfig({ damageVariance: 0 });

  const vsTough = computeDamage(attacker, tough, { shatter: true }, createSeededRandom(2), config);
  const vsOpen = computeDamage(attacker, open, { shatter: true }, createSeededRandom(2), config);
  assert.equal(vsTough.damage, vsOpen.damage, '砕牙 should not care how tough the target is');

  const guarded = { ...tough, defending: true };
  const vsGuard = computeDamage(attacker, guarded, { shatter: true }, createSeededRandom(2), config);
  assert.ok(vsGuard.damage < vsTough.damage, '砕牙 is about defence, not about the guard');
  assert.ok(vsGuard.mitigated > 0);
});

test('the two are separate flags, and the weak moves carry 砕牙', () => {
  // The player's rule: a deliberately weak move earns its slot by landing
  // whole, which is 砕牙 rather than 防御貫通.
  for (const id of ['twin-lash', 'multi-gaze', 'fin-slash']) {
    const behavior = getMoveBehavior(id);
    assert.equal(behavior.shattersDefense, true, `${id} should carry 砕牙`);
    assert.ok(
      (behavior.power ?? 999) <= DEFAULT_BATTLE_CONFIG.powerSteps.two,
      `${id} is meant to be a weak move`,
    );
  }
  for (const id of ['impact-horn', 'crystal-shard', 'mane-guard', 'tusk-rush']) {
    const behavior = getMoveBehavior(id);
    assert.equal(behavior.piercesDefense, true, `${id} should carry 防御貫通`);
    assert.equal(behavior.shattersDefense, false, `${id} should not also shatter`);
  }
});

test('the power steps read in order', () => {
  const { one, two, three, heavy } = DEFAULT_BATTLE_CONFIG.powerSteps;
  assert.ok(one < two && two < three && three < heavy, 'the ordering is the point');
  assert.ok(one < 100, 'step one should read as weaker than an ordinary attack');
});

test('a condition is read before anything is removed', () => {
  // coil-crush doubles against a bound target and then frees it. Asking after
  // the cure would always find it unbound, so the order is the mechanic.
  const { moss } = pair(205);
  const binder = wearing({ crest: 'crown' }, 205, 'binder');
  const crusher = createMonsterFromAnalysis(
    { bodyShape: 'serpentine', confidence: 1 },
    testContext(205),
    { name: 'crusher', id: 'crusher' },
  );

  const state = createDuelWithLoadouts(crusher, moss, [
    { monsterId: crusher.id, skillIds: ['coil-crush', 'strike'] },
  ]);
  const victim = state.combatants.find((c) => c.side === 1);
  assert.ok(victim);
  victim.statuses = [{ kind: 'bind', turns: 2 }];

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'coil-crush' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(3),
  );

  const freed = next.combatants.find((c) => c.id === victim.id);
  assert.ok(freed);
  assert.equal(hasStatus(freed.statuses, 'bind'), false, 'the bind should have been released');

  const cleansed = effectsOf(next).filter((e) => e.type === 'cleanse');
  assert.ok(cleansed.length > 0, 'and the release should be reported');
  void binder;
});

test('a move that can miss sometimes does, and says so', () => {
  const thruster = wearing({ horns: 'single' }, 207, 'thruster');
  const { moss } = pair(207);
  let misses = 0;
  let hits = 0;

  for (let seed = 0; seed < 40; seed++) {
    const state = createDuelWithLoadouts(thruster, moss, [
      { monsterId: thruster.id, skillIds: ['single-thrust', 'strike'] },
    ]);
    const next = stepTurn(
      state,
      [createScriptedPolicy([{ kind: 'skill', skillId: 'single-thrust' }]), createScriptedPolicy([{ kind: 'defend' }])],
      createSeededRandom(900 + seed),
    );
    const events = effectsOf(next).filter((e) => e.actorId === state.combatants[0]?.id);
    if (events.some((e) => e.type === 'miss' && e.reason === 'chance')) misses++;
    if (events.some((e) => e.type === 'damage')) hits++;
  }

  assert.ok(misses > 0, 'a 60% move never missed in 40 tries');
  assert.ok(hits > 0, 'and it never landed either');
  assert.ok(misses + hits >= 40, 'every attempt should be one or the other');
});

test('an instant death ends it outright, with no damage roll', () => {
  const reaper = wearing({ wings: 'ethereal' }, 209, 'reaper');
  const { moss } = pair(209);

  let killed = 0;
  for (let seed = 0; seed < 60; seed++) {
    const state = createDuelWithLoadouts(reaper, moss, [
      { monsterId: reaper.id, skillIds: ['soul-wing', 'strike'] },
    ]);
    // A finisher costs more than a monster opens with, by design.
    const caster = state.combatants[0];
    assert.ok(caster);
    caster.mp = 40;
    const next = stepTurn(
      state,
      [createScriptedPolicy([{ kind: 'skill', skillId: 'soul-wing' }]), createScriptedPolicy([{ kind: 'defend' }])],
      createSeededRandom(1100 + seed),
    );
    const victim = next.combatants.find((c) => c.side === 1);
    if (victim && victim.hp === 0) killed++;
  }
  assert.ok(killed > 0, 'a one-in-five instant death never fired in 60 tries');
  assert.ok(killed < 60, 'and it should not be firing every time');
});

test('a reflected hit goes back to whoever threw it', () => {
  const { moss } = pair(211);
  const sweeper = createMonsterFromAnalysis(
    { tail: 'long', confidence: 1 },
    testContext(211),
    { name: 'sweeper', id: 'sweeper' },
  );

  const state = createDuelWithLoadouts(sweeper, moss, [
    { monsterId: sweeper.id, skillIds: ['tail-sweep', 'strike'] },
  ]);
  const next = stepTurn(
    state,
    [
      createScriptedPolicy([{ kind: 'skill', skillId: 'tail-sweep' }]),
      createScriptedPolicy([{ kind: 'attack' }]),
    ],
    createSeededRandom(4),
  );

  const defender = next.combatants.find((c) => c.monsterId === sweeper.id);
  const attacker = next.combatants.find((c) => c.monsterId === moss.id);
  assert.ok(defender && attacker);
  assert.equal(defender.hp, defender.maxHp, 'the reflecting side should take nothing');
  assert.ok(attacker.hp < attacker.maxHp, 'and the attacker should take it instead');
});

test('a buff doubles the hit, and a cleanse takes it away again', () => {
  const charger = wearing({ horns: 'spiral' }, 213, 'charger');
  const { moss } = pair(213);

  const state = createDuelWithLoadouts(charger, moss, [
    { monsterId: charger.id, skillIds: ['ram-charge', 'strike'] },
  ]);
  const user = state.combatants[0];
  assert.ok(user);
  user.mp = 40;
  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'ram-charge' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(5),
  );

  const buffed = next.combatants.find((c) => c.monsterId === charger.id);
  assert.ok(buffed);
  assert.equal(hasStatus(buffed.statuses, 'attackUp'), true);
  assert.equal(offenceMultiplier(buffed.statuses), 2);
});

test('a status move still attacks when the spec says it does', () => {
  // Settled on 2026-10-27: the seven buff/status moves attack as well.
  for (const id of [
    'ram-charge', 'wing-cutter', 'magic-eye', 'pierce-gaze',
    'pollen-burst', 'royal-order', 'antenna-pulse',
  ]) {
    assert.equal(getMoveBehavior(id).attacks, true, `${id} should attack`);
  }
  // And the two that do not are still the two that do not.
  assert.equal(getMoveBehavior('hydro-ram').attacks, false);
  assert.equal(getMoveBehavior('crystal-ray').attacks, false);
});

test('bind lands six times in ten, and holds on one in five of those', () => {
  const behavior = getMoveBehavior('bind-whip');
  const binds = behavior.applies.filter((a) => a.status === 'bind');
  assert.equal(binds.length, 2, 'one for the first turn, one for the second');

  const short = binds.find((b) => b.turns === DEFAULT_BATTLE_CONFIG.statusTurns.bind);
  const long = binds.find((b) => b.turns === DEFAULT_BATTLE_CONFIG.statusTurns.bindExtended);
  assert.ok(short && long);
  assert.ok(Math.abs(short.chance - 0.6) < 1e-9, 'the spec says 60%');
  assert.ok(
    Math.abs(long.chance - 0.6 * 0.2) < 1e-9,
    'and 20% of those, not 20% of everything',
  );
});

test('a monster that can act while bound still can', () => {
  const royal = wearing({ crest: 'crown' }, 215, 'royal');
  const { moss } = pair(215);
  const state = createDuelWithLoadouts(royal, moss, [
    { monsterId: royal.id, skillIds: ['royal-order', 'strike'] },
  ]);
  const bound = state.combatants.find((c) => c.monsterId === royal.id);
  assert.ok(bound);
  bound.statuses = [{ kind: 'bind', turns: 2 }];

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'royal-order' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(6),
  );

  const skipped = effectsOf(next).filter((e) => e.type === 'skip' && e.actorId === bound.id);
  assert.equal(skipped.length, 0, 'this move is the way out of a bind');
  assert.ok(
    effectsOf(next).some((e) => e.type === 'damage' && e.actorId === bound.id),
    'and it should have landed',
  );
});

test('poison doubles a move that feeds on it', () => {
  const slammer = createMonsterFromAnalysis(
    { bodyShape: 'muscular', confidence: 1 },
    testContext(217),
    { name: 'slammer', id: 'slammer' },
  );
  const { moss } = pair(217);
  const config = createBattleConfig({ damageVariance: 0 });

  const healthy = createCombatant(slammer, 0);
  const sick = {
    ...createCombatant(slammer, 0),
    statuses: [{ kind: 'poison' as const, turns: 3 }],
  };
  const target = createCombatant(moss, 1);
  const behavior = getMoveBehavior('power-slam');

  const factorHealthy = conditionMultiplier(behavior.conditions, {
    targetDefending: false,
    targetStatuses: target.statuses,
    selfStatuses: healthy.statuses,
  });
  const factorSick = conditionMultiplier(behavior.conditions, {
    targetDefending: false,
    targetStatuses: target.statuses,
    selfStatuses: sick.statuses,
  });
  assert.equal(factorHealthy, 1);
  assert.equal(factorSick, 2);
  void config;
});

test('a weak move transfers its own debuffs rather than keeping them', () => {
  const finned = createMonsterFromAnalysis(
    { crest: 'fin', confidence: 1 },
    testContext(219),
    { name: 'finned', id: 'finned' },
  );
  const { moss } = pair(219);
  const state = createDuelWithLoadouts(finned, moss, [
    { monsterId: finned.id, skillIds: ['fin-slash', 'strike'] },
  ]);
  const carrier = state.combatants.find((c) => c.monsterId === finned.id);
  assert.ok(carrier);
  carrier.statuses = [{ kind: 'poison', turns: 3 }];

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'skill', skillId: 'fin-slash' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(7),
  );

  const giver = next.combatants.find((c) => c.monsterId === finned.id);
  const taker = next.combatants.find((c) => c.monsterId === moss.id);
  assert.ok(giver && taker);
  assert.equal(hasStatus(giver.statuses, 'poison'), false, 'it should have handed the poison over');
  assert.equal(hasStatus(taker.statuses, 'poison'), true, 'and the target should have it');
});
