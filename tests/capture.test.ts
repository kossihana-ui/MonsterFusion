import assert from 'node:assert/strict';
import { test } from 'node:test';

import { claimArenaReward, createArenaEnemy, startArena } from '../src/core/arena.ts';
import { DEFAULT_ARENA_CONFIG } from '../src/core/config.ts';
import type { ArenaRun } from '../src/core/arena.ts';
import { createDuelWithLoadouts, runBattle, createBasicPolicy } from '../src/core/battle.ts';
import {
  captureArenaMonster,
  claimArenaRewardInSession,
  giveSessionItem,
  previewCapture,
} from '../src/core/capture.ts';
import { createRootMonster } from '../src/core/fusion.ts';
import { DOKURO_GESO, itemCount } from '../src/core/items.ts';
import { defaultLoadout } from '../src/core/moves.ts';
import { createPartInventory } from '../src/core/parts.ts';
import { createSeededRandom } from '../src/core/random.ts';
import {
  createGameSession,
  deployMonsters,
  getConsumables,
  ownedMonster,
} from '../src/core/session.ts';
import type { GameSession } from '../src/core/session.ts';
import { deserializeSaveFile, restoreSession, serializeSaveFile } from '../src/core/storage.ts';
import { testContext } from './helpers.ts';

const BOSS_INDEX = DEFAULT_ARENA_CONFIG.normalWins;

function player(seed: number) {
  return createRootMonster(testContext(seed), { name: 'Hero' });
}

/** A run standing in front of the encounter at `index`, mid-fight. */
function runAt(index: number, seed: number): { run: ArenaRun; session: GameSession; context: ReturnType<typeof testContext> } {
  const context = testContext(seed);
  const me = player(seed);
  const opened = startArena(me, defaultLoadout(me), context, { id: `run-${seed}` });
  if (index === 0) {
    return { run: opened, session: createGameSession([me]), context };
  }
  const encounter = createArenaEnemy(opened.id, index, me, context);
  const run: ArenaRun = {
    ...opened,
    wins: index,
    encounter,
    battle: createDuelWithLoadouts(me, encounter.enemy, [
      { monsterId: me.id, skillIds: defaultLoadout(me).skillIds },
      { monsterId: encounter.enemy.id, skillIds: defaultLoadout(encounter.enemy).skillIds },
    ]),
  };
  return { run, session: createGameSession([me]), context };
}

function armed(session: GameSession, count = 1): GameSession {
  return giveSessionItem(session, DOKURO_GESO, count);
}

// ---------------------------------------------------------------------------
// Using it
// ---------------------------------------------------------------------------

test('an ordinary opponent can be taken home', () => {
  const { run, session, context } = runAt(0, 1);
  const held = armed(session);
  const enemy = run.encounter.enemy;

  const preview = previewCapture(held, run);
  assert.equal(preview.ok, true, preview.message);
  assert.equal(preview.target?.id, enemy.id);
  assert.equal(preview.held, 1);

  const result = captureArenaMonster(held, run, context, 'cap-1');
  assert.equal(result.ok, true, result.message);
  assert.ok(result.captured);
  assert.equal(result.captured.name, enemy.name);
  assert.equal(result.session.owned.length, 2, 'the player kept their own and gained one');
  assert.ok(ownedMonster(result.session, result.captured.id));
  assert.ok(
    result.session.history.map((m) => m.id).includes(result.captured.id),
    'and it is in the lineage',
  );
});

test('the boss can be taken home too, keeping what made it the boss', () => {
  const { run, session, context } = runAt(BOSS_INDEX, 2);
  assert.equal(run.encounter.isBoss, true);
  const boss = run.encounter.enemy;

  const result = captureArenaMonster(armed(session), run, context, 'cap-boss');
  assert.equal(result.ok, true, result.message);
  assert.ok(result.captured);
  assert.equal(result.captured.tier, boss.tier, 'a captured boss is still a boss-grade creature');
  assert.deepEqual(result.captured.stats, boss.stats);
  assert.deepEqual(result.captured.phenotype, boss.phenotype);
});

