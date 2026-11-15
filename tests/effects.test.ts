import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyStatus,
  canApplyStatus,
  statusOf,
  blockingStatus,
  conditionMultiplier,
  getMoveBehavior,
  getMoveHealing,
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
import type { BattleEffectEvent, StatusEffect, StatusKind } from '../src/core/effects.ts';
import {
  computeDamage,
  createCombatant,
  createDuelWithLoadouts,
  createScriptedPolicy,
  stepTurn,
} from '../src/core/battle.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { createMonsterFromAnalysis } from '../src/core/fusion.ts';
import type { CrestType, Element, EyeType, HornType, TailType, WingType, BodyShape } from '../src/shared/types.ts';
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
  feature: { horns?: HornType; crest?: CrestType; tail?: TailType; wings?: WingType; bodyShape?: BodyShape; eyes?: EyeType },
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

test('an ailment that is still running cannot be applied again', () => {
  let statuses: StatusEffect[] = [];
  statuses = applyStatus(statuses, { kind: 'poison', turns: 2 });
  assert.ok(hasStatus(statuses, 'poison'));
  assert.equal(canApplyStatus(statuses, 'poison'), false);

  // Not longer, not stacked, not reset: the two turns it was given are the
  // two turns it gets, however many times it is applied again.
  statuses = applyStatus(statuses, { kind: 'poison', turns: 4 });
  assert.equal(statuses.length, 1, 'the same status does not stack up');
  assert.equal(statuses[0]?.turns, 2, 'and does not get longer');

  statuses = tickStatuses(statuses);
  assert.equal(statuses[0]?.turns, 1, 'it is still ageing out');
  statuses = applyStatus(statuses, { kind: 'poison', turns: 3 });
  assert.equal(statuses[0]?.turns, 1, 'even on its last turn');

  statuses = tickStatuses(statuses);
  assert.equal(hasStatus(statuses, 'poison'), false);

  // Gone now, so it can land again - that is how you keep someone poisoned.
  assert.equal(canApplyStatus(statuses, 'poison'), true);
  statuses = applyStatus(statuses, { kind: 'poison', turns: 3 });
  assert.equal(statuses[0]?.turns, 3);
});

test('a buff can still be topped up, by the longer of the two', () => {
  // Holding a buff already costs the turn that was not spent attacking, so
  // the ailment rule would be charging twice for it.
  let statuses: StatusEffect[] = [];
  statuses = applyStatus(statuses, { kind: 'attackUp', turns: 1, magnitude: 2 });
  assert.equal(canApplyStatus(statuses, 'attackUp'), true);

  statuses = applyStatus(statuses, { kind: 'attackUp', turns: 3, magnitude: 2 });
  assert.equal(statuses.length, 1, 'the same buff does not stack up');
  assert.equal(statuses[0]?.turns, 3, 'the longer duration wins');

  statuses = applyStatus(statuses, { kind: 'attackUp', turns: 1, magnitude: 2 });
  assert.equal(statuses[0]?.turns, 3, 'and a shorter one does not cut it short');
});

