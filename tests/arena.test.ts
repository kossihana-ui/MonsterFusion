import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  advanceArenaTurn,
  arenaRules,
  BOSS_TEMPLATE,
  claimArenaReward,
  createArenaEnemy,
  isArenaOver,
  nextArenaEncounter,
  startArena,
} from '../src/core/arena.ts';
import {
  addPart,
  countOf,
  createPartInventory,
  fuseWithPart,
  partFromFeature,
  partsOf,
  previewPartFusion,
  removePart,
} from '../src/core/parts.ts';
import type { ArenaRun } from '../src/core/arena.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { defaultLoadout, getLearnableMoves } from '../src/core/moves.ts';
import { computeStats, statTotal, withinCaps } from '../src/core/stats.ts';
import { expressGenes } from '../src/core/genetics.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { createGameConfig, DEFAULT_ARENA_CONFIG } from '../src/core/config.ts';
import {
  createSaveFile,
  deserializeSaveFile,
  serializeSaveFile,
} from '../src/core/storage.ts';
import { testContext } from './helpers.ts';

function player(seed = 1) {
  const monsters = createStarterMonsters(testContext(seed));
  const monster = monsters[1];
  assert.ok(monster);
  return monster;
}

/** Plays a fight to its end, however it ends. */
function playOut(run: ArenaRun, context = testContext(2)): ArenaRun {
  let current = run;
  let guard = 0;
  while (current.phase === 'battle' && guard++ < 200) {
    const me = current.battle.combatants.find((c) => c.side === 0);
    assert.ok(me);
    const affordable = me.skills.find((s) => s.cost <= me.mp);
    current = advanceArenaTurn(
      current,
      affordable ? { kind: 'skill', skillId: affordable.id } : { kind: 'attack' },
      context,
    );
  }
  return current;
}

/** Wins a fight outright by giving the player an overwhelming monster. */
function runWithCrushingPlayer(seed = 7) {
  const base = player(seed);
  const strong = {
    ...base,
    id: 'champion',
    stats: { hp: 300, attack: 150, defense: 150, magic: 150, speed: 150 },
  };
  const context = testContext(seed);
  return { context, run: startArena(strong, defaultLoadout(strong), context, { id: `run-${seed}` }) };
}

// ---------------------------------------------------------------------------
// Progression
// ---------------------------------------------------------------------------

test('a run opens on the first fight', () => {
  const context = testContext(3);
  const monster = player(3);
  const run = startArena(monster, defaultLoadout(monster), context, { id: 'r1' });

  assert.equal(run.phase, 'battle');
  assert.equal(run.wins, 0);
  assert.equal(run.encounter.index, 0);
  assert.equal(run.encounter.isBoss, false);
  assert.equal(run.battle.outcome.status, 'ongoing');
  assert.ok(run.battle.combatants.some((c) => c.monsterId === monster.id));
});

test('the boss comes after five wins, once', () => {
  const { context, run } = runWithCrushingPlayer(11);
  let current = run;
  const bossAppearances: number[] = [];

  for (let fight = 0; fight < DEFAULT_ARENA_CONFIG.normalWins + 1; fight++) {
    assert.equal(current.phase, 'battle', `fight ${fight} did not start`);
    if (current.encounter.isBoss) bossAppearances.push(fight);
    current = playOut(current, context);
    assert.equal(current.phase, 'reward', `fight ${fight} was not won`);
    current = claimArenaReward(current, createPartInventory(), context).run;
    current = nextArenaEncounter(current, context);
  }

  assert.deepEqual(bossAppearances, [DEFAULT_ARENA_CONFIG.normalWins], 'exactly one boss, last');
  assert.equal(current.phase, 'cleared');
  assert.ok(isArenaOver(current));
});

test('losing ends the streak', () => {
  const context = testContext(13);
  const weak = { ...player(13), id: 'weakling', stats: { hp: 1, attack: 1, defense: 1, magic: 1, speed: 1 } };
  const run = playOut(startArena(weak, defaultLoadout(weak), context, { id: 'r2' }), context);

  assert.equal(run.phase, 'failed');
  assert.equal(run.wins, 0);
  assert.ok(isArenaOver(run));
  assert.equal(nextArenaEncounter(run, context), run, 'a finished run does not continue');
});