test('the monster that joins is the one that was fought, with a life of its own', () => {
  const { run, session, context } = runAt(0, 3);
  const enemy = run.encounter.enemy;
  const before = JSON.parse(JSON.stringify(enemy));

  const result = captureArenaMonster(armed(session), run, context, 'cap-3');
  assert.ok(result.captured);

  assert.deepEqual(result.captured.genes, enemy.genes, 'the same creature');
  assert.deepEqual(result.captured.phenotype, enemy.phenotype);
  assert.notEqual(result.captured.id, enemy.id, 'but not the same encounter slot');
  assert.equal(result.captured.parentAId, null, 'it was caught, not bred');
  assert.equal(result.captured.parentBId, null);
  assert.equal(result.captured.generation, 0);
  assert.deepEqual(result.captured.fusionHistory, []);

  // The run it came from must not have been edited underneath the caller.
  assert.deepEqual(JSON.parse(JSON.stringify(run.encounter.enemy)), before);
});

test('capture ends the run rather than winning it', () => {
  const { run, session, context } = runAt(0, 4);
  const result = captureArenaMonster(armed(session), run, context, 'cap-4');
  assert.equal(result.ok, true, result.message);
  assert.equal(result.run.phase, 'cleared', 'there is nothing left to fight');
  assert.equal(result.run.wins, run.wins, 'and nothing was won');
  assert.deepEqual(result.run.claimed, run.claimed, 'so there is no drop to claim');
});

test('one capture costs one item, and only on success', () => {
  const { run, session, context } = runAt(0, 5);
  const held = armed(session, 3);
  assert.equal(itemCount(held.items, DOKURO_GESO.id), 3);

  const result = captureArenaMonster(held, run, context, 'cap-5');
  assert.equal(result.ok, true, result.message);
  assert.equal(itemCount(result.session.items, DOKURO_GESO.id), 2);
  assert.equal(result.spent?.id, DOKURO_GESO.id);
});

test('the same request twice catches one monster', () => {
  const { run, session, context } = runAt(0, 6);
  const first = captureArenaMonster(armed(session, 2), run, context, 'twice');
  assert.equal(first.ok, true, first.message);

  const again = captureArenaMonster(first.session, run, context, 'twice');
  assert.equal(again.ok, false);
  assert.equal(again.duplicate, true);
  assert.equal(again.captured, null);
  assert.equal(again.session.owned.length, first.session.owned.length);
  assert.equal(
    itemCount(again.session.items, DOKURO_GESO.id),
    itemCount(first.session.items, DOKURO_GESO.id),
    'and spends one item, not two',
  );
});

// ---------------------------------------------------------------------------
// When it is refused
// ---------------------------------------------------------------------------

test('without the item there is nothing to use', () => {
  const { run, session, context } = runAt(0, 7);
  const preview = previewCapture(session, run);
  assert.equal(preview.ok, false);
  assert.equal(preview.refusal, 'noItem');

  const result = captureArenaMonster(session, run, context, 'cap-7');
  assert.equal(result.ok, false);
  assert.equal(result.session.owned.length, 1, 'and nothing joined');
});

test('a fight that is already over cannot be captured out of', () => {
  const { run, session, context } = runAt(0, 8);
  const rng = createSeededRandom(8);
  const finished: ArenaRun = {
    ...run,
    battle: runBattle(run.battle, createBasicPolicy(rng), rng),
  };
  assert.notEqual(finished.battle.outcome.status, 'ongoing');

  const held = armed(session);
  const result = captureArenaMonster(held, finished, context, 'cap-8');
  assert.equal(result.ok, false);
  assert.equal(result.refusal, 'battleOver');
  assert.equal(itemCount(result.session.items, DOKURO_GESO.id), 1, 'the item is still there');
});