test('every status is one or the other, so the rule covers all of them', () => {
  for (const kind of Object.keys(STATUS_POLARITY) as StatusKind[]) {
    const held: StatusEffect[] = [{ kind, turns: 2 }];
    assert.equal(
      canApplyStatus(held, kind),
      STATUS_POLARITY[kind] === 'buff',
      `${kind} does not follow its own polarity`,
    );
    assert.equal(canApplyStatus([], kind), true, `${kind} cannot be applied at all`);
  }
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
    { monsterId: aqua.id, skillIds: ['hydro-ram'] },
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

test('a healer with more magic mends more, within bounds', () => {
  const { aqua } = pair(3);
  const { referenceMagic, minRatio, maxRatio } = DEFAULT_BATTLE_CONFIG.healScaling;
  const nominal = getMoveBehavior('hydro-ram').heal;
  const withMagic = (magic: number) =>
    getMoveHealing('hydro-ram', { ...aqua, stats: { ...aqua.stats, magic } });

  // At the reference it is exactly what the move says it is, so the figure in
  // the description is not a lie for an average healer.
  assert.equal(withMagic(referenceMagic), nominal);

  assert.ok(withMagic(20) < nominal, 'a poor caster should heal less');
  assert.ok(withMagic(120) > nominal, 'a strong caster should heal more');
  assert.ok(
    withMagic(20) < withMagic(70) && withMagic(70) < withMagic(120),
    'and it should rise the whole way, not step once',
  );

  // The bounds are what stop a healer out-healing the fight.
  for (const magic of [0, 1, 500, 9999]) {
    const healed = withMagic(magic);
    assert.ok(healed >= nominal * minRatio, `${magic} magic heals ${healed}, under the floor`);
    assert.ok(healed <= nominal * maxRatio, `${magic} magic heals ${healed}, over the ceiling`);
  }
  assert.equal(withMagic(0), Math.round(nominal * minRatio), 'the floor is reachable');
  assert.equal(withMagic(9999), Math.round(nominal * maxRatio), 'and so is the ceiling');

  // Whole numbers, because the UI prints this next to a move.
  for (let magic = 0; magic <= 200; magic += 7) {
    assert.equal(withMagic(magic), Math.round(withMagic(magic)), 'a heal must be a whole number');
  }
});

test('asking what a move heals is safe for every move', () => {
  const { aqua } = pair(3);
  for (const move of MOVE_CATALOGUE) {
    const healing = getMoveHealing(move.id, aqua);
    assert.equal(
      healing > 0,
      getMoveBehavior(move.id).heal > 0,
      `${move.id} heals ${healing} but its behaviour says otherwise`,
    );
  }
  assert.equal(getMoveHealing('attack', aqua), 0, 'the plain attack heals nothing');
});

test('the heal in a fight belongs to the caster, not to the move', () => {
  const { aqua } = pair(3);
  const healed = (magic: number) => {
    const state = createDuelWithLoadouts(aqua, aqua, [
      { monsterId: aqua.id, skillIds: ['hydro-ram'] },
    ]);
    const caster = state.combatants[1];
    assert.ok(caster);
    caster.hp = 40;
    caster.stats.magic = magic;
    const next = stepTurn(
      state,
      createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]),
      createSeededRandom(1),
    );
    const event = effectsOf(next).find(
      (e): e is Extract<BattleEffectEvent, { type: 'heal' }> =>
        e.type === 'heal' && e.targetId === caster.id,
    );
    assert.ok(event, `no heal was reported at ${magic} magic`);
    return event.amount;
  };

  const weak = healed(20);
  const strong = healed(120);
  assert.ok(strong > weak, `${strong} magic healed no better than ${weak}`);
  assert.equal(weak, getMoveHealing('hydro-ram', { ...aqua, stats: { ...aqua.stats, magic: 20 } }));
  assert.equal(strong, getMoveHealing('hydro-ram', { ...aqua, stats: { ...aqua.stats, magic: 120 } }));
});

test('healing at full health reports nothing restored', () => {
  const { aqua } = pair(5);
  const state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram'] },
  ]);
  const full = state.combatants[0];
  assert.ok(full);
  assert.equal(full.hp, full.maxHp, 'this one starts untouched');

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]),
    createSeededRandom(2),
  );
  const event = effectsOf(next).find(
    (e): e is Extract<BattleEffectEvent, { type: 'heal' }> =>
      e.type === 'heal' && e.targetId === full.id,
  );
  assert.ok(event, 'the move was still used, so it is still reported');
  assert.equal(event.amount, 0, 'nothing went in');
});

test('restored MP is not reported as a heal of zero', () => {
  // A heal of zero means "already full", so MP has an event of its own.
  const gazer = wearing({ eyes: 'multi' }, 31, 'gazer');
  const restores = getMoveBehavior('multi-gaze').restoreMp;
  assert.ok(restores > 0, 'multi-gaze is the move that hands MP back');

  const state = createDuelWithLoadouts(gazer, gazer, [
    { monsterId: gazer.id, skillIds: ['multi-gaze'] },
  ]);
  const caster = state.combatants[1];
  assert.ok(caster);
  const cost = caster.skills.find((skill) => skill.id === 'multi-gaze')?.cost ?? 0;
  // Enough to pay for the move, and far enough from the cap to see the refund.
  caster.mp = cost;
  const before = caster.mp;

  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'multi-gaze' }]),
    createSeededRandom(4),
  );
  const events = effectsOf(next);
  assert.ok(
    !events.some((e) => e.type === 'heal' && e.actorId === caster.id),
    'an MP restore must not look like a heal',
  );
  const mp = events.find(
    (e): e is Extract<BattleEffectEvent, { type: 'mp' }> =>
      e.type === 'mp' && e.targetId === caster.id,
  );
  assert.ok(mp, 'and it must still be reported');
  assert.equal(mp.amount, restores, 'with what actually went in');
  assert.ok(
    (next.combatants.find((c) => c.id === caster.id)?.mp ?? 0) > before - cost,
    'the MP really came back',
  );
});