test('the same run shows the same enemy however often it is asked', () => {
  const monster = player(17);
  const context = testContext(17);
  for (let index = 0; index <= DEFAULT_ARENA_CONFIG.normalWins; index++) {
    const a = createArenaEnemy('stable', index, monster, context);
    const b = createArenaEnemy('stable', index, monster, testContext(99));
    assert.equal(a.enemy.id, b.enemy.id);
    assert.deepEqual(a.enemy.genes, b.enemy.genes, `encounter ${index} rerolled`);
  }

  // A different run is a different draw.
  const other = createArenaEnemy('elsewhere', 0, monster, context);
  assert.notDeepEqual(other.enemy.genes, createArenaEnemy('stable', 0, monster, context).enemy.genes);
});

test('the boss looks like a boss and stands above the collection', () => {
  const monster = player(19);
  const context = testContext(19);
  const boss = createArenaEnemy('b', DEFAULT_ARENA_CONFIG.normalWins, monster, context);

  assert.equal(boss.isBoss, true);
  for (const [locus, value] of Object.entries(BOSS_TEMPLATE)) {
    assert.equal(
      (boss.enemy.phenotype as unknown as Record<string, unknown>)[locus],
      value,
      `a boss should keep its ${locus}`,
    );
  }
  assert.equal(boss.enemy.tier, DEFAULT_ARENA_CONFIG.bossTier);
  assert.ok(boss.enemy.stats.hp > monster.stats.hp, 'a boss should be worth the warning');
});

test('an enemy is internally consistent, however it was tuned', () => {
  const monster = player(23);
  const context = testContext(23);
  const config = createGameConfig();
  for (let index = 0; index <= DEFAULT_ARENA_CONFIG.normalWins; index++) {
    const { enemy } = createArenaEnemy('consistency', index, monster, context);
    const expressed = expressGenes(enemy.genes, createSeededRandom(1), config.genetics);
    // Appearance is derived from the genes, and the stats from the appearance.
    assert.deepEqual(
      { ...enemy.phenotype, ...expressed },
      { ...expressed },
      `encounter ${index}: phenotype does not follow from the genes`,
    );
    assert.deepEqual(
      enemy.stats,
      computeStats(enemy.phenotype, enemy.mutationCount, config.stats, enemy.tier),
      `encounter ${index}: stats do not follow from the appearance`,
    );
    assert.ok(withinCaps(enemy.stats, config.stats, enemy.tier));
    assert.ok(getLearnableMoves(enemy).length >= 2);
  }
});

test('the rules are published rather than left to the UI', () => {
  const rules = arenaRules();
  assert.ok(rules.length >= 3);
  assert.ok(rules.some((r) => r.includes('5')), 'the win count should be stated');
});

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

test('a reward is paid once, and a second claim adds nothing', () => {
  const { context, run } = runWithCrushingPlayer(29);
  const won = playOut(run, context);
  assert.equal(won.phase, 'reward');

  const first = claimArenaReward(won, createPartInventory(), context);
  assert.equal(first.duplicate, false);

  const second = claimArenaReward(first.run, first.inventory, context);
  assert.equal(second.duplicate, true);
  assert.deepEqual(second.inventory.stacks, first.inventory.stacks, 'a second claim must not pay');
  assert.equal(second.parts.length, 0);
});

test('a reward cannot be taken before the fight is won', () => {
  const context = testContext(31);
  const monster = player(31);
  const run = startArena(monster, defaultLoadout(monster), context, { id: 'r3' });
  const result = claimArenaReward(run, createPartInventory(), context);
  assert.equal(result.parts.length, 0);
  assert.equal(result.run.phase, 'battle');
  assert.match(result.message, /まだ/);
});

