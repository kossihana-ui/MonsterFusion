import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  advanceArenaTurn,
  arenaRules,
  BOSS_TEMPLATE,
  claimArenaReward,
  createArenaEnemy,
  FINAL_BOSS_NAME,
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
import { defaultLoadout, getLearnableMoves, MOVE_CATALOGUE } from '../src/core/moves.ts';
import { computeStats, statTotal, withinCaps } from '../src/core/stats.ts';
import { expressGenes } from '../src/core/genetics.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { createGameConfig, DEFAULT_ARENA_CONFIG, DEFAULT_GAME_CONFIG } from '../src/core/config.ts';
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

test('the boss comes after five wins, and the ladder goes on past it', () => {
  const { context, run } = runWithCrushingPlayer(11);
  let current = run;
  const bossAppearances: number[] = [];

  for (let fight = 0; fight < DEFAULT_ARENA_CONFIG.normalWins + 2; fight++) {
    assert.equal(current.phase, 'battle', `fight ${fight} did not start`);
    if (current.encounter.isBoss) bossAppearances.push(fight);
    current = playOut(current, context);
    assert.equal(current.phase, 'reward', `fight ${fight} was not won`);
    current = claimArenaReward(current, createPartInventory(), context).run;
    current = nextArenaEncounter(current, context);
  }

  assert.deepEqual(bossAppearances, [DEFAULT_ARENA_CONFIG.normalWins], 'one boss, at the sixth');
  assert.equal(current.phase, 'battle', 'beating it is no longer the end');
  assert.equal(isArenaOver(current), false);
});

test('the dragon stands at the hundredth fight, and nowhere else', () => {
  const context = testContext(31);
  const me = player(31);
  const last = DEFAULT_ARENA_CONFIG.finalBossFight - 1;

  const dragon = createArenaEnemy('ladder', last, me, context);
  assert.equal(dragon.isFinalBoss, true);
  assert.equal(dragon.isBoss, true, 'it is a boss as well as the last one');
  assert.equal(dragon.enemy.name, FINAL_BOSS_NAME);
  assert.equal(dragon.enemy.phenotype.bodyColor, 'black', 'obsidian');
  assert.equal(dragon.enemy.phenotype.horns, 'spiral', 'curled');
  assert.equal(dragon.enemy.phenotype.crest, 'crystal', 'the soul core');
  assert.equal(dragon.enemy.tier, DEFAULT_ARENA_CONFIG.finalBossTier);

  for (const index of [0, 4, DEFAULT_ARENA_CONFIG.normalWins, 20, last - 1]) {
    const other = createArenaEnemy('ladder', index, me, context);
    assert.equal(other.isFinalBoss, false, `fight ${index + 1} brought the dragon out early`);
    assert.notEqual(other.enemy.name, FINAL_BOSS_NAME);
  }
});

test('the dragon leaves no parts behind', () => {
  const context = testContext(32);
  const me = player(32);
  const last = DEFAULT_ARENA_CONFIG.finalBossFight - 1;
  const opened = startArena(me, defaultLoadout(me), context, { id: 'no-parts' });

  for (let attempt = 0; attempt < 30; attempt++) {
    const encounter = createArenaEnemy(`no-parts-${attempt}`, last, me, context);
    const run = { ...opened, id: `no-parts-${attempt}`, wins: last + 1, phase: 'reward' as const, encounter, claimed: [] };
    const reward = claimArenaReward(run, createPartInventory(), context);
    assert.deepEqual(reward.parts, [], 'the dragon is not something you take pieces off');
  }

  // An ordinary fight on the same ladder still drops, so this is the dragon
  // and not a broken drop table.
  let dropped = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const encounter = createArenaEnemy(`plain-${attempt}`, 10, me, context);
    const run = { ...opened, id: `plain-${attempt}`, wins: 11, phase: 'reward' as const, encounter, claimed: [] };
    dropped += claimArenaReward(run, createPartInventory(), context).parts.length;
  }
  assert.ok(dropped > 0, 'ordinary fights stopped dropping too');
});

test('the ladder climbs the whole way without stepping backwards', () => {
  const context = testContext(33);
  const me = player(33);
  const last = DEFAULT_ARENA_CONFIG.finalBossFight - 1;
  const totals: number[] = [];
  for (const index of [0, 2, 4, 6, 10, 30, 60, last - 1, last]) {
    totals.push(statTotal(createArenaEnemy('climb', index, me, context).enemy.stats));
  }
  // The first boss is a spike, so compare the ordinary run after it onwards.
  const ordinary = totals.slice(3);
  for (let i = 1; i < ordinary.length; i++) {
    assert.ok(
      (ordinary[i] as number) >= (ordinary[i - 1] as number) * 0.9,
      `fight ${i} came out weaker than the one before: ${ordinary.join(' → ')}`,
    );
  }
  assert.ok(
    (totals.at(-1) as number) > (totals[0] as number),
    `the dragon is not stronger than the opening fight: ${totals.join(' → ')}`,
  );
});