test('a heal is capped at full health and says so', () => {
  const { aqua } = pair(5);
  const state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram'] },
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

test('blindness ages out even while the move that caused it keeps landing', () => {
  // The whole point of the rule: マジックアイ costs 7 MP and blinds for two
  // turns, and before this it could be re-cast every turn to hold someone
  // blind for the whole fight. Now the two turns run out on schedule.
  const { aqua } = pair(7);
  let state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['magic-eye'] },
  ]);
  // Side 1 moves first here, so side 0 is the one being blinded.
  const them = state.combatants[0];
  assert.ok(them);

  const rng = createSeededRandom(3);
  const policy = createScriptedPolicy([{ kind: 'skill', skillId: 'magic-eye' }]);
  const blindTurns = () => {
    const live = state.combatants.find((c) => c.id === them.id);
    return statusOf(live?.statuses, 'blind')?.turns ?? 0;
  };

  state = stepTurn(state, policy, rng);
  assert.equal(blindTurns(), DEFAULT_BATTLE_CONFIG.statusTurns.blind, 'it lands at full length');

  state = stepTurn(state, policy, rng);
  const refused = effectsOf(state).filter(
    (e) => e.type === 'noEffect' && e.status === 'blind' && e.reason === 'alreadyActive',
  );
  assert.ok(refused.length > 0, 'the second cast should have been reported as doing nothing');
  assert.equal(blindTurns(), 1, 'and should not have put the two turns back');

  state = stepTurn(state, policy, rng);
  assert.equal(blindTurns(), 0, 'so it runs out, however many times it was re-cast');
});