test('only features the enemy was wearing can drop', () => {
  const { context, run } = runWithCrushingPlayer(37);
  let current = run;
  let inventory = createPartInventory();

  for (let fight = 0; fight < 4; fight++) {
    current = playOut(current, context);
    const enemy = current.encounter.enemy;
    const result = claimArenaReward(current, inventory, context);
    for (const part of result.parts) {
      assert.equal(
        (enemy.phenotype as unknown as Record<string, unknown>)[part.locus],
        part.value,
        `${part.name} was not on ${enemy.name}`,
      );
      assert.notEqual(part.value, 'none', 'nothing is not a part');
    }
    inventory = result.inventory;
    current = nextArenaEncounter(result.run, context);
  }
});

test('not dropping anything is a result, not a silence', () => {
  const config = createGameConfig({ arena: { dropChance: 0, bossDropChance: 0 } });
  const context = { ...testContext(41), config };
  const base = player(41);
  const strong = { ...base, id: 'champ2', stats: { hp: 300, attack: 150, defense: 150, magic: 150, speed: 150 } };
  const won = playOut(startArena(strong, defaultLoadout(strong), context, { id: 'r4' }), context);
  const result = claimArenaReward(won, createPartInventory(), context);

  assert.equal(result.empty, true);
  assert.equal(result.parts.length, 0);
  assert.ok(result.message.length > 0, 'the player should still be told');
  assert.equal(result.duplicate, false);
});

test('the next fight waits until the reward is taken', () => {
  const { context, run } = runWithCrushingPlayer(43);
  const won = playOut(run, context);
  assert.equal(nextArenaEncounter(won, context), won, 'skipping the drop must not work');

  const claimed = claimArenaReward(won, createPartInventory(), context);
  const next = nextArenaEncounter(claimed.run, context);
  assert.equal(next.phase, 'battle');
  assert.equal(next.encounter.index, 1);
});

// ---------------------------------------------------------------------------
// Parts and fusion
// ---------------------------------------------------------------------------

test('an inventory adds, counts and spends without mutating', () => {
  const monster = player(47);
  const part = partFromFeature(monster, 'tail');
  assert.ok(part);

  const empty = createPartInventory();
  const one = addPart(empty, part, 1);
  const three = addPart(one, part, 2);

  assert.equal(countOf(empty, part.id), 0, 'the original is untouched');
  assert.equal(countOf(one, part.id), 1);
  assert.equal(countOf(three, part.id), 3);

  const spent = removePart(three, part.id, 2);
  assert.ok(spent);
  assert.equal(countOf(spent, part.id), 1);
  assert.equal(countOf(three, part.id), 3);
  assert.equal(removePart(empty, part.id, 1), null, 'cannot spend what is not held');
});

test('a part guarantees the feature, every time', () => {
  const [moss, ignis] = createStarterMonsters(testContext(53));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'tail');
  assert.ok(part);
  assert.notEqual(moss.phenotype.tail, part.value, 'the test needs a feature Moss lacks');

  const inventory = addPart(createPartInventory(), part, 60);
  for (let i = 0; i < 50; i++) {
    const context = testContext(600 + i);
    const result = fuseWithPart(moss, ignis, part, inventory, context, `req-${i}`);
    assert.equal(result.ok, true);
    assert.ok(result.child);
    assert.equal(
      result.child.phenotype.tail,
      part.value,
      'the guarantee the UI is told about must hold every time',
    );
  }
});

test('a pinned feature does not delete what the parents would have passed on', () => {
  const [moss, ignis] = createStarterMonsters(testContext(59));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'horns');
  assert.ok(part);

  const inventory = addPart(createPartInventory(), part, 1);
  const result = fuseWithPart(moss, ignis, part, inventory, testContext(61), 'keep');
  assert.ok(result.child);

  const pair = result.child.genes.horns;
  assert.equal(pair.a.value, part.value, 'the part is the dominant allele');
  assert.ok(
    pair.b.value !== undefined,
    'the displaced allele should survive as a recessive, not be erased',
  );
  assert.ok(pair.a.dominance > pair.b.dominance, 'and it must lose cleanly');
});

