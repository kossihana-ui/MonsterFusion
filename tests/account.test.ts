import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  accountCode,
  CODE_PREFIX,
  codeMatches,
  createAccount,
  createCryptoEntropy,
  entropyFromRandom,
  ID_LENGTH,
  parseAccountCode,
  SECRET_LENGTH,
  shortAccountId,
} from '../src/core/account.ts';
import { createSeededRandom } from '../src/core/random.ts';

const fixed = () => entropyFromRandom(createSeededRandom(7));

test('an account is made without asking the player anything', () => {
  const account = createAccount(fixed(), () => 1000);
  assert.equal(account.id.length, ID_LENGTH);
  assert.equal(account.secret.length, SECRET_LENGTH);
  assert.equal(account.createdAt, 1000);
});

test('two accounts from real entropy do not collide', () => {
  const entropy = createCryptoEntropy();
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const account = createAccount(entropy);
    assert.ok(!seen.has(account.id), `id repeated after ${i}: ${account.id}`);
    seen.add(account.id);
  }
});

test('the id and the secret are not the same thing', () => {
  // A secret derivable from the public id would make the account everybody's.
  const entropy = createCryptoEntropy();
  for (let i = 0; i < 50; i++) {
    const account = createAccount(entropy);
    assert.notEqual(account.secret.slice(0, ID_LENGTH), account.id);
  }
});

test('the code the player carries reads back exactly', () => {
  const account = createAccount(fixed(), () => 0);
  const code = accountCode(account);
  assert.ok(code.startsWith(`${CODE_PREFIX}-`), code);

  const parsed = parseAccountCode(code);
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.reason);
  assert.equal(parsed.id, account.id);
  assert.equal(parsed.secret, account.secret);
  assert.ok(codeMatches(account, code));
});

test('a code survives being typed in by hand', () => {
  const account = createAccount(fixed(), () => 0);
  const code = accountCode(account);
  for (const typed of [
    code.toLowerCase(),
    code.replace(/-/g, ''),
    code.replace(/-/g, ' '),
    `  ${code}  `,
    code.slice(`${CODE_PREFIX}-`.length), // pasted without the prefix
  ]) {
    assert.ok(codeMatches(account, typed), `should still match: ${typed}`);
  }
});

test('a mistyped code is refused, never guessed at', () => {
  const account = createAccount(fixed(), () => 0);
  const code = accountCode(account);

  const short = parseAccountCode(code.slice(0, 12));
  assert.equal(short.ok, false);
  assert.ok(!short.ok && short.reason.includes('長さ'), short.ok ? '' : short.reason);

  // The excluded look-alikes. Guessing which character was meant could hand
  // back a different secret that looks like it worked.
  const confused = parseAccountCode(`${CODE_PREFIX}-OOOO-${'2'.repeat(30)}`);
  assert.equal(confused.ok, false);
  assert.ok(!confused.ok && confused.reason.includes('使えない文字'), confused.ok ? '' : confused.reason);

  assert.equal(parseAccountCode('').ok, false);
  assert.equal(parseAccountCode(CODE_PREFIX).ok, false);
  assert.ok(!codeMatches(account, accountCode(createAccount(entropyFromRandom(createSeededRandom(9))))));
});

test('the code alphabet has nothing anybody has to squint at', () => {
  const account = createAccount(createCryptoEntropy());
  const body = `${account.id}${account.secret}`;
  for (const character of '01ILOU') {
    assert.ok(!body.includes(character), `${character} should never appear`);
  }
});

test('the short id is short, and is the start of the real one', () => {
  const account = createAccount(fixed(), () => 0);
  assert.ok(shortAccountId(account.id).length < ID_LENGTH);
  assert.ok(account.id.startsWith(shortAccountId(account.id)));
});