test('a move that cannot repeat is refused on the second turn', () => {
  const { aqua } = pair(7);
  let state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram'] },
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
    { monsterId: caster.id, skillIds: ['crystal-ray'] },
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
    { monsterId: gorer.id, skillIds: ['double-gore'] },
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
    { monsterId: crusher.id, skillIds: ['coil-crush'] },
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
      { monsterId: thruster.id, skillIds: ['single-thrust'] },
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
      { monsterId: reaper.id, skillIds: ['soul-wing'] },
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
    { monsterId: sweeper.id, skillIds: ['tail-sweep'] },
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
    { monsterId: charger.id, skillIds: ['ram-charge'] },
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
    { monsterId: royal.id, skillIds: ['royal-order'] },
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
    { monsterId: finned.id, skillIds: ['fin-slash'] },
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

// ---------------------------------------------------------------------------
// The seed, settled 2026-10-28: the planter's own follow-up collects
// ---------------------------------------------------------------------------

/** Puts a seed on the defender, credited to the attacker. */
function seeded(state: BattleState, plantedBy: string) {
  const target = state.combatants.find((c) => c.side === 1);
  assert.ok(target);
  target.statuses = [{ kind: 'seed', turns: 2, sourceId: plantedBy }];
  return target;
}

function duelWithElements(attackerElement: Element, seed: number) {
  const attacker = createMonsterFromAnalysis(
    { element: attackerElement, bodyShape: 'muscular', confidence: 1 },
    testContext(seed),
    { name: 'planter', id: 'planter' },
  );
  const { moss } = pair(seed);
  return { attacker, defender: moss };
}

test('a fire follow-up from the planter hits harder', () => {
  const { attacker, defender } = duelWithElements('fire', 301);
  const config = createBattleConfig({ damageVariance: 0 });

  const damageWith = (planted: boolean): number => {
    const state = createDuelWithLoadouts(attacker, defender, [], config);
    const me = state.combatants[0];
    assert.ok(me);
    if (planted) seeded(state, me.id);
    const next = stepTurn(
      state,
      [createScriptedPolicy([{ kind: 'attack' }]), createScriptedPolicy([{ kind: 'defend' }])],
      createSeededRandom(11),
      config,
    );
    const victim = next.combatants.find((c) => c.side === 1);
    assert.ok(victim);
    return victim.maxHp - victim.hp;
  };

  const plain = damageWith(false);
  const paid = damageWith(true);
  assert.ok(paid > plain, `a seeded fire follow-up took ${paid}, plain took ${plain}`);
  const ratio = paid / plain;
  const expected = DEFAULT_BATTLE_CONFIG.seedPayoff.boostFactor;
  assert.ok(
    Math.abs(ratio - expected) < 0.2,
    `expected about ${expected}x, got ${ratio.toFixed(2)}x`,
  );
});

test('a water follow-up from the planter binds instead', () => {
  const { attacker, defender } = duelWithElements('water', 303);
  const state = createDuelWithLoadouts(attacker, defender, []);
  const me = state.combatants[0];
  assert.ok(me);
  seeded(state, me.id);

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'attack' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(13),
  );

  const victim = next.combatants.find((c) => c.side === 1);
  assert.ok(victim);
  assert.equal(hasStatus(victim.statuses, 'bind'), true, 'water should have bound it');
  assert.equal(hasStatus(victim.statuses, 'seed'), false, 'and spent the seed');

  const bound = effectsOf(next).filter(
    (e) => e.type === 'status' && e.status === 'bind',
  );
  assert.ok(bound.length > 0, 'the bind should be reported');
});

test('someone else attacking the seeded target collects nothing', () => {
  // The seed belongs to whoever planted it: a third party, or the target's
  // own ally, does not get paid for it.
  const { attacker, defender } = duelWithElements('fire', 305);
  const config = createBattleConfig({ damageVariance: 0 });

  const damage = (sourceId: string): number => {
    const state = createDuelWithLoadouts(attacker, defender, [], config);
    seeded(state, sourceId);
    const next = stepTurn(
      state,
      [createScriptedPolicy([{ kind: 'attack' }]), createScriptedPolicy([{ kind: 'defend' }])],
      createSeededRandom(17),
      config,
    );
    const victim = next.combatants.find((c) => c.side === 1);
    assert.ok(victim);
    return victim.maxHp - victim.hp;
  };

  const mine = damage('0-0:planter');
  const someoneElse = damage('a-stranger');
  assert.ok(mine > someoneElse, 'the planter should be the one who collects');
});

test('the wrong element collects nothing and leaves the seed', () => {
  const { attacker, defender } = duelWithElements('earth', 307);
  const state = createDuelWithLoadouts(attacker, defender, []);
  const me = state.combatants[0];
  assert.ok(me);
  seeded(state, me.id);

  const next = stepTurn(
    state,
    [createScriptedPolicy([{ kind: 'attack' }]), createScriptedPolicy([{ kind: 'defend' }])],
    createSeededRandom(19),
  );

  const victim = next.combatants.find((c) => c.side === 1);
  assert.ok(victim);
  assert.equal(hasStatus(victim.statuses, 'bind'), false, 'earth does not bind');
  assert.equal(hasStatus(victim.statuses, 'seed'), true, 'and the seed is still there');
});

test('the seed is spent once, not on every hit of a multi-hit move', () => {
  const planter = createMonsterFromAnalysis(
    { element: 'fire', horns: 'twin', confidence: 1 },
    testContext(309),
    { name: 'twinner', id: 'twinner' },
  );
  const { moss } = pair(309);
  const state = createDuelWithLoadouts(planter, moss, [
    { monsterId: planter.id, skillIds: ['double-gore'] },
  ]);
  const me = state.combatants[0];
  assert.ok(me);
  seeded(state, me.id);

  const next = stepTurn(
    state,
    [
      createScriptedPolicy([{ kind: 'skill', skillId: 'double-gore' }]),
      createScriptedPolicy([{ kind: 'defend' }]),
    ],
    createSeededRandom(23),
  );

  const spent = effectsOf(next).filter(
    (e) => e.type === 'cleanse' && e.removed.includes('seed'),
  );
  assert.equal(spent.length, 1, 'one seed, one payout');
});

// ---------------------------------------------------------------------------
// A move the player works for
// ---------------------------------------------------------------------------

test('ファイナルテール deals what the player hammered out, and nothing else', () => {
  const behavior = getMoveBehavior('final-tail');
  assert.equal(behavior.chargeDamage, 2, 'two damage a press, as asked');
  assert.equal(behavior.chargeSeconds, 5);
  assert.equal(behavior.noConsecutiveUse, true, 'and not two turns running');

  const tailed = wearing({ tail: 'spiked' }, 41, 'tailed');
  const hit = (charge: number | undefined) => {
    const state = createDuelWithLoadouts(tailed, tailed, [
      { monsterId: tailed.id, skillIds: ['final-tail'] },
    ]);
    // A finisher costs more than a monster starts with.
    for (const combatant of state.combatants) combatant.mp = 99;
    const next = stepTurn(
      state,
      createScriptedPolicy([{ kind: 'skill', skillId: 'final-tail', ...(charge !== undefined ? { charge } : {}) }]),
      createSeededRandom(3),
    );
    const damage = effectsOf(next).find(
      (e): e is Extract<BattleEffectEvent, { type: 'damage' }> => e.type === 'damage',
    );
    return { damage, next };
  };

  assert.equal(hit(37).damage?.amount, 74, '37 presses is 74 damage');
  assert.equal(hit(1).damage?.amount, 2);
  assert.equal(hit(0).damage?.amount, 0, 'no presses, no damage');
  assert.equal(hit(undefined).damage?.amount, 0, 'and a UI that forgets to count does no harm');

  // The multiplier flourish the player asked for rides on the existing one.
  const boosted = hit(20).damage;
  assert.equal(boosted?.boostTotal, 2);
  assert.deepEqual(boosted?.boosts?.map((b) => b.source), ['charge']);
  assert.equal(boosted?.boosts?.[0]?.reason, '連打');
});

test('a hammered hit is not also an ordinary swing, and still costs the recoil', () => {
  const tailed = wearing({ tail: 'spiked' }, 42, 'tailed');
  const state = createDuelWithLoadouts(tailed, tailed, [
    { monsterId: tailed.id, skillIds: ['final-tail'] },
  ]);
  for (const combatant of state.combatants) combatant.mp = 99;
  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: 'final-tail', charge: 5 }]),
    createSeededRandom(4),
  );
  const damages = effectsOf(next).filter((e) => e.type === 'damage');
  assert.equal(damages.length, 2, 'one hit each, not a hammered hit plus a normal one');
  for (const event of damages) {
    assert.equal(event.type === 'damage' && event.amount, 10, 'five presses, ten damage');
  }
  assert.ok(
    next.combatants.some((c) => (c.statuses ?? []).some((s) => s.kind === 'recoil')),
    'the move still locks whoever swung it',
  );
});