test('a run that has moved past the fight is refused', () => {
  const { run, session, context } = runAt(0, 9);
  // A stale run the UI kept across a reward screen.
  const stale: ArenaRun = { ...run, phase: 'reward' };
  const result = captureArenaMonster(armed(session), stale, context, 'cap-9');
  assert.equal(result.ok, false);
  assert.equal(result.refusal, 'battleOver');
});

test('a finished adventure cannot catch anything', () => {
  const { run, session, context } = runAt(0, 10);
  const over = armed({ ...session, owned: [], status: 'gameOver' });
  assert.equal(itemCount(over.items, DOKURO_GESO.id), 1);

  const result = captureArenaMonster(over, run, context, 'cap-10');
  assert.equal(result.ok, false);
  assert.equal(result.refusal, 'gameOver');
  assert.equal(result.session.owned.length, 0);
  assert.equal(itemCount(result.session.items, DOKURO_GESO.id), 1, 'the item is not spent');
});

test('another item cannot be used to capture', () => {
  const { run, session } = runAt(0, 11);
  const preview = previewCapture(armed(session), run, 'part-tail-spiked');
  assert.equal(preview.ok, false);
  assert.equal(preview.refusal, 'unknownItem');
});

test('a captured monster frees the one that was standing in the ring', () => {
  const { run, session, context } = runAt(0, 12);
  const me = session.owned[0];
  assert.ok(me);
  const held = deployMonsters(armed(session), [me.id]);
  const result = captureArenaMonster(held, run, context, 'cap-12');
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.session.deployed, [], 'the run is over, so nobody is deployed');
});

// ---------------------------------------------------------------------------
// Where it comes from
// ---------------------------------------------------------------------------

/** A run parked on a claimable reward for the encounter at `index`. */
function claimableAt(index: number, seed: number, id: string): { run: ArenaRun; context: ReturnType<typeof testContext> } {
  const context = testContext(seed);
  const me = player(seed);
  const opened = startArena(me, defaultLoadout(me), context, { id });
  const encounter = createArenaEnemy(id, index, me, context);
  return {
    context,
    run: { ...opened, wins: index + 1, phase: 'reward', encounter, claimed: [] },
  };
}

test('the boss leaves a ドクロゲソ about one time in ten', () => {
  let drops = 0;
  const RUNS = 400;
  for (let i = 0; i < RUNS; i++) {
    const { run, context } = claimableAt(BOSS_INDEX, i, `drop-${i}`);
    const result = claimArenaReward(run, createPartInventory(), context);
    if (result.items.some((item) => item.id === DOKURO_GESO.id)) drops++;
  }
  const rate = drops / RUNS;
  assert.ok(
    rate > 0.05 && rate < 0.16,
    `${(rate * 100).toFixed(1)}% of bosses dropped one, which is not the stated 10%`,
  );
});

test('an ordinary opponent never leaves one', () => {
  for (let index = 0; index < BOSS_INDEX; index++) {
    for (let i = 0; i < 40; i++) {
      const { run, context } = claimableAt(index, i, `plain-${index}-${i}`);
      const result = claimArenaReward(run, createPartInventory(), context);
      assert.deepEqual(result.items, [], `fight ${index + 1} dropped a capture item`);
    }
  }
});

test('the same run always drops the same thing', () => {
  const first = claimableAt(BOSS_INDEX, 3, 'same-run');
  const second = claimableAt(BOSS_INDEX, 3, 'same-run');
  const a = claimArenaReward(first.run, createPartInventory(), first.context);
  const b = claimArenaReward(second.run, createPartInventory(), second.context);
  assert.deepEqual(a.items.map((i) => i.id), b.items.map((i) => i.id));
  assert.deepEqual(a.parts.map((p) => p.id), b.parts.map((p) => p.id));
});

