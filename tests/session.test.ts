import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createDuel, runBattle, createBasicPolicy } from '../src/core/battle.ts';
import { createRootMonster } from '../src/core/fusion.ts';
import { addPart, createPartInventory, countOf, partIdFor } from '../src/core/parts.ts';
import type { GenePart } from '../src/core/parts.ts';
import { createSeededRandom } from '../src/core/random.ts';
import {
  createGameSession,
  deployMonsters,
  fuseOwnedMonsters,
  isDeployed,
  isGameOver,
  ownedMonster,
  settleBattleLoss,
  soulMakeInSession,
} from '../src/core/session.ts';
import type { GameSession } from '../src/core/session.ts';
import {
  createSaveFile,
  deserializeSaveFile,
  restoreSession,
  serializeSaveFile,
} from '../src/core/storage.ts';
import type { BattleState, Monster } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

/** Two monsters different enough to be allowed to fuse. */
function pair(seed = 1): { context: ReturnType<typeof testContext>; a: Monster; b: Monster } {
  const context = testContext(seed);
  return { context, a: createRootMonster(context), b: createRootMonster(context) };
}

function part(locus: 'bodyShape' | 'eyes' | 'tail', value: string): GenePart {
  return {
    id: partIdFor(locus, value),
    name: `${locus}:${value}`,
    locus,
    value,
    fromMonsterName: 'どこかの個体',
  };
}

const BODY = part('bodyShape', 'serpentine');
const EYES = part('eyes', 'glowing');

function withParts(session: GameSession, ...parts: readonly GenePart[]): GameSession {
  let inventory = session.inventory;
  for (const entry of parts) inventory = addPart(inventory, entry, 1);
  return { ...session, inventory };
}

/** Runs a duel to the end so there is a real result to settle. */
function foughtToTheEnd(a: Monster, b: Monster, seed = 3): BattleState {
  const rng = createSeededRandom(seed);
  return runBattle(createDuel(a, b), createBasicPolicy(rng), rng);
}

// ---------------------------------------------------------------------------
// Starting
// ---------------------------------------------------------------------------

test('a run starts with what it was given, and knows it is playing', () => {
  const { a, b } = pair(1);
  const session = createGameSession([a, b]);

  assert.equal(session.owned.length, 2);
  assert.equal(session.status, 'playing');
  assert.equal(isGameOver(session), false);
  assert.deepEqual(
    session.history.map((monster) => monster.id).sort(),
    [a.id, b.id].sort(),
    'owned monsters are part of the history from the start',
  );
  assert.ok(ownedMonster(session, a.id));
});

test('a run with nothing in it is already over', () => {
  // Nothing but a monster makes a monster, so an empty run has no way out.
  const session = createGameSession([]);
  assert.equal(session.status, 'gameOver');
  assert.equal(isGameOver(session), true);
});

// ---------------------------------------------------------------------------
// Fusion consumes both parents
// ---------------------------------------------------------------------------

test('fusing spends both parents and keeps the child', () => {
  const { context, a, b } = pair(2);
  const before = createGameSession([a, b]);

  const { session, result } = fuseOwnedMonsters(before, a.id, b.id, context, 'fuse-1');
  assert.equal(result.ok, true, result.message);
  assert.ok(result.child);

  assert.deepEqual(session.owned.map((m) => m.id), [result.child.id], 'one monster, the child');
  assert.equal(ownedMonster(session, a.id), undefined, 'the parent is gone');
  assert.equal(ownedMonster(session, b.id), undefined);
  assert.equal(session.status, 'playing');

  // And the parents are still nameable, which is what a lineage needs.
  const history = session.history.map((m) => m.id);
  assert.ok(history.includes(a.id) && history.includes(b.id));
  assert.ok(history.includes(result.child.id));

  // The session handed in is untouched.
  assert.equal(before.owned.length, 2);
});

test('a child can be named by whoever made it', () => {
  const { context, a, b } = pair(26);
  const named = fuseOwnedMonsters(createGameSession([a, b]), a.id, b.id, context, 'named', undefined, 'ココノエ');
  assert.equal(named.result.ok, true, named.result.message);
  assert.equal(named.result.child?.name, 'ココノエ');
  assert.equal(named.session.owned[0]?.name, 'ココノエ', 'and that is the name it is kept under');
});