test('the arena arms its own monsters from their bodies, like everyone else', () => {
  const context = testContext(5);
  const me = player(5);

  for (let index = 0; index <= DEFAULT_ARENA_CONFIG.normalWins; index++) {
    const encounter = createArenaEnemy('arming', index, me, context);
    const learnable = getLearnableMoves(encounter.enemy);

    assert.ok(
      !learnable.some((m) => m.skill.id === 'strike' || m.skill.id.startsWith('sig-')),
      `the fight ${index} enemy knows a shared move`,
    );
    for (const move of learnable) {
      assert.ok(move.source !== null, `${move.skill.id} came from nowhere`);
    }

    const set = defaultLoadout(encounter.enemy);
    assert.ok(set.skillIds.length <= 3, 'an enemy brought more than three moves');
    for (const id of set.skillIds) {
      assert.ok(
        learnable.some((m) => m.skill.id === id),
        `${id} was set on an enemy that cannot learn it`,
      );
    }
  }
});

test('the boss is armed by its silhouette, not by being the boss', () => {
  const context = testContext(9);
  const me = player(9);
  const boss = createArenaEnemy('boss-arming', DEFAULT_ARENA_CONFIG.normalWins, me, context);
  assert.equal(boss.isBoss, true);

  const learnable = getLearnableMoves(boss.enemy);
  assert.ok(learnable.length > 0, 'the boss should have learnt something from its body');
  for (const move of learnable) {
    assert.ok(move.source !== null, `${move.skill.id} came from nowhere`);
    // Its silhouette is fixed, so what it knows must come from that silhouette.
    assert.equal(
      (boss.enemy.phenotype as unknown as Record<string, unknown>)[move.source],
      (MOVE_CATALOGUE.find((m) => m.id === move.skill.id) as { value: string }).value,
    );
  }
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

// ---------------------------------------------------------------------------
// はじめての挑戦: the practice ladder
// ---------------------------------------------------------------------------

test('a practice opponent is weaker than the same fight on the real ladder', () => {
  const me = player(5);
  const context = testContext(5);
  for (const index of [0, 2, DEFAULT_ARENA_CONFIG.normalWins]) {
    const real = statTotal(createArenaEnemy('same-run', index, me, context).enemy.stats);
    const easy = statTotal(createArenaEnemy('same-run', index, me, context, true).enemy.stats);
    assert.ok(
      easy < real,
      `fight ${index}: practice ${easy} should be under the ordinary ${real}`,
    );
  }
});

test('practice scales with the config rather than a number in the code', () => {
  const me = player(6);
  const config = {
    ...DEFAULT_GAME_CONFIG,
    arena: { ...DEFAULT_ARENA_CONFIG, practiceStrength: 1 },
  };
  const context = { ...testContext(6), config };
  const real = statTotal(createArenaEnemy('dial', 1, me, context).enemy.stats);
  const easy = statTotal(createArenaEnemy('dial', 1, me, context, true).enemy.stats);
  assert.equal(easy, real, 'at 1 the practice ladder is the ordinary ladder');
});

test('a practice run carries its flag to every later fight', () => {
  const run = startArena(player(7), undefined, testContext(7), { id: 'p1', practice: true });
  assert.equal(run.practice, true);
  const won = claimArenaReward(
    { ...run, wins: 1, phase: 'reward' },
    createPartInventory(),
    testContext(7),
  );
  const next = nextArenaEncounter(won.run, testContext(7));
  const me = run.player;
  assert.equal(
    statTotal(next.encounter.enemy.stats),
    statTotal(createArenaEnemy('p1', 1, me, testContext(7), true).enemy.stats),
    'the second practice fight is still a practice fight',
  );
});

test('practice hands out nothing, however the fight went', () => {
  const run = startArena(player(8), undefined, testContext(8), { id: 'p2', practice: true });
  // The boss fight, which is the only one that can drop a ドクロゲソ.
  const atBoss = {
    ...run,
    wins: DEFAULT_ARENA_CONFIG.normalWins + 1,
    phase: 'reward' as const,
    encounter: createArenaEnemy('p2', DEFAULT_ARENA_CONFIG.normalWins, run.player, testContext(8), true),
  };
  const result = claimArenaReward(atBoss, createPartInventory(), testContext(8));
  assert.deepEqual(result.parts, [], 'no parts');
  assert.deepEqual(result.items, [], 'no ドクロゲソ');
  assert.equal(result.empty, true);
  assert.equal(result.inventory.stacks.length, 0, 'the inventory is untouched');
  assert.ok(result.run.claimed.includes(atBoss.encounter.index), 'still claimed, so it cannot be re-rolled');
});

test('an ordinary run is untouched by any of this', () => {
  const me = player(9);
  const run = startArena(me, undefined, testContext(9), { id: 'ordinary' });
  assert.notEqual(run.practice, true);
  assert.equal(
    statTotal(run.encounter.enemy.stats),
    statTotal(createArenaEnemy('ordinary', 0, me, testContext(9)).enemy.stats),
  );
});