test('a part is spent exactly once, and only when a child was made', () => {
  const [moss, ignis] = createStarterMonsters(testContext(67));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'tail');
  assert.ok(part);
  const inventory = addPart(createPartInventory(), part, 2);

  const first = fuseWithPart(moss, ignis, part, inventory, testContext(71), 'once');
  assert.equal(first.ok, true);
  assert.equal(countOf(first.inventory, part.id), 1);

  // The same request again: no second child, no second charge.
  const repeat = fuseWithPart(moss, ignis, part, first.inventory, testContext(71), 'once');
  assert.equal(repeat.ok, false);
  assert.equal(repeat.duplicate, true);
  assert.equal(repeat.child, null);
  assert.equal(countOf(repeat.inventory, part.id), 1, 'a resend must not charge again');
});

test('a failed fusion costs nothing', () => {
  const [moss, ignis] = createStarterMonsters(testContext(73));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'tail');
  assert.ok(part);

  const empty = createPartInventory();
  const broke = fuseWithPart(moss, ignis, part, empty, testContext(79), 'broke');
  assert.equal(broke.ok, false);
  assert.equal(broke.child, null);
  assert.deepEqual(broke.inventory.stacks, [], 'nothing was taken');

  // Fusing a monster with itself fails before anything is spent.
  const stocked = addPart(createPartInventory(), part, 1);
  const selfFusion = fuseWithPart(moss, moss, part, stocked, testContext(83), 'self');
  assert.equal(selfFusion.ok, false);
  assert.equal(countOf(selfFusion.inventory, part.id), 1);
});

test('the preview says exactly what the fusion will do', () => {
  const [moss, ignis] = createStarterMonsters(testContext(89));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'tail');
  assert.ok(part);

  const without = previewPartFusion(moss, ignis, null);
  assert.equal(without.ok, true);
  assert.equal(without.guaranteedExpression, false, 'no part, no promise');
  assert.equal(without.cost, 0);

  const missing = previewPartFusion(moss, ignis, part, createPartInventory());
  assert.equal(missing.ok, false);
  assert.match(missing.message, /持っていません/);

  const held = previewPartFusion(moss, ignis, part, addPart(createPartInventory(), part, 1));
  assert.equal(held.ok, true);
  assert.equal(held.guaranteedExpression, true);
  assert.equal(held.cost, 1);
  assert.ok(held.message.includes(part.name));

  // And the promise is kept.
  const result = fuseWithPart(moss, ignis, part, addPart(createPartInventory(), part, 1), testContext(97), 'p');
  assert.ok(result.child);
  assert.equal(result.child.phenotype[held.locus as 'tail'], held.value);
});

test('parents and inventory handed to a fusion are left alone', () => {
  const [moss, ignis] = createStarterMonsters(testContext(101));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'tail');
  assert.ok(part);
  const inventory = addPart(createPartInventory(), part, 3);

  const before = [JSON.stringify(moss), JSON.stringify(ignis), JSON.stringify(inventory)];
  fuseWithPart(moss, ignis, part, inventory, testContext(103), 'untouched');
  assert.deepEqual(
    [JSON.stringify(moss), JSON.stringify(ignis), JSON.stringify(inventory)],
    before,
  );
});

test('a child from a part fusion is a whole monster', () => {
  const [moss, ignis] = createStarterMonsters(testContext(107));
  assert.ok(moss && ignis);
  const part = partFromFeature(ignis, 'jaw');
  assert.ok(part);
  const result = fuseWithPart(
    moss,
    ignis,
    part,
    addPart(createPartInventory(), part, 1),
    testContext(109),
    'whole',
  );
  const child = result.child;
  assert.ok(child);

  const config = createGameConfig();
  assert.deepEqual(
    child.stats,
    computeStats(child.phenotype, child.mutationCount, config.stats, child.tier),
  );
  assert.ok(withinCaps(child.stats, config.stats, child.tier));
  assert.equal(child.generation, 1);
  assert.ok(getLearnableMoves(child).length >= 2);
  assert.ok(result.fusion, 'the reveal needs the fusion detail');
});