test('a child with no name given still gets one', () => {
  const { context, a, b } = pair(27);
  for (const name of [undefined, '']) {
    const made = fuseOwnedMonsters(
      createGameSession([a, b]), a.id, b.id, context, `unnamed-${String(name)}`, undefined, name,
    );
    assert.equal(made.result.ok, true, made.result.message);
    assert.ok(made.result.child?.name, `a child was left nameless for ${JSON.stringify(name)}`);
  }
});

test('a consumed parent cannot be fused again', () => {
  const { context, a, b } = pair(3);
  const first = fuseOwnedMonsters(createGameSession([a, b]), a.id, b.id, context, 'f1');
  assert.equal(first.result.ok, true, first.result.message);

  const again = fuseOwnedMonsters(first.session, a.id, b.id, context, 'f2');
  assert.equal(again.result.ok, false);
  assert.equal(again.refusal, 'notOwned');
  assert.deepEqual(
    again.session.owned.map((m) => m.id),
    first.session.owned.map((m) => m.id),
    'the refusal changed nothing',
  );
});

test('the same fusion request twice produces one child', () => {
  const { context, a, b } = pair(4);
  const first = fuseOwnedMonsters(createGameSession([a, b]), a.id, b.id, context, 'same');
  assert.equal(first.result.ok, true, first.result.message);

  const retry = fuseOwnedMonsters(first.session, a.id, b.id, context, 'same');
  assert.equal(retry.result.ok, false);
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.refusal, 'duplicate');
  assert.equal(retry.session.owned.length, 1, 'still one monster');
});

test('a monster cannot fuse with itself', () => {
  const { context, a, b } = pair(5);
  const session = createGameSession([a, b]);
  const result = fuseOwnedMonsters(session, a.id, a.id, context, 'self');
  assert.equal(result.result.ok, false);
  assert.equal(result.refusal, 'sameMonster');
  assert.equal(result.session.owned.length, 2);
});

test('a monster in the ring cannot be fused away', () => {
  const { context, a, b } = pair(6);
  const session = deployMonsters(createGameSession([a, b]), [a.id]);
  assert.equal(isDeployed(session, a.id), true);
  assert.equal(isDeployed(session, b.id), false);

  const result = fuseOwnedMonsters(session, a.id, b.id, context, 'mid-fight');
  assert.equal(result.result.ok, false);
  assert.equal(result.refusal, 'deployed');
  assert.equal(result.session.owned.length, 2, 'nothing was consumed');
  assert.ok(result.result.message.includes(a.name), result.result.message);
});

test('a failed fusion leaves both parents and the part where they were', () => {
  const { context, a, b } = pair(7);
  // A monster saved by a different build cannot be fused with one from this
  // build. Whatever the reason a fusion is refused, it must cost nothing.
  const stranger = { ...b, id: 'stranger', schemaVersion: b.schemaVersion + 1 };
  const session = withParts(createGameSession([a, stranger]), BODY);

  const result = fuseOwnedMonsters(session, a.id, stranger.id, context, 'doomed', BODY.id);
  assert.equal(result.result.ok, false, 'these two should not have fused');
  assert.equal(result.session.owned.length, 2, 'both parents stayed');
  assert.equal(countOf(result.session.inventory, BODY.id), 1, 'the part stayed too');
  assert.deepEqual(result.result.spent, null);
});

test('a part named but not held refuses before anything is consumed', () => {
  const { context, a, b } = pair(8);
  const session = createGameSession([a, b]);
  const result = fuseOwnedMonsters(session, a.id, b.id, context, 'no-part', BODY.id);

  assert.equal(result.result.ok, false);
  assert.equal(result.refusal, 'partNotHeld');
  assert.equal(result.session.owned.length, 2);
});

test('a part spent on a fusion is spent once, and shows on the child', () => {
  const { context, a, b } = pair(9);
  const session = withParts(createGameSession([a, b]), BODY);

  const { session: after, result } = fuseOwnedMonsters(
    session, a.id, b.id, context, 'with-part', BODY.id,
  );
  assert.equal(result.ok, true, result.message);
  assert.ok(result.child);
  assert.equal(result.child.phenotype.bodyShape, BODY.value);
  assert.equal(countOf(after.inventory, BODY.id), 0);
  assert.equal(result.spent?.id, BODY.id);
});

// ---------------------------------------------------------------------------
// Losing
// ---------------------------------------------------------------------------

