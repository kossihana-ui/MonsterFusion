import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createSaveFile,
  danglingParentIds,
  deserializeMonster,
  deserializeSaveFile,
  indexById,
  migrateToCurrent,
  serializeMonster,
  serializeSaveFile,
  validateMonster,
} from '../src/core/storage.ts';
import { ancestorIds, createRootMonster, fuse } from '../src/core/fusion.ts';
import { SCHEMA_VERSION } from '../src/shared/types.ts';
import { fusionChain, testContext } from './helpers.ts';

test('a monster round-trips through JSON unchanged', () => {
  const context = testContext(1);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const child = fuse(a, b, context);

  const restored = deserializeMonster(serializeMonster(child));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.deepEqual(restored.value, child);
});

test('a save file carries a schema version', () => {
  const { chain } = fusionChain(3, 2);
  const save = createSaveFile(chain, { now: () => 123 });
  assert.equal(save.schemaVersion, SCHEMA_VERSION);
  assert.equal(save.savedAt, 123);
  assert.equal(save.monsters.length, chain.length);

  const restored = deserializeSaveFile(serializeSaveFile(chain, { now: () => 123 }));
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.value.monsters.length, chain.length);
  assert.deepEqual(restored.value.monsters, chain);
});

test('every persisted field required by the spec is present', () => {
  const { chain } = fusionChain(2, 3);
  const child = chain.at(-1);
  assert.ok(child);
  const parsed = JSON.parse(serializeMonster(child)) as Record<string, unknown>;

  for (const field of [
    'schemaVersion',
    'id',
    'genes',
    'stats',
    'parentAId',
    'parentBId',
    'generation',
    'createdAt',
    'fusionHistory',
  ]) {
    assert.ok(field in parsed, `missing persisted field: ${field}`);
  }
});

test('a save written by a newer schema is rejected rather than misread', () => {
  const { chain } = fusionChain(1, 4);
  const payload = JSON.parse(serializeSaveFile(chain)) as Record<string, unknown>;
  payload.schemaVersion = SCHEMA_VERSION + 5;
  const result = deserializeSaveFile(JSON.stringify(payload));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.errors[0] ?? '', /newer build/);
});

test('an older schema with no migration registered fails loudly', () => {
  assert.throws(() => migrateToCurrent({ schemaVersion: 0 }), /No migration from schema version 0/);
});

test('registered migrations are applied in order', () => {
  const migrations = {
    0: (data: Record<string, unknown>) => ({ ...data, addedAtV1: true }),
  };
  const migrated = migrateToCurrent({ schemaVersion: 0, id: 'x' }, migrations);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.addedAtV1, true);
});

test('malformed payloads are reported, not thrown', () => {
  assert.equal(deserializeMonster('not json').ok, false);
  assert.equal(deserializeMonster('[]').ok, false);

  const bad = validateMonster({ schemaVersion: SCHEMA_VERSION, id: '', name: 1 });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.ok(bad.errors.length > 0);
});

test('a monster listed as its own parent is rejected', () => {
  const { chain } = fusionChain(1, 5);
  const child = chain.at(-1);
  assert.ok(child);
  const payload = JSON.parse(serializeMonster(child)) as Record<string, unknown>;
  payload.parentAId = payload.id;
  const result = validateMonster(payload);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.some((e) => e.includes('own parent')));
});

test('a 120-generation collection serialises and reloads', () => {
  const { chain } = fusionChain(120, 6);
  const json = serializeSaveFile(chain, { now: () => 0 });
  const restored = deserializeSaveFile(json);
  assert.equal(restored.ok, true);
  if (!restored.ok) return;
  assert.equal(restored.value.monsters.length, 121);

  // Per-monster payload size must not grow with generation.
  const sizes = chain.map((m) => serializeMonster(m).length);
  const firstFused = sizes[1] ?? 0;
  const last = sizes.at(-1) ?? 0;
  assert.ok(last < firstFused * 3, `monster payload grew from ${firstFused} to ${last}`);
});

test('ancestry can be walked by id and tolerates missing ancestors', () => {
  const { chain } = fusionChain(10, 7);
  const index = indexById(chain);
  const deepest = chain.at(-1);
  assert.ok(deepest);

  const ancestors = ancestorIds(deepest, (id) => index.get(id));
  assert.ok(ancestors.length > 0);
  assert.ok(!ancestors.includes(deepest.id), 'a monster is never its own ancestor');

  // Partial collections are fine: the walk just stops where data is missing.
  const partial = indexById(chain.slice(-3));
  assert.doesNotThrow(() => ancestorIds(deepest, (id) => partial.get(id)));
  assert.ok(danglingParentIds(chain.slice(-3)).length > 0);
});

test('a cyclic save cannot hang the ancestry walk', () => {
  const context = testContext(8);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const child = fuse(a, b, context);
  // Hand-forge a cycle that could never be produced by fuse().
  const forged = { ...a, parentAId: child.id, parentBId: child.id };
  const index = new Map([
    [child.id, child],
    [a.id, forged],
    [b.id, b],
  ]);
  const walked = ancestorIds(child, (id) => index.get(id), 16);
  assert.ok(walked.length <= 16 * 4);
});