test('claiming puts parts and items in their own inventories', () => {
  // Find a boss run that actually drops one, so this tests the putting-away.
  let found: { run: ArenaRun; context: ReturnType<typeof testContext> } | null = null;
  for (let i = 0; i < 200 && !found; i++) {
    const candidate = claimableAt(BOSS_INDEX, i, `claim-${i}`);
    const peek = claimArenaReward(candidate.run, createPartInventory(), candidate.context);
    if (peek.items.length > 0) found = candidate;
  }
  assert.ok(found, 'no boss in 200 dropped one, which cannot be right at 10%');

  const session = createGameSession([player(1)]);
  const claimed = claimArenaRewardInSession(session, found.run, found.context);
  assert.equal(itemCount(claimed.session.items, DOKURO_GESO.id), 1);
  assert.equal(
    claimed.session.inventory.stacks.length,
    claimed.result.parts.length,
    'and the parts went to the part inventory',
  );
  assert.deepEqual(getConsumables(claimed.session), [{
    id: DOKURO_GESO.id,
    name: DOKURO_GESO.name,
    description: DOKURO_GESO.description,
    count: 1,
  }]);
});

test('a reward claimed twice is not counted twice', () => {
  const session = createGameSession([player(1)]);

  // The boss: claiming it clears the run, so the second claim finds no
  // reward phase to claim from.
  const boss = claimableAt(BOSS_INDEX, 5, 'twice-claim');
  const first = claimArenaRewardInSession(session, boss.run, boss.context);
  const again = claimArenaRewardInSession(first.session, first.run, boss.context);
  assert.deepEqual(again.result.items, [], 'nothing fell a second time');
  assert.equal(
    itemCount(again.session.items, DOKURO_GESO.id),
    itemCount(first.session.items, DOKURO_GESO.id),
  );
  assert.deepEqual(again.session.inventory.stacks, first.session.inventory.stacks);

  // An ordinary fight stays on its reward screen, so the second claim is
  // the one the arena reports as a repeat.
  const plain = claimableAt(0, 5, 'twice-plain');
  const once = claimArenaRewardInSession(session, plain.run, plain.context);
  const twice = claimArenaRewardInSession(once.session, once.run, plain.context);
  assert.equal(twice.result.duplicate, true);
  assert.deepEqual(twice.session.inventory.stacks, once.session.inventory.stacks);
});

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

test('items survive a save and a reload', () => {
  const { run, session, context } = runAt(0, 20);
  const caught = captureArenaMonster(armed(session, 2), run, context, 'cap-20');
  assert.equal(caught.ok, true, caught.message);

  const json = serializeSaveFile([], { session: caught.session, now: () => 0 });
  const loaded = deserializeSaveFile(json);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const restored = restoreSession(loaded.value);
  assert.equal(itemCount(restored.items, DOKURO_GESO.id), 1, 'the spare is still there');
  assert.ok(
    restored.owned.some((m) => m.id === caught.captured?.id),
    'and the monster it caught is still owned',
  );
  assert.ok(
    restored.completedRequests.includes('cap-20'),
    'a capture already applied must not reapply after a reload',
  );
});

test('a save from before items existed loads with none', () => {
  const me = player(21);
  const json = serializeSaveFile([me], { now: () => 0 });
  const payload = JSON.parse(json) as Record<string, unknown>;
  delete payload.items;

  const loaded = deserializeSaveFile(JSON.stringify(payload));
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.items.stacks, []);
  assert.deepEqual(getConsumables(restoreSession(loaded.value)), []);
});

test('an item this build does not know is dropped, not carried', () => {
  const me = player(22);
  const json = serializeSaveFile([me], { now: () => 0 });
  const payload = JSON.parse(json) as Record<string, unknown>;
  payload.items = { stacks: [{ item: { id: 'from-a-later-build' }, count: 3 }] };

  const loaded = deserializeSaveFile(JSON.stringify(payload));
  assert.equal(loaded.ok, true, 'the rest of the save is still worth loading');
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.items.stacks, []);
});
