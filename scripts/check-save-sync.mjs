// Carrying a save to a second device, every way it can go.
//
// The parts that must never go wrong: a divergence is never settled silently,
// a refused secret writes nothing, an unreachable server writes nothing, and
// whichever side the player keeps, no monster disappears from the record.
//
// The Supabase transport is exercised against a stand-in for the two Postgres
// functions, so the staleness rule and the three answers are checked without
// a project and without a network.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const core = await server.ssrLoadModule('@core/core/index.ts');
  const { syncOnce, settleDivergence } = await server.ssrLoadModule('/src/shared/saveSync.ts');
  const { createSupabaseTransport, supabaseKeys, validateKeys } = await server.ssrLoadModule('/src/shared/supabaseSave.ts');

  const config = core.DEFAULT_GAME_CONFIG;
  const ctx = (seed, id) => ({
    rng: core.createSeededRandom(seed), config, now: () => 0,
    ...(id ? { nextId: () => id } : {}),
  });
  const starters = core.createStarterMonsters(ctx(1));
  const account = core.createAccount(core.entropyFromRandom(core.createSeededRandom(5)), () => 0);

  const saveOf = (monsters, at, ownedIds) => {
    const file = core.createSaveFile(monsters, { now: () => at });
    return ownedIds
      ? { ...file, session: { ownedIds, deployedIds: [], status: 'playing', settledBattles: [], completedRequests: [] } }
      : file;
  };

  const input = (transport, local, save, deviceId = 'phone') => ({
    transport, local, save, deviceId,
    accountId: account.id, secret: account.secret,
  });

  // --- a first device, with nothing stored anywhere ------------------------
  {
    const transport = core.createMemoryTransport();
    const out = await syncOnce(input(transport, null, saveOf(starters, 1000)));
    assert.equal(out.kind, 'pushed', JSON.stringify(out));
    assert.equal(out.envelope.revision, 1);
    assert.equal(transport.stored().accountId, account.id);
  }

  // --- a second device that has never played ------------------------------
  {
    const first = core.createEnvelope(account.id, 'phone', saveOf(starters, 1000));
    const transport = core.createMemoryTransport({ envelope: first, secret: account.secret });
    const out = await syncOnce(input(transport, null, saveOf(starters, 2000), 'laptop'));
    assert.equal(out.kind, 'pulled', JSON.stringify(out));
    assert.equal(out.envelope.deviceId, 'phone', 'it takes what the other device left');
  }

  // --- already in step -----------------------------------------------------
  {
    const held = core.createEnvelope(account.id, 'phone', saveOf(starters, 1000));
    const transport = core.createMemoryTransport({ envelope: held, secret: account.secret });
    const out = await syncOnce(input(transport, held, held.save));
    assert.equal(out.kind, 'same', JSON.stringify(out));
  }

  // --- the case this whole design exists for ------------------------------
  const [moss, ignis, aqua] = starters;
  const phoneChild = core.fuse(moss, ignis, ctx(2, 'child-phone'));
  const laptopChild = core.fuse(ignis, aqua, ctx(3, 'child-laptop'));
  const shared = core.createEnvelope(account.id, 'phone', saveOf(starters, 1000));
  const onPhone = core.createEnvelope(
    account.id, 'phone', saveOf([...starters, phoneChild], 2000, [phoneChild.id]), shared,
  );
  const onLaptop = core.createEnvelope(
    account.id, 'laptop', saveOf([...starters, laptopChild], 2500, [laptopChild.id]), shared,
  );
  {
    const transport = core.createMemoryTransport({ envelope: onLaptop, secret: account.secret });
    const out = await syncOnce(input(transport, onPhone, onPhone.save));
    assert.equal(out.kind, 'diverged', JSON.stringify(out));
    assert.equal(out.local.deviceId, 'phone');
    assert.equal(out.remote.deviceId, 'laptop');
    assert.equal(out.local.owned, 1);
    assert.equal(out.local.lineage, 4);
    assert.deepEqual(transport.stored(), onLaptop, 'a divergence writes nothing');

    // The player keeps this device. The other one's monster is still recorded.
    const settled = await settleDivergence(
      input(transport, onPhone, onPhone.save), out.envelopes, 'local',
    );
    assert.equal(settled.kind, 'pushed', JSON.stringify(settled));
    const ids = settled.envelope.save.monsters.map((m) => m.id);
    assert.ok(ids.includes(phoneChild.id), 'the kept side is kept');
    assert.ok(ids.includes(laptopChild.id), 'and the other side is not erased from the record');
    assert.deepEqual(settled.envelope.save.session.ownedIds, [phoneChild.id]);
    assert.ok(
      settled.envelope.revision > onLaptop.revision,
      'the settlement lands on top, so the other device picks it up',
    );
  }

  // --- the wrong secret ---------------------------------------------------
  {
    const transport = core.createMemoryTransport({ envelope: shared, secret: 'SOMEBODY-ELSE' });
    const mine = core.createEnvelope(account.id, 'phone', saveOf(starters, 9000), shared);
    const out = await syncOnce(input(transport, mine, mine.save));
    assert.equal(out.kind, 'failed', JSON.stringify(out));
    assert.deepEqual(transport.stored(), shared, 'nothing was written');
  }

  // --- the far side cannot be reached -------------------------------------
  {
    const transport = {
      pull: () => Promise.reject(new Error('ネットワーク')),
      push: () => { throw new Error('should never be reached'); },
    };
    const out = await syncOnce(input(transport, null, saveOf(starters, 1000)));
    assert.equal(out.kind, 'failed', JSON.stringify(out));
    assert.ok(out.message.includes('読めません'), out.message);
  }

  // --- somebody else's account -------------------------------------------
  {
    const theirs = core.createEnvelope('ZZZZZZZZZZ', 'phone', saveOf(starters, 1000));
    const transport = { pull: () => Promise.resolve(theirs), push: () => { throw new Error('no'); } };
    const out = await syncOnce(input(transport, shared, shared.save));
    assert.equal(out.kind, 'failed', JSON.stringify(out));
    assert.ok(out.message.includes('別のアカウント'), out.message);
  }

  // --- no keys, no sync, and no crash ------------------------------------
  assert.equal(supabaseKeys(), null, 'this build has no project configured yet');
  assert.equal(createSupabaseTransport(null, { secret: 'x' }), null);
  for (const [url, key, why] of [
    ['', 'k', '空のURL'],
    ['https://p.supabase.co', '', '空の鍵'],
    ['http://p.supabase.co', 'k', 'httpは拒む（合言葉が本文に乗る）'],
    ['not a url', 'k', 'URLでない'],
    [undefined, 'k', '未設定'],
    ['https://p.supabase.co', undefined, '鍵が未設定'],
  ]) {
    assert.equal(validateKeys(url, key), null, why);
  }
  assert.deepEqual(
    validateKeys('https://p.supabase.co/', 'anon'),
    { url: 'https://p.supabase.co', anonKey: 'anon' },
    '末尾のスラッシュは落とす',
  );

  // --- the Supabase transport, against a stand-in for the two functions ---
  {
    const stored = { held: null, secretHash: null };
    const fakeFetch = async (url, init) => {
      const body = JSON.parse(init.body);
      const name = String(url).split('/rpc/')[1];
      if (name === 'save_pull') {
        const ok = stored.held && stored.secretHash === body.p_secret;
        return new Response(JSON.stringify(ok ? [stored.held] : []), { status: 200 });
      }
      if (stored.held && stored.secretHash !== body.p_secret) {
        return new Response(JSON.stringify({ status: 'rejected', message: 'secret' }), { status: 200 });
      }
      if ((stored.held?.revision ?? 0) !== body.p_based_on) {
        return new Response(JSON.stringify({ status: 'stale', ...stored.held }), { status: 200 });
      }
      stored.held = {
        revision: body.p_revision, based_on: body.p_based_on,
        device_id: body.p_device_id, saved_at: body.p_saved_at, payload: body.p_payload,
      };
      stored.secretHash = body.p_secret;
      return new Response(JSON.stringify({ status: 'ok', revision: body.p_revision }), { status: 200 });
    };
    const keys = { url: 'https://project.supabase.co', anonKey: 'anon' };
    const transport = createSupabaseTransport(keys, { secret: account.secret, fetch: fakeFetch });
    assert.ok(transport, 'keys given, so a transport is built');

    assert.equal(await transport.pull(account.id), null);
    const first = core.createEnvelope(account.id, 'phone', saveOf(starters, 1000));
    assert.equal((await transport.push(first, account.secret)).ok, true);
    const back = await transport.pull(account.id);
    assert.equal(back.revision, 1);
    assert.equal(back.deviceId, 'phone');
    assert.equal(back.save.monsters.length, starters.length, 'the save came back whole');

    // A device that writes without pulling is told it is stale, and is handed
    // what is stored so the divergence can be settled.
    const blind = core.createEnvelope(account.id, 'laptop', saveOf(starters, 5000));
    const stale = await transport.push(blind, account.secret);
    assert.equal(stale.ok, false);
    assert.equal(stale.reason, 'stale');
    assert.equal(stale.stored.revision, 1);

    const thief = createSupabaseTransport(keys, { secret: 'WRONG', fetch: fakeFetch });
    const refused = await thief.push(
      core.createEnvelope(account.id, 'thief', saveOf(starters, 6000), back), 'WRONG',
    );
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, 'rejected');
    assert.equal(await thief.pull(account.id), null, 'and it cannot read it either');

    // An unreachable project is "offline", not "rejected": nothing is wrong
    // with the account, so the game must not tell the player anything is.
    const broken = createSupabaseTransport(keys, {
      secret: account.secret,
      fetch: async () => new Response('nope', { status: 500 }),
    });
    const offline = await broken.push(first, account.secret);
    assert.equal(offline.ok, false);
    assert.equal(offline.reason, 'offline');
  }

  // --- the transfer code is the thing a player actually carries -----------
  {
    const code = core.accountCode(account);
    const parsed = core.parseAccountCode(code.toLowerCase().replace(/-/g, ' '));
    assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
    assert.equal(parsed.id, account.id);
    assert.equal(parsed.secret, account.secret);
  }

  // --- what actually travels ---------------------------------------------
  // The seed stream's position and the chosen ladder are not part of any
  // monster, but a save that lands on another device without them resumes a
  // different stream - which hands out ids that already exist - and a
  // different ladder.
  {
    const game = await server.ssrLoadModule('/src/mocks/game.ts');
    const file = game.currentSaveFile();
    assert.ok(file.client, 'the save carries the client extras');
    assert.equal(typeof file.client.rng, 'number', 'the seed stream position travels');
    assert.equal(typeof file.client.season, 'string', 'the ladder travels');
    assert.ok(file.monsters.length > 0, 'and the monsters, obviously');

    // It has to survive the trip: an envelope is JSON on the wire.
    const envelope = core.createEnvelope(account.id, 'phone', file);
    const landed = JSON.parse(JSON.stringify(envelope));
    assert.deepEqual(landed.save.client, file.client);

    // And come back in through the same door a reload uses.
    assert.equal(game.applySaveFile(landed.save), true, 'a save that arrived is restorable');
    const after = game.currentSaveFile();
    assert.equal(after.client.rng, file.client.rng, 'the stream resumes where it stopped');
    assert.equal(after.client.season, file.client.season);
    assert.equal(after.monsters.length, file.monsters.length);

    // A save with nothing in it is refused rather than wiping the game.
    assert.equal(game.applySaveFile({ ...file, monsters: [], session: null }), false);
    assert.ok(game.currentSaveFile().monsters.length > 0, 'and the game is untouched');
  }

  console.log('セーブ同期 OK');
} finally {
  await server.close();
}