test('losing a fight costs the monster that fought', () => {
  const { a, b } = pair(10);
  const battle = foughtToTheEnd(a, b);
  assert.equal(battle.outcome.status, 'win', 'this fixture needs a decided fight');
  const winningSide = battle.outcome.status === 'win' ? battle.outcome.winningSide : -1;
  const loser = winningSide === 0 ? b : a;
  const winner = winningSide === 0 ? a : b;

  const { session, lost } = settleBattleLoss(createGameSession([a, b]), battle, 'battle-1');
  assert.deepEqual(lost.map((m) => m.id), [loser.id]);
  assert.deepEqual(session.owned.map((m) => m.id), [winner.id]);
  assert.ok(
    session.history.map((m) => m.id).includes(loser.id),
    'a lost monster keeps its name for the lineage',
  );
});

test('a defeat lands once, however many times the screen is opened', () => {
  const { a, b } = pair(11);
  const battle = foughtToTheEnd(a, b);
  const first = settleBattleLoss(createGameSession([a, b]), battle, 'battle-2');
  assert.equal(first.lost.length, 1);

  const again = settleBattleLoss(first.session, battle, 'battle-2');
  assert.equal(again.duplicate, true);
  assert.deepEqual(again.lost, []);
  assert.deepEqual(
    again.session.owned.map((m) => m.id),
    first.session.owned.map((m) => m.id),
  );
});

test('an undecided fight settles nothing, and does not mark itself settled', () => {
  const { a, b } = pair(12);
  const ongoing = createDuel(a, b);
  assert.equal(ongoing.outcome.status, 'ongoing');

  const session = createGameSession([a, b]);
  const early = settleBattleLoss(session, ongoing, 'battle-3');
  assert.deepEqual(early.lost, []);
  assert.equal(early.session.owned.length, 2);
  assert.deepEqual(early.session.settledBattles, [], 'nothing was recorded');

  // The same battle, now finished, must still cost what it costs.
  const finished = foughtToTheEnd(a, b);
  const settled = settleBattleLoss(early.session, finished, 'battle-3');
  assert.equal(settled.lost.length, 1, 'the real result was applied');
});

test('a draw costs nothing', () => {
  const { a, b } = pair(13);
  const battle = foughtToTheEnd(a, b);
  const drawn: BattleState = { ...battle, outcome: { status: 'draw' } };

  const { session, lost } = settleBattleLoss(createGameSession([a, b]), battle.outcome.status === 'draw' ? battle : drawn, 'battle-4');
  assert.deepEqual(lost, []);
  assert.equal(session.owned.length, 2);
  assert.ok(session.settledBattles.includes('battle-4'), 'but it is settled');
});

test('winning costs nothing', () => {
  const { a, b } = pair(14);
  const battle = foughtToTheEnd(a, b);
  const winningSide = battle.outcome.status === 'win' ? battle.outcome.winningSide : 0;
  const winner = winningSide === 0 ? a : b;

  // Only the winner is owned, so the defeat has nothing of the player's.
  const { session, lost } = settleBattleLoss(createGameSession([winner]), battle, 'battle-5');
  assert.deepEqual(lost, []);
  assert.equal(session.owned.length, 1);
  assert.equal(session.status, 'playing');
});

// ---------------------------------------------------------------------------
// Game over
// ---------------------------------------------------------------------------

test('losing the last monster ends the run', () => {
  const { a, b } = pair(15);
  const battle = foughtToTheEnd(a, b);
  const winningSide = battle.outcome.status === 'win' ? battle.outcome.winningSide : 0;
  const loser = winningSide === 0 ? b : a;

  const { session } = settleBattleLoss(createGameSession([loser]), battle, 'battle-6');
  assert.deepEqual(session.owned, []);
  assert.equal(session.status, 'gameOver');
  assert.equal(isGameOver(session), true);
});

test('parts cannot bring a finished run back', () => {
  const { a, b } = pair(16);
  const battle = foughtToTheEnd(a, b);
  const winningSide = battle.outcome.status === 'win' ? battle.outcome.winningSide : 0;
  const loser = winningSide === 0 ? b : a;

  const over = withParts(
    settleBattleLoss(createGameSession([loser]), battle, 'battle-7').session,
    BODY, EYES,
  );
  assert.equal(over.status, 'gameOver');
  assert.equal(countOf(over.inventory, BODY.id), 1, 'the parts are still there');

  const attempt = soulMakeInSession(
    over,
    { partIds: [BODY.id, EYES.id] },
    testContext(16),
    'revive',
  );
  assert.equal(attempt.result.ok, false);
  assert.equal(attempt.refusal, 'gameOver');
  assert.equal(attempt.session.status, 'gameOver');
  assert.equal(countOf(attempt.session.inventory, BODY.id), 1, 'and were not spent');
});

