import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareEnvelopes,
  createEnvelope,
  createMemoryTransport,
  describeChoice,
  mergeLineage,
  resolveSave,
} from '../src/core/sync.ts';
import type { SyncEnvelope } from '../src/core/sync.ts';
import { createSaveFile } from '../src/core/storage.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { DEFAULT_GAME_CONFIG } from '../src/core/config.ts';
import { fuse } from '../src/core/fusion.ts';
import type { Monster } from '../src/shared/types.ts';

const context = (seed: number, id?: string) => ({
  rng: createSeededRandom(seed),
  config: DEFAULT_GAME_CONFIG,
  now: () => 0,
  ...(id ? { nextId: () => id } : {}),
});

const starters = createStarterMonsters(context(1));

function saveOf(monsters: readonly Monster[], at = 1000, ownedIds?: readonly string[]) {
  const file = createSaveFile(monsters, { now: () => at });
  if (!ownedIds) return file;
  return {
    ...file,
    session: {
      ownedIds,
      deployedIds: [],
      status: 'playing' as const,
      settledBattles: [],
      completedRequests: [],
    },
  };
}

test('a first save is one revision based on nothing', () => {
  const envelope = createEnvelope('ACCOUNT123', 'phone', saveOf(starters));
  assert.equal(envelope.revision, 1);
  assert.equal(envelope.basedOn, 0);
  assert.equal(envelope.accountId, 'ACCOUNT123');
  assert.equal(envelope.deviceId, 'phone');
});

test('a device that has pulled and written is ahead', () => {
  const first = createEnvelope('A', 'phone', saveOf(starters));
  const second = createEnvelope('A', 'laptop', saveOf(starters, 2000), first);
  assert.equal(second.revision, 2);
  assert.equal(second.basedOn, 1);
  assert.equal(compareEnvelopes(second, first), 'local-ahead');
  assert.equal(compareEnvelopes(first, second), 'remote-ahead');
});

test('two devices that both wrote from the same point have diverged', () => {
  // The case that must never be resolved silently: both played offline from
  // revision 1, and neither save contains the other's progress.
  const shared = createEnvelope('A', 'phone', saveOf(starters));
  const onPhone = createEnvelope('A', 'phone', saveOf(starters, 2000), shared);
  const onLaptop = createEnvelope('A', 'laptop', saveOf(starters, 2500), shared);
  assert.equal(compareEnvelopes(onPhone, onLaptop), 'diverged');
  assert.equal(compareEnvelopes(onLaptop, onPhone), 'diverged');
});

test('nothing on one side means take the other', () => {
  const only = createEnvelope('A', 'phone', saveOf(starters));
  assert.equal(compareEnvelopes(null, only), 'remote-ahead');
  assert.equal(compareEnvelopes(only, null), 'local-ahead');
  assert.equal(compareEnvelopes(null, null), 'same');
});

test('two accounts are never mixed', () => {
  const mine = createEnvelope('AAAA', 'phone', saveOf(starters));
  const theirs = createEnvelope('BBBB', 'phone', saveOf(starters));
  assert.equal(compareEnvelopes(mine, theirs), 'mismatch');
});

