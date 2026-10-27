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
  declareActions,
  deriveSkills,
  elementMultiplier,
  expectedDamage,
  offensivePower,
  runBattle,
  simulateDuel,
  stepTurn,
  turnOrder,
} from '../src/core/battle.ts';
import { getMoveBehavior } from '../src/core/effects.ts';
import { createRootMonster, fuse } from '../src/core/fusion.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { MAX_MOVE_SLOTS } from '../src/core/moves.ts';
import { createSeededRandom } from '../src/core/random.ts';
import type { BattlePolicy } from '../src/shared/types.ts';
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
  const broke = deriveSkills(a)[0];
  assert.ok(broke, 'the fixture should know at least one move');
  const next = stepTurn(
    state,
    createScriptedPolicy([{ kind: 'skill', skillId: broke.id }]),
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
  // What a monster brings is its default loadout, so the count depends on how
  // many weaponised features it has.
  assert.ok(deriveSkills(a).length >= 1);
  assert.ok(deriveSkills(a).length <= MAX_MOVE_SLOTS);
});

test('the element chart is applied and configurable', () => {
  // Advantage compounds, so these are milder than they look: dealing 1.25x
  // while taking 0.8x is already a 1.5x edge.
  assert.equal(elementMultiplier('fire', 'water'), 0.8);
  assert.equal(elementMultiplier('water', 'fire'), 1.25);
  assert.equal(elementMultiplier('neutral', 'neutral'), 1);
  for (const [attacker, row] of Object.entries(DEFAULT_BATTLE_CONFIG.elementChart)) {
    for (const [defender, value] of Object.entries(row ?? {})) {
      assert.ok(
        value >= 0.6 && value <= 1.5,
        `${attacker}->${defender}: ${value} turns a matchup into a formality`,
      );
    }
  }

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

// ---------------------------------------------------------------------------
// Declaring before resolving
// ---------------------------------------------------------------------------

test('a guard is up before a faster attacker swings', () => {
  // The case that used to fail: the slow one declares defend, the fast one
  // hits first, and the guard was still being raised in speed order.
  const [a, b] = twoMonsters(31);
  const slow = { ...a, id: 'slow', stats: { ...a.stats, speed: 5 } };
  const fast = { ...b, id: 'fast', stats: { ...b.stats, speed: 200 } };
  const config = createBattleConfig({ damageVariance: 0 });

  const damageTaken = (defending: boolean): number => {
    const state = stepTurn(
      createDuel(slow, fast, config),
      [
        createScriptedPolicy([{ kind: defending ? 'defend' : 'attack' }]),
        createScriptedPolicy([{ kind: 'attack' }]),
      ],
      createSeededRandom(4),
      config,
    );
    const victim = state.combatants.find((c) => c.side === 0);
    assert.ok(victim);
    return victim.maxHp - victim.hp;
  };

  const braced = damageTaken(true);
  const open = damageTaken(false);
  assert.ok(
    braced < open,
    `guarding against a faster attacker took ${braced}, standing took ${open}`,
  );
});

test('every policy is asked exactly once per turn', () => {
  const [a, b] = twoMonsters(12);
  let calls = 0;
  const counting = {
    chooseAction() {
      calls++;
      return { kind: 'attack' } as const;
    },
  };
  stepTurn(createDuel(a, b), counting, createSeededRandom(1));
  assert.equal(calls, 2, 'two combatants, two questions');
});

test('a decision is made against the state at the start of the turn', () => {
  const [a, b] = twoMonsters(14);
  const seen: number[] = [];
  const watcher: BattlePolicy = {
    chooseAction(_actor, state) {
      seen.push(state.combatants.reduce((sum, c) => sum + c.hp, 0));
      return { kind: 'attack' };
    },
  };
  stepTurn(createDuel(a, b), watcher, createSeededRandom(2));
  assert.equal(seen.length, 2);
  assert.equal(seen[0], seen[1], 'the second to be asked must not see the first one act');
});

test('declared intentions can be read without resolving them', () => {
  const [a, b] = twoMonsters(15);
  const state = createDuel(a, b);
  const declared = declareActions(state, createScriptedPolicy([{ kind: 'defend' }]));
  assert.equal(declared.length, 2);
  assert.ok(declared.every((d) => d.action.kind === 'defend'));
  assert.ok(state.combatants.every((c) => !c.defending), 'declaring must not mutate the state');
});

test('guarding returns some MP, so it is a move rather than a pause', () => {
  const [a, b] = twoMonsters(16);
  const config = createBattleConfig({ mpRegenPerTurn: 0, defendMpBonus: 5, startingMp: 10 });
  const next = stepTurn(
    createDuel(a, b, config),
    createScriptedPolicy([{ kind: 'defend' }]),
    createSeededRandom(3),
    config,
  );
  assert.ok(next.combatants.every((c) => c.mp === 15));
});

// ---------------------------------------------------------------------------
// Structured log
// ---------------------------------------------------------------------------

test('a hit records what it was, not just how much', () => {
  const [a, b] = twoMonsters(21);
  // It has to attack and it has to land: a support move is logged as a heal or
  // a cleanse, and a move with a success roll may be logged as a miss.
  const used = deriveSkills(a).find((s) => {
    const behavior = getMoveBehavior(s.id);
    return (
      s.cost <= DEFAULT_BATTLE_CONFIG.startingMp &&
      behavior.attacks &&
      behavior.successChance === 1 &&
      behavior.instantDeathChance === 0
    );
  });
  assert.ok(used, 'the fixture should know a reliable attack it can afford on turn one');
  const state = stepTurn(
    createDuel(a, b),
    createScriptedPolicy([{ kind: 'skill', skillId: used.id }]),
    createSeededRandom(5),
  );
  const hit = state.log.find((e) => e.kind === 'skill');
  assert.ok(hit, 'no skill was logged');
  assert.equal(hit.skillId, used.id);
  assert.equal(typeof hit.elementMultiplier, 'number');
  assert.equal(typeof hit.mitigated, 'number');
  assert.ok((hit.mpSpent ?? 0) > 0, 'a skill costs MP and the log should say so');
});

test('the log reports what a guard absorbed', () => {
  const [a, b] = twoMonsters(22);
  const state = stepTurn(
    createDuel(a, b),
    [createScriptedPolicy([{ kind: 'defend' }]), createScriptedPolicy([{ kind: 'attack' }])],
    createSeededRandom(6),
  );
  const hit = state.log.find((e) => e.kind === 'attack');
  assert.ok(hit);
  assert.ok((hit.mitigated ?? 0) > 0, 'a hit on a guarding target absorbed nothing');
});

test('the element multiplier in the log is the one the chart gives', () => {
  const [base, other] = twoMonsters(23);
  const a = { ...base, phenotype: { ...base.phenotype, element: 'fire' as const } };
  const b = { ...other, phenotype: { ...other.phenotype, element: 'water' as const } };

  const state = stepTurn(
    createDuel(a, b),
    createScriptedPolicy([{ kind: 'attack' }]),
    createSeededRandom(7),
  );
  let checked = 0;
  for (const entry of state.log) {
    if (entry.kind !== 'attack') continue;
    const attacker = state.combatants.find((c) => c.id === entry.actorId);
    const target = state.combatants.find((c) => c.id === entry.targetId);
    assert.ok(attacker && target);
    assert.equal(
      entry.elementMultiplier,
      elementMultiplier(attacker.element, target.element),
      'the log and the chart must not disagree',
    );
    checked++;
  }
  assert.ok(checked > 0);
});

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

test('an even fight lasts long enough to make a decision in', () => {
  const starters = createStarterMonsters(testContext(41));
  const turns: number[] = [];
  for (let i = 0; i < starters.length; i++) {
    for (let j = i + 1; j < starters.length; j++) {
      const a = starters[i];
      const b = starters[j];
      assert.ok(a && b);
      for (let seed = 0; seed < 20; seed++) {
        const rng = createSeededRandom(500 + seed);
        turns.push(runBattle(createDuel(a, b), createBasicPolicy(rng), rng).turn);
      }
    }
  }
  turns.sort((x, y) => x - y);
  const median = turns[Math.floor(turns.length / 2)] as number;
  assert.ok(median >= 4, `an even fight takes ${median} turns, too few to play`);
  assert.ok(median <= 9, `an even fight takes ${median} turns, too many to sit through`);
});

test('speed leans a fight without deciding it', () => {
  const [base] = twoMonsters(43);
  const fast = { ...base, id: 'fast', stats: { ...base.stats, speed: base.stats.speed + 40 } };
  let wins = 0;
  const runs = 60;
  for (let seed = 0; seed < runs; seed++) {
    const rng = createSeededRandom(600 + seed);
    const final = runBattle(createDuel(fast, base), createBasicPolicy(rng), rng);
    if (final.outcome.status === 'win' && final.outcome.winningSide === 0) wins++;
  }
  const rate = wins / runs;
  assert.ok(rate > 0.5, `a 40 point speed edge won ${(rate * 100).toFixed(0)}%, so speed is worthless`);
  assert.ok(rate < 0.9, `a 40 point speed edge won ${(rate * 100).toFixed(0)}%, so speed is the whole game`);
});

test('guarding every turn survives far longer than attacking every turn', () => {
  // Pooled over matchups on purpose. Now that a monster's slots hold only what
  // its body taught it, one opponent's whole set may ignore the guard while the
  // next one's ignores none of it, and a single pair says more about which
  // moves it drew than about what guarding is worth.
  const length = (action: 'defend' | 'attack'): number => {
    let total = 0;
    let fights = 0;
    for (const pair of [45, 46, 47, 48, 49, 50, 51, 52, 53, 54]) {
      const [a, b] = twoMonsters(pair);
      for (let seed = 0; seed < 20; seed++) {
        const rng = createSeededRandom(700 + seed);
        total += runBattle(
          createDuel(a, b),
          [createScriptedPolicy([{ kind: action }]), createBasicPolicy(rng)],
          rng,
        ).turn;
        fights++;
      }
    }
    return total / fights;
  };
  const guarded = length('defend');
  const traded = length('attack');
  assert.ok(
    guarded > traded * 1.5,
    `guarding lasted ${guarded.toFixed(1)} turns against ${traded.toFixed(1)}, so it buys nothing`,
  );
});

test('the plain attack swings with whichever offence the monster actually has', () => {
  // A feature move is physical or magical by its own nature - a tail swipe is
  // a tail swipe - so the monster that leans on magic needs the plain attack to
  // read off its magic. Nothing else will: there are no shared moves left.
  const [base, other] = twoMonsters(47);
  assert.ok(base && other);

  const asCombatant = (attack: number, magic: number) => ({
    ...createCombatant({ ...base, stats: { ...base.stats, attack, magic } }, 0),
  });

  const caster = asCombatant(40, 110);
  const brawler = asCombatant(110, 40);

  // Same totals, mirrored. The plain attack should be worth the same to both.
  assert.equal(
    Math.round(offensivePower(caster, undefined)),
    Math.round(offensivePower(brawler, undefined)),
    'a caster punches as hard as a brawler swings, with its own stat',
  );

  // And it is the magic that is doing the work for the caster.
  const weakened = asCombatant(40, 60);
  assert.ok(
    offensivePower(caster, undefined) > offensivePower(weakened, undefined),
    'losing magic should cost the caster its plain attack',
  );
});

test('the off-hand offence still counts for something', () => {
  const [base, other] = twoMonsters(49);
  const attacker = createCombatant(base, 0);
  const target = createCombatant(other, 1);

  const lopsided = { ...attacker, stats: { ...attacker.stats, attack: 100, magic: 0 } };
  const rounded = { ...attacker, stats: { ...attacker.stats, attack: 100, magic: 80 } };
  assert.ok(
    offensivePower(rounded, undefined) > offensivePower(lopsided, undefined),
    'a monster with two offences should hit harder than one with a dump stat',
  );
  assert.ok(
    expectedDamage(rounded, target) > expectedDamage(lopsided, target),
  );
});