test('nothing at all works after a run is over', () => {
  const { context, a, b } = pair(17);
  const over = withParts({ ...createGameSession([a, b]), status: 'gameOver' }, BODY, EYES);

  const fused = fuseOwnedMonsters(over, a.id, b.id, context, 'after-1');
  assert.equal(fused.refusal, 'gameOver');
  assert.equal(fused.session.owned.length, 2, 'and consumed nothing');

  const built = soulMakeInSession(over, { partIds: [BODY.id, EYES.id] }, context, 'after-2');
  assert.equal(built.refusal, 'gameOver');

  const battle = foughtToTheEnd(a, b);
  const settled = settleBattleLoss(over, battle, 'after-3');
  assert.deepEqual(settled.lost, [], 'a finished run loses nothing further');
});

// ---------------------------------------------------------------------------
// Soul make in a run
// ---------------------------------------------------------------------------

test('soul make adds the monster to the run and spends the parts', () => {
  const { a } = pair(18);
  const session = withParts(createGameSession([a]), BODY, EYES);

  const { session: after, result } = soulMakeInSession(
    session, { partIds: [BODY.id, EYES.id] }, testContext(18), 'make-1',
  );
  assert.equal(result.ok, true, result.message);
  assert.ok(result.monster);
  assert.equal(after.owned.length, 2);
  assert.ok(ownedMonster(after, result.monster.id));
  assert.ok(after.history.map((m) => m.id).includes(result.monster.id));
  assert.equal(countOf(after.inventory, BODY.id), 0);
});

test('a repeated soul make request adds one monster', () => {
  const { a } = pair(19);
  const context = testContext(19);
  let session = withParts(createGameSession([a]), BODY, EYES);
  session = withParts(session, BODY, EYES); // two of each, so parts are not the limit

  const first = soulMakeInSession(session, { partIds: [BODY.id, EYES.id] }, context, 'twice');
  assert.equal(first.result.ok, true, first.result.message);
  const retry = soulMakeInSession(first.session, { partIds: [BODY.id, EYES.id] }, context, 'twice');

  assert.equal(retry.result.ok, false);
  assert.equal(retry.result.duplicate, true);
  assert.equal(retry.session.owned.length, first.session.owned.length);
  assert.equal(
    countOf(retry.session.inventory, BODY.id),
    countOf(first.session.inventory, BODY.id),
  );
});

test('a soul make the parts cannot cover changes nothing', () => {
  const { a } = pair(20);
  const session = withParts(createGameSession([a]), BODY);
  const { session: after, result } = soulMakeInSession(
    session, { partIds: [BODY.id, EYES.id] }, testContext(20), 'short',
  );
  assert.equal(result.ok, false);
  assert.equal(after.owned.length, 1);
  assert.equal(countOf(after.inventory, BODY.id), 1);
});

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

test('a run round-trips: what is owned, what is only remembered, and the status', () => {
  const { context, a, b } = pair(21);
  const fused = fuseOwnedMonsters(
    withParts(createGameSession([a, b]), BODY), a.id, b.id, context, 'save-fuse', BODY.id,
  );
  assert.equal(fused.result.ok, true, fused.result.message);
  const session = deployMonsters(fused.session, fused.session.owned.map((m) => m.id));

  const json = serializeSaveFile([], { session, now: () => 0 });
  const loaded = deserializeSaveFile(json);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const restored = restoreSession(loaded.value);
  assert.deepEqual(
    restored.owned.map((m) => m.id),
    session.owned.map((m) => m.id),
    'the same monsters are still playable',
  );
  assert.deepEqual(
    restored.history.map((m) => m.id).sort(),
    session.history.map((m) => m.id).sort(),
    'and the consumed parents are still remembered',
  );
  assert.equal(restored.status, 'playing');
  assert.deepEqual(restored.deployed, session.deployed);
  assert.equal(countOf(restored.inventory, BODY.id), 0, 'the spent part stayed spent');
  assert.ok(
    restored.completedRequests.includes('save-fuse'),
    'a request already applied must not reapply after a reload',
  );
});