test('the lineage is the union, so no device loses a creature', () => {
  const [moss, ignis, aqua] = starters as [Monster, Monster, Monster];
  const onPhone = fuse(moss, ignis, context(2, 'child-phone'));
  const onLaptop = fuse(ignis, aqua, context(3, 'child-laptop'));

  const merged = mergeLineage([...starters, onPhone], [...starters, onLaptop]);
  const ids = merged.map((monster) => monster.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  for (const monster of [...starters, onPhone, onLaptop]) {
    assert.ok(ids.includes(monster.id), `${monster.name} should survive the merge`);
  }
});

test('choosing a side keeps its run, and still keeps both family trees', () => {
  const [moss, ignis, aqua] = starters as [Monster, Monster, Monster];
  const phoneChild = fuse(moss, ignis, context(2, 'child-phone'));
  const laptopChild = fuse(ignis, aqua, context(3, 'child-laptop'));

  const shared = createEnvelope('A', 'phone', saveOf(starters));
  const onPhone = createEnvelope(
    'A', 'phone',
    saveOf([...starters, phoneChild], 2000, [phoneChild.id]),
    shared,
  );
  const onLaptop = createEnvelope(
    'A', 'laptop',
    saveOf([...starters, laptopChild], 2500, [laptopChild.id, aqua.id]),
    shared,
  );

  const kept = resolveSave(onPhone, onLaptop);
  assert.deepEqual(kept.session?.ownedIds, [phoneChild.id], 'the chosen run decides who is owned');
  const ids = kept.monsters.map((monster) => monster.id);
  assert.ok(ids.includes(phoneChild.id));
  assert.ok(
    ids.includes(laptopChild.id),
    'the other device’s monster stays in the record even though it is not owned',
  );
});

test('a loadout for a monster that exists on only one side survives', () => {
  const [moss, ignis] = starters as [Monster, Monster];
  const child = fuse(moss, ignis, context(2, 'child'));
  const base = createSaveFile([...starters, child], { now: () => 0 });
  const withLoadout = {
    ...base,
    loadouts: [{ monsterId: child.id, skillIds: [] }],
  };
  const shared = createEnvelope('A', 'phone', base);
  const onPhone = createEnvelope('A', 'phone', base, shared);
  const onLaptop = createEnvelope('A', 'laptop', withLoadout, shared);

  const kept = resolveSave(onPhone, onLaptop);
  assert.ok(
    kept.loadouts.some((loadout) => loadout.monsterId === child.id),
    'the only chosen move set anybody made should not be dropped',
  );
});

test('the choice put to the player describes what each side holds', () => {
  const [moss, ignis] = starters as [Monster, Monster];
  const child = fuse(moss, ignis, context(2, 'child'));
  const envelope = createEnvelope(
    'A', 'phone',
    saveOf([...starters, child], 4000, [child.id]),
  );
  const choice = describeChoice(envelope);
  assert.equal(choice.deviceId, 'phone');
  assert.equal(choice.owned, 1, 'one monster is still playable');
  assert.equal(choice.lineage, 4, 'four have existed');
  assert.equal(choice.savedAt, 4000);
  assert.equal(choice.gameOver, false);
  assert.equal(choice.arenaWins, null);
});

test('the far side refuses a write that was not based on what it holds', async () => {
  const first = createEnvelope('A', 'phone', saveOf(starters));
  const transport = createMemoryTransport();
  assert.deepEqual(await transport.pull('A'), null);
  const pushed = await transport.push(first, 'SECRET');
  assert.equal(pushed.ok, true);
  assert.deepEqual(await transport.pull('A'), first);

  // A second device that never pulled writes from revision 0 again.
  const blind = createEnvelope('A', 'laptop', saveOf(starters, 9000));
  const stale = await transport.push(blind, 'SECRET');
  assert.equal(stale.ok, false);
  assert.ok(!stale.ok && stale.reason === 'stale');
  assert.deepEqual(transport.stored(), first, 'the stored save is untouched');

  // Having pulled, the same device can write.
  const held = await transport.pull('A');
  const proper = createEnvelope('A', 'laptop', saveOf(starters, 9000), held);
  assert.equal((await transport.push(proper, 'SECRET')).ok, true);
});

test('the far side refuses the wrong secret', async () => {
  const mine = createEnvelope('A', 'phone', saveOf(starters));
  const transport = createMemoryTransport({ envelope: mine, secret: 'MINE' });
  const theirs = createEnvelope('A', 'thief', saveOf(starters, 5000), mine);
  const result = await transport.push(theirs, 'GUESS');
  assert.equal(result.ok, false);
  assert.ok(!result.ok && result.reason === 'rejected');
  assert.deepEqual(transport.stored(), mine);
});

test('pulling somebody else’s account returns nothing', async () => {
  const mine = createEnvelope('AAAA', 'phone', saveOf(starters));
  const transport = createMemoryTransport({ envelope: mine, secret: 'MINE' });
  assert.deepEqual(await transport.pull('BBBB'), null);
});

test('a save round-trips through the envelope unchanged', () => {
  const save = saveOf(starters, 1234);
  const envelope: SyncEnvelope = createEnvelope('A', 'phone', save);
  const copy = JSON.parse(JSON.stringify(envelope)) as SyncEnvelope;
  assert.deepEqual(copy, envelope, 'the envelope has to be plain JSON to travel');
  assert.equal(copy.save.savedAt, 1234);
});