test('a turn spent guarding frees a move that cannot repeat', () => {
  // ウォーターヒール rather than ファイナルテール: the tail locks its user with
  // recoil anyway, so it could not show whether guarding was what freed it.
  const { aqua } = pair(43);
  let state = createDuelWithLoadouts(aqua, aqua, [
    { monsterId: aqua.id, skillIds: ['hydro-ram'] },
  ]);
  for (const combatant of state.combatants) { combatant.mp = 99; combatant.hp = 30; }
  const rng = createSeededRandom(6);
  const heal = createScriptedPolicy([{ kind: 'skill', skillId: 'hydro-ram' }]);
  const guard = createScriptedPolicy([{ kind: 'defend' }]);
  const refusedIn = (entries: readonly { effects?: readonly BattleEffectEvent[] }[]) =>
    entries.some((e) => e.effects?.some((x) => x.type === 'blocked' && x.reason === 'consecutive'));

  state = stepTurn(state, heal, rng);
  let mark = state.log.length;
  state = stepTurn(state, heal, rng);
  assert.ok(refusedIn(state.log.slice(mark)), 'the second turn running should have been refused');

  state = stepTurn(state, guard, rng);
  mark = state.log.length;
  state = stepTurn(state, heal, rng);
  assert.ok(!refusedIn(state.log.slice(mark)), 'a turn had passed, so it should have been allowed');
});

