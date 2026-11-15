/**
 * The account this browser holds, and which device it is.
 *
 * Core makes the account (`createAccount`) and decides what a transfer code
 * looks like; this file only keeps it. Kept apart from the save itself so
 * that clearing a run never clears the identity - losing every monster is
 * part of the game, losing the account is not.
 *
 * Every read survives storage being unavailable, which is the normal state in
 * a private window and the state a thumbnail capture sees.
 */
import {
  accountCode,
  createAccount,
  createCryptoEntropy,
  parseAccountCode,
  type AnonymousAccount,
} from "@core/core/index.ts";

const ACCOUNT_KEY = "monsterfusion.account.v1";
const DEVICE_KEY = "monsterfusion.device.v1";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function valid(value: unknown): value is AnonymousAccount {
  if (typeof value !== "object" || value === null) return false;
  const held = value as Record<string, unknown>;
  return typeof held.id === "string"
    && typeof held.secret === "string"
    && typeof held.createdAt === "number"
    // The id and secret have to read back as a code, or they are not an
    // account this build can use.
    && parseAccountCode(accountCode(held as unknown as AnonymousAccount)).ok;
}

/** The account in this browser, or null if there is not one yet. */
export function storedAccount(): AnonymousAccount | null {
  const raw = read(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The account, making one the first time.
 *
 * Returns null where no account can be made: a browser with no crypto, or
 * one that will not store it. Both are states the game must keep working in -
 * it just works the way it did before, in this browser only.
 */
export function ensureAccount(): AnonymousAccount | null {
  const held = storedAccount();
  if (held) return held;
  let made: AnonymousAccount;
  try {
    made = createAccount(createCryptoEntropy());
  } catch {
    return null;
  }
  // An account that cannot be stored is worse than none: it would sync a save
  // under an id nobody can ever use again.
  return write(ACCOUNT_KEY, JSON.stringify(made)) ? made : null;
}

/** Replaces this browser's account with one from a transfer code. */
export type AdoptResult =
  | { readonly ok: true; readonly account: AnonymousAccount }
  | { readonly ok: false; readonly reason: string };

export function adoptCode(code: string, now: () => number = Date.now): AdoptResult {
  const parsed = parseAccountCode(code);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const account: AnonymousAccount = {
    id: parsed.id,
    secret: parsed.secret,
    createdAt: now(),
  };
  if (!write(ACCOUNT_KEY, JSON.stringify(account))) {
    return { ok: false, reason: "このブラウザは保存を許していません。設定を見てください。" };
  }
  return { ok: true, account };
}

/**
 * Which device this is.
 *
 * Only ever shown back to the player, to tell two sides of a conflict apart
 * ("どちらを残しますか"). Not an identifier of anybody: it is random, it is
 * per-browser, and nothing is keyed by it.
 */
export function deviceId(): string {
  const held = read(DEVICE_KEY);
  if (held) return held;
  let made = `dev-${Math.floor(Date.now() / 1000).toString(36)}`;
  try {
    const bytes = createCryptoEntropy()(4);
    made = `dev-${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    // The time-based one above will do: this names a device to its owner.
  }
  write(DEVICE_KEY, made);
  return made;
}

/** The code to show the player. Never logged, never put in a URL. */
export function transferCode(account: AnonymousAccount): string {
  return accountCode(account);
}