test('a finished run comes back finished', () => {
  const { a, b } = pair(22);
  const battle = foughtToTheEnd(a, b);
  const winningSide = battle.outcome.status === 'win' ? battle.outcome.winningSide : 0;
  const loser = winningSide === 0 ? b : a;
  const over = settleBattleLoss(createGameSession([loser]), battle, 'b').session;
  assert.equal(over.status, 'gameOver');

  const json = serializeSaveFile([], { session: over, now: () => 0 });
  const loaded = deserializeSaveFile(json);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const restored = restoreSession(loaded.value);
  assert.equal(restored.status, 'gameOver');
  assert.deepEqual(restored.owned, []);
  assert.equal(restored.history.length, 1, 'the monster that was lost is still named');
});

test('a save from before runs existed loads as a run in progress', () => {
  const { a, b } = pair(23);
  // No session passed: exactly what an older save looks like.
  const json = serializeSaveFile([a, b], { now: () => 0 });
  const loaded = deserializeSaveFile(json);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  assert.equal(loaded.value.session, null);
  const restored = restoreSession(loaded.value);
  assert.equal(restored.status, 'playing');
  assert.deepEqual(restored.owned.map((m) => m.id).sort(), [a.id, b.id].sort());
});

test('a save claiming a run with nothing left is read as over', () => {
  const { a } = pair(24);
  const save = createSaveFile([a], {
    session: { ...createGameSession([a]), owned: [], status: 'playing' },
    now: () => 0,
  });
  const loaded = deserializeSaveFile(JSON.stringify(save));
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(restoreSession(loaded.value).status, 'gameOver');
});

test('the inventory is saved with the run without being passed twice', () => {
  const { a } = pair(25);
  const session = withParts(createGameSession([a]), BODY, EYES);
  const save = createSaveFile([], { session, now: () => 0 });
  assert.equal(countOf(save.inventory, BODY.id), 1);
  assert.equal(countOf(save.inventory, EYES.id), 1);
  assert.equal(save.inventory.stacks.length, 2);
});

test('an empty run never claims to be playing', () => {
  const empty = createGameSession([], { inventory: createPartInventory() });
  const save = createSaveFile([], { session: empty, now: () => 0 });
  assert.equal(save.session?.status, 'gameOver');
});

// ---------------------------------------------------------------------------
// The UI's contract
// ---------------------------------------------------------------------------

test('the whole run can be driven from the public entry point alone', async () => {
  // The UI imports nothing but index.ts, so anything it needs has to be
  // there. This test fails as an export list rather than as a type error.
  const api = await import('../src/core/index.ts');

  const context = testContext(99);
  const first = api.createRootMonster(context);
  const second = api.createRootMonster(context);

  let session = api.createGameSession([first, second]);
  assert.equal(api.isGameOver(session), false);

  // Fuse the two down to one.
  const fused = api.fuseOwnedMonsters(session, first.id, second.id, context, 'ui-1');
  assert.equal(fused.result.ok, true, fused.result.message);
  session = fused.session;
  assert.equal(session.owned.length, 1);

  // Collect the parts a soul make needs, then build one.
  const recipe = api.getSoulMakeRecipe();
  let inventory = session.inventory;
  const partIds: string[] = [];
  for (const locus of recipe.requiredLoci) {
    const made = api.partFromFeature(first, locus);
    assert.ok(made, `${locus} could not be taken off a monster`);
    inventory = api.addPart(inventory, made, 1);
    partIds.push(made.id);
  }
  session = { ...session, inventory };

  const preview = api.previewSoulMake({ partIds }, session.inventory);
  assert.equal(preview.ok, true, preview.message);

  const built = api.soulMakeInSession(session, { partIds }, context, 'ui-2');
  assert.equal(built.result.ok, true, built.result.message);
  session = built.session;
  assert.equal(session.owned.length, 2);

  // Save it, load it, and carry on from the same place.
  const json = api.serializeSaveFile([], { session, now: () => 0 });
  const loaded = api.deserializeSaveFile(json);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  const restored = api.restoreSession(loaded.value);
  assert.deepEqual(
    restored.owned.map((m) => m.id).sort(),
    session.owned.map((m) => m.id).sort(),
  );

  // And lose one of them for real.
  const [standing, other] = restored.owned;
  assert.ok(standing && other);
  const rng = api.createSeededRandom(5);
  const battle = api.runBattle(
    api.createDuel(standing, other), api.createBasicPolicy(rng), rng,
  );
  const settled = api.settleBattleLoss(
    api.deployMonsters(restored, [standing.id, other.id]), battle, 'ui-battle',
  );
  assert.equal(settled.lost.length, 1);
  assert.equal(settled.session.owned.length, 1);
  assert.equal(settled.session.history.length, restored.history.length);
});