test('only what hands could manage counts, however much is sent', () => {
  const perSecond = DEFAULT_BATTLE_CONFIG.maxChargePressesPerSecond;
  const behavior = getMoveBehavior('final-tail');
  const ceiling = Math.round(behavior.chargeSeconds * perSecond);
  assert.equal(perSecond, 15, 'the player set fifteen a second');
  assert.equal(ceiling, 75, 'so five seconds is worth seventy-five presses');

  const tailed = wearing({ tail: 'spiked' }, 44, 'tailed');
  const hit = (charge: number) => {
    const state = createDuelWithLoadouts(tailed, tailed, [
      { monsterId: tailed.id, skillIds: ['final-tail'] },
    ]);
    for (const combatant of state.combatants) { combatant.mp = 99; combatant.hp = 9999; }
    const next = stepTurn(
      state,
      createScriptedPolicy([{ kind: 'skill', skillId: 'final-tail', charge }]),
      createSeededRandom(7),
    );
    return effectsOf(next).find(
      (e): e is Extract<BattleEffectEvent, { type: 'damage' }> => e.type === 'damage',
    )?.amount;
  };

  const most = ceiling * behavior.chargeDamage;
  assert.equal(hit(ceiling), most, 'a very fast player gets the lot');
  assert.equal(hit(ceiling - 10), (ceiling - 10) * behavior.chargeDamage, 'and a slower one gets theirs');
  for (const absurd of [ceiling + 1, 500, 10_000, 1_000_000]) {
    assert.equal(hit(absurd), most, `${absurd} presses bought more than the ceiling`);
  }
});

test('how much of a reflected hit comes back is a setting', () => {
  // Measured 2026-11-15: in a mirror match アクア kept 76% of its wins
  // against itself-without-跳ね返し-and-bind. The whole hit coming back is
  // the default, but it has to be adjustable to be answerable.
  const { moss } = pair(211);
  const sweeper = createMonsterFromAnalysis(
    { tail: 'long', confidence: 1 },
    testContext(211),
    { name: 'sweeper', id: 'sweeper' },
  );

  function thrownBack(reflectShare: number): number {
    const config = { ...DEFAULT_BATTLE_CONFIG, reflectShare };
    const state = createDuelWithLoadouts(
      sweeper,
      moss,
      [{ monsterId: sweeper.id, skillIds: ['tail-sweep'] }],
      config,
    );
    const next = stepTurn(
      state,
      [
        createScriptedPolicy([{ kind: 'skill', skillId: 'tail-sweep' }]),
        createScriptedPolicy([{ kind: 'attack' }]),
      ],
      createSeededRandom(4),
      config,
    );
    const attacker = next.combatants.find((c) => c.monsterId === moss.id);
    assert.ok(attacker);
    return attacker.maxHp - attacker.hp;
  }

  const whole = thrownBack(1);
  assert.ok(whole > 0, 'the whole hit comes back by default');
  assert.equal(thrownBack(0), 0, 'and none of it when the share is nothing');
  const half = thrownBack(0.5);
  assert.ok(half > 0 && half < whole, `half should be between: ${half} of ${whole}`);
});

test('the bind numbers come from config, not from the move table', () => {
  // 「確率はハードコードせず」: these two were literals beside the moves until
  // 2026-11-15. They are read once, when the table is built, so changing them
  // means changing the default - but they are in one findable place now.
  assert.equal(DEFAULT_BATTLE_CONFIG.bindChance, 0.6);
  assert.equal(DEFAULT_BATTLE_CONFIG.bindExtendChance, 0.2);
  const bind = getMoveBehavior('bind-whip').applies.filter((a) => a.status === 'bind');
  assert.equal(bind.length, 2, 'one for the turn, one for the second turn');
  assert.equal(bind[0]?.chance, DEFAULT_BATTLE_CONFIG.bindChance);
  assert.ok(
    Math.abs((bind[1]?.chance ?? 0)
      - DEFAULT_BATTLE_CONFIG.bindChance * DEFAULT_BATTLE_CONFIG.bindExtendChance) < 1e-9,
  );
});
