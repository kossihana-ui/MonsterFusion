/**
 * An account nobody has to sign up for.
 *
 * The save lives in one browser's localStorage, so changing device loses
 * everything. The fix needs an identity, and a name-and-password sign-up is
 * the wrong one: this is a game somebody tries once from a link, and a form
 * at the door is where most of them stop.
 *
 * So the browser makes its own. An id, a secret, nothing asked of the player.
 * The id is public - it is what a ranking row is keyed by - and the secret is
 * the only thing that proves the account is theirs. Together they print as a
 * code the player can carry to another device, which is what moving a save
 * actually means here.
 *
 * No server is assumed anywhere in this file. It produces the identity and
 * reads it back; where it is stored and whether anything syncs is somebody
 * else's problem, which is what keeps this testable.
 */
import type { Random } from './random.ts';

// ---------------------------------------------------------------------------
// Entropy
// ---------------------------------------------------------------------------

/**
 * Where the secret's bytes come from.
 *
 * Explicit, because the usual rule here - 「乱数は差し替え可能に」 - would
 * otherwise invite a seeded generator into the one place it must never go. A
 * seeded `Random` produces the same secret for everybody who shares the seed.
 * Tests use `entropyFromRandom`; everything else uses `createCryptoEntropy`.
 */
export type Entropy = (length: number) => Uint8Array;

/** The real one: the platform's cryptographic source. */
export function createCryptoEntropy(): Entropy {
  const source = globalThis.crypto;
  if (!source?.getRandomValues) {
    throw new Error('この環境には暗号用の乱数がありません。アカウントは作れません。');
  }
  return (length) => source.getRandomValues(new Uint8Array(length));
}

/**
 * A deterministic stand-in. **Tests only.**
 *
 * Named so that it reads as a mistake in production code, because it is one:
 * a secret anybody can reproduce is not a secret.
 */
export function entropyFromRandom(rng: Random): Entropy {
  return (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(rng.next() * 256) & 0xff;
    return bytes;
  };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export interface AnonymousAccount {
  /** Public. Keys a ranking row, and is safe to show or log. */
  readonly id: string;
  /** Private. Proves the account is this player's. Never log it. */
  readonly secret: string;
  readonly createdAt: number;
}

/**
 * An alphabet without the characters people mistype when copying by hand.
 *
 * No 0/O, no 1/I/L, no U (it is read as V in some faces). The code is meant
 * to survive being read off one screen and typed into another phone, which is
 * how a player actually moves a save.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Long enough that ids do not collide; short enough to read aloud. */
export const ID_LENGTH = 10;
/** 24 characters of this alphabet is about 117 bits. */
export const SECRET_LENGTH = 24;

function encode(bytes: Uint8Array, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    // Rejection-free and close enough to uniform at this alphabet size: the
    // bias is under half a percent per character, which matters for neither
    // the id's collisions nor the secret's strength.
    out += ALPHABET[(bytes[i] as number) % ALPHABET.length];
  }
  return out;
}

export function createAccount(
  entropy: Entropy,
  now: () => number = () => Date.now(),
): AnonymousAccount {
  const bytes = entropy(ID_LENGTH + SECRET_LENGTH);
  return {
    id: encode(bytes.subarray(0, ID_LENGTH), ID_LENGTH),
    secret: encode(bytes.subarray(ID_LENGTH), SECRET_LENGTH),
    createdAt: now(),
  };
}

// ---------------------------------------------------------------------------
// The transfer code
// ---------------------------------------------------------------------------

/**
 * The code a player carries to another device.
 *
 * Grouped in fours because that is how a human copies a long string without
 * losing their place, and prefixed so that a code pasted into the wrong box
 * can be told apart from a random string.
 */
export const CODE_PREFIX = 'MF1';

export function accountCode(account: AnonymousAccount): string {
  const body = `${account.id}${account.secret}`;
  const groups = body.match(/.{1,4}/g) ?? [];
  return `${CODE_PREFIX}-${groups.join('-')}`;
}

export type CodeResult =
  | { readonly ok: true; readonly id: string; readonly secret: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Reads a code back.
 *
 * Forgiving about what a person adds - case, spaces, the dashes, a leading
 * prefix - and unforgiving about characters the alphabet excludes. Those are
 * not guessable: somebody who typed O may have meant Q or D, and a wrong
 * guess hands back a different secret, which looks like a working code and
 * silently is not. Saying which character is wrong costs the player one
 * glance; guessing could cost them the save.
 */
export function parseAccountCode(code: string): CodeResult {
  const body = code.trim().toUpperCase().replace(/[\s-]+/g, '');
  const stripped = body.startsWith(CODE_PREFIX) ? body.slice(CODE_PREFIX.length) : body;
  if (stripped.length === 0) return { ok: false, reason: 'コードが空です。' };

  const bad = [...new Set([...stripped].filter((c) => !ALPHABET.includes(c)))];
  if (bad.length > 0) {
    return {
      ok: false,
      reason: `コードに使えない文字があります：${bad.join(' ')}（0 O 1 I L U は使っていません。見まちがいかもしれません）`,
    };
  }
  if (stripped.length !== ID_LENGTH + SECRET_LENGTH) {
    return {
      ok: false,
      reason: `コードの長さが合いません（${stripped.length}文字、${ID_LENGTH + SECRET_LENGTH}文字必要）。`,
    };
  }
  return {
    ok: true,
    id: stripped.slice(0, ID_LENGTH),
    secret: stripped.slice(ID_LENGTH),
  };
}

/** Whether a code describes this account. Compares in full, never partially. */
export function codeMatches(account: AnonymousAccount, code: string): boolean {
  const parsed = parseAccountCode(code);
  return parsed.ok && parsed.id === account.id && parsed.secret === account.secret;
}

/**
 * The id, shortened for showing on screen.
 *
 * A ranking row needs something a player recognises as themselves without
 * publishing the whole id, and ten characters of noise is not a name.
 */
export function shortAccountId(id: string): string {
  return id.slice(0, 4);
}