test('every feature of a monster can become a part', () => {
  const monster = player(113);
  const parts = partsOf(monster);
  assert.ok(parts.length > 0);
  for (const part of parts) {
    assert.equal(
      (monster.phenotype as unknown as Record<string, unknown>)[part.locus],
      part.value,
    );
    assert.ok(part.name.length > 0, `${part.id}: no Japanese name`);
    assert.equal(part.fromMonsterName, monster.name);
  }
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

test('inventory and run survive a save', () => {
  const { context, run } = runWithCrushingPlayer(127);
  const won = playOut(run, context);
  const claimed = claimArenaReward(won, createPartInventory(), context);

  const monsters = createStarterMonsters(testContext(127));
  const save = createSaveFile(monsters, {
    now: () => 0,
    inventory: claimed.inventory,
    arena: claimed.run,
  });
  assert.equal(save.arena?.id, claimed.run.id);

  const restored = deserializeSaveFile(
    serializeSaveFile(monsters, { now: () => 0, inventory: claimed.inventory, arena: claimed.run }),
  );
  assert.equal(restored.ok, true);
  if (!restored.ok) return;

  assert.equal(restored.value.arena?.wins, claimed.run.wins);
  assert.equal(restored.value.arena?.phase, claimed.run.phase);
  assert.deepEqual(
    restored.value.inventory.stacks.map((s) => [s.part.id, s.count]),
    claimed.inventory.stacks.map((s) => [s.part.id, s.count]),
  );
});

test('a save with no arena and no parts still loads', () => {
  const monsters = createStarterMonsters(testContext(131));
  const restored = deserializeSaveFile(serializeSaveFile(monsters, { now: () => 0 }));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.value.arena, null);
  assert.deepEqual(restored.value.inventory.stacks, []);
});

test('a corrupt inventory entry is dropped, not fatal', () => {
  const monsters = createStarterMonsters(testContext(137));
  const payload = JSON.parse(serializeSaveFile(monsters, { now: () => 0 })) as Record<string, unknown>;
  payload.inventory = {
    stacks: [
      { part: { id: 'x', name: 'ok', locus: 'tail', value: 'spiked' }, count: 2 },
      { part: { id: 'y', name: 'bad', locus: 'notALocus', value: 'spiked' }, count: 1 },
      { part: { id: 'z', name: 'zero', locus: 'tail', value: 'long' }, count: 0 },
      'rubbish',
    ],
    completedRequests: ['a', 7],
  };
  payload.arena = { id: 'broken' };

  const restored = deserializeSaveFile(JSON.stringify(payload));
  assert.equal(restored.ok, true, 'one bad stack must not cost the collection');
  if (!restored.ok) return;
  assert.equal(restored.value.inventory.stacks.length, 1);
  assert.deepEqual(restored.value.inventory.completedRequests, ['a']);
  assert.equal(restored.value.arena, null, 'an unusable run returns the player to the entrance');
});

test('the fights get harder, rather than merely differing', () => {
  const monster = player(149);
  const context = testContext(149);
  // Averaged over several runs: one run can wander, the curve should not.
  const totals: number[] = [];
  for (let index = 0; index <= DEFAULT_ARENA_CONFIG.normalWins; index++) {
    let sum = 0;
    const runs = 8;
    for (let r = 0; r < runs; r++) {
      sum += statTotal(createArenaEnemy(`curve-${r}`, index, monster, context).enemy.stats);
    }
    totals.push(sum / runs);
  }

  for (let i = 1; i < totals.length; i++) {
    assert.ok(
      (totals[i] as number) > (totals[i - 1] as number),
      `fight ${i + 1} (${totals[i]?.toFixed(0)}) is not harder than fight ${i} (${totals[i - 1]?.toFixed(0)})`,
    );
  }
  assert.ok(
    (totals[0] as number) < statTotal(monster.stats),
    'the opening fight should be winnable',
  );
});
