/**
 * The steps of a sync, in one place.
 *
 * Pull, compare, then one of four things. The comparing is core's
 * (`compareEnvelopes`), the deciding is the player's whenever two devices
 * have genuinely diverged, and this file is only the order they happen in.
 *
 * Nothing here talks to a server or to localStorage: it is handed a transport
 * and the local envelope, which is what lets the whole flow - including the
 * divergence, the stale push and the refused secret - be checked in Node.
 */
import {
  compareEnvelopes,
  createEnvelope,
  describeChoice,
  resolveSave,
  type ConflictChoice,
  type MonsterSaveFile,
  type SaveTransport,
  type SyncEnvelope,
} from "@core/core/index.ts";

export type SyncOutcome =
  /** Both sides already agree. Nothing was written. */
  | { readonly kind: "same"; readonly envelope: SyncEnvelope | null }
  /** The local save was sent. */
  | { readonly kind: "pushed"; readonly envelope: SyncEnvelope }
  /** The far side's save is the newer one and should be loaded. */
  | { readonly kind: "pulled"; readonly envelope: SyncEnvelope }
  /**
   * Two devices moved from the same point. Nothing has been written, and
   * nothing will be until the player picks a side.
   */
  | {
      readonly kind: "diverged";
      readonly local: ConflictChoice;
      readonly remote: ConflictChoice;
      readonly envelopes: { readonly local: SyncEnvelope; readonly remote: SyncEnvelope };
    }
  /** Could not be done. The local save is untouched. */
  | { readonly kind: "failed"; readonly message: string };

export interface SyncInput {
  readonly transport: SaveTransport;
  readonly accountId: string;
  readonly secret: string;
  readonly deviceId: string;
  /** What this browser holds, or null if it has never synced. */
  readonly local: SyncEnvelope | null;
  /** The save as it is right now, for a first push. */
  readonly save: MonsterSaveFile;
}

/**
 * One round of syncing.
 *
 * Never writes the local save itself - it reports what should happen and the
 * caller does it, so a caller that is mid-battle can wait.
 */
export async function syncOnce(input: SyncInput): Promise<SyncOutcome> {
  let remote: SyncEnvelope | null;
  try {
    remote = await input.transport.pull(input.accountId);
  } catch (error) {
    return {
      kind: "failed",
      message: `向こう側を読めませんでした：${error instanceof Error ? error.message : "不明"}`,
    };
  }

  // Nothing local to compare with: a browser that has an account but has
  // never pushed. Its save still counts, so it is offered as the first one.
  const local = input.local
    ?? (remote ? null : createEnvelope(input.accountId, input.deviceId, input.save));

  const verdict = compareEnvelopes(local, remote);
  if (verdict === "mismatch") {
    return { kind: "failed", message: "別のアカウントのセーブでした。同期していません。" };
  }
  if (verdict === "same") return { kind: "same", envelope: remote ?? local };
  if (verdict === "remote-ahead") {
    if (!remote) return { kind: "same", envelope: local };
    return { kind: "pulled", envelope: remote };
  }
  if (verdict === "diverged") {
    if (!local || !remote) return { kind: "failed", message: "比べられませんでした。" };
    return {
      kind: "diverged",
      local: describeChoice(local),
      remote: describeChoice(remote),
      envelopes: { local, remote },
    };
  }

  // local-ahead: send it.
  const sending = local ?? createEnvelope(input.accountId, input.deviceId, input.save);
  return push(input, sending);
}

async function push(input: SyncInput, envelope: SyncEnvelope): Promise<SyncOutcome> {
  const result = await input.transport.push(envelope, input.secret);
  if (result.ok) return { kind: "pushed", envelope: result.stored };
  if (result.reason === "stale") {
    // Somebody wrote between the pull and the push. That is a divergence, and
    // it is put to the player rather than retried on top of their save.
    return {
      kind: "diverged",
      local: describeChoice(envelope),
      remote: describeChoice(result.stored),
      envelopes: { local: envelope, remote: result.stored },
    };
  }
  return { kind: "failed", message: result.message };
}

/**
 * Settles a divergence the player has decided.
 *
 * The chosen side decides the run; the other side's family tree is kept
 * either way (core's `resolveSave`). The result is written on top of what the
 * far side holds, so the losing device picks it up on its next pull rather
 * than diverging again.
 */
export async function settleDivergence(
  input: SyncInput,
  envelopes: { readonly local: SyncEnvelope; readonly remote: SyncEnvelope },
  keep: "local" | "remote",
): Promise<SyncOutcome> {
  const chosen = keep === "local" ? envelopes.local : envelopes.remote;
  const other = keep === "local" ? envelopes.remote : envelopes.local;
  const merged = resolveSave(chosen, other);
  const settled = createEnvelope(input.accountId, input.deviceId, merged, envelopes.remote);
  const result = await input.transport.push(settled, input.secret);
  if (result.ok) return { kind: "pushed", envelope: result.stored };
  if (result.reason === "stale") {
    return { kind: "failed", message: "決めている間にまた書き換わりました。もう一度お願いします。" };
  }
  return { kind: "failed", message: result.message };
}
