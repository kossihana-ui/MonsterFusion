/**
 * Carrying a save between devices.
 *
 * Two devices that have both been played are the whole problem. Most of a
 * save is not mergeable: whether the run is over, who is still owned, how
 * many parts are in the bag - these are single states, and summing or maxing
 * them invents progress nobody earned. Taking the newest timestamp silently
 * destroys the other side, and in a game where losing costs you the monster,
 * silently destroying a save is the worst thing this file could do.
 *
 * So the rule is narrow, and says so out loud:
 *
 * - The lineage is merged. `monsters` is append-only by design - a consumed
 *   parent stays in it because its descendants name it - so the union by id
 *   is always correct and never loses a creature that existed.
 * - Everything else is taken from one side, whole. Which side is decided by
 *   `revision`, a counter the writer increments; when both sides moved from
 *   the same revision, that is a real conflict and the player chooses. This
 *   file will not choose for them.
 *
 * No transport here and no storage: `SaveTransport` is an interface with a
 * memory implementation for tests. Whether the far side turns out to be a
 * server, a file or a clipboard is a decision this module does not contain.
 */
import type { Monster, MonsterId } from '../shared/types.ts';
import type { MoveLoadout } from './moves.ts';
import type { MonsterSaveFile } from './storage.ts';
import { normalizeMonster } from './storage.ts';

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

export interface SyncEnvelope {
  /** Whose save this is: the account's public id. */
  readonly accountId: string;
  /**
   * Which version of this account's save it is.
   *
   * Counted, not timed. Two devices can disagree about the clock - and a
   * phone that has been asleep disagrees badly - but a counter that only ever
   * goes up can be compared without trusting either of them.
   */
  readonly revision: number;
  /**
   * The revision this one was written from.
   *
   * What makes a conflict visible: two devices that both wrote revision 5
   * from revision 4 have diverged, and neither of them is the newer one.
   */
  readonly basedOn: number;
  /** Which device wrote it, so a divergence can be described to the player. */
  readonly deviceId: string;
  readonly savedAt: number;
  readonly save: MonsterSaveFile;
}

export function createEnvelope(
  accountId: string,
  deviceId: string,
  save: MonsterSaveFile,
  previous?: SyncEnvelope | null,
): SyncEnvelope {
  const basedOn = previous?.revision ?? 0;
  return {
    accountId,
    revision: basedOn + 1,
    basedOn,
    deviceId,
    savedAt: save.savedAt,
    save,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

export type SyncVerdict =
  /** Nothing to do. */
  | 'same'
  /** This device has the newer save; push it. */
  | 'local-ahead'
  /** The far side has the newer save; take it. */
  | 'remote-ahead'
  /** Both moved from the same point. Only the player can settle it. */
  | 'diverged'
  /** Different accounts. Never silently mixed. */
  | 'mismatch';

export function compareEnvelopes(
  local: SyncEnvelope | null,
  remote: SyncEnvelope | null,
): SyncVerdict {
  if (!local && !remote) return 'same';
  if (!local) return 'remote-ahead';
  if (!remote) return 'local-ahead';
  if (local.accountId !== remote.accountId) return 'mismatch';
  if (local.revision === remote.revision && local.deviceId === remote.deviceId) return 'same';
  // A straight line: one of them was written on top of the other.
  if (remote.revision <= local.basedOn) return 'local-ahead';
  if (local.revision <= remote.basedOn) return 'remote-ahead';
  if (local.basedOn === remote.basedOn) return 'diverged';
  return local.revision > remote.revision ? 'local-ahead' : 'remote-ahead';
}

// ---------------------------------------------------------------------------
// The one safe merge
// ---------------------------------------------------------------------------

/**
 * Every monster either side has ever held.
 *
 * Safe because the list is a record of what existed, not of what the player
 * controls. A monster in it may be dead, consumed or lost; `session.ownedIds`
 * is what says otherwise, and that is not merged here.
 */
export function mergeLineage(a: readonly Monster[], b: readonly Monster[]): Monster[] {
  const byId = new Map<MonsterId, Monster>();
  for (const monster of [...a, ...b]) {
    const existing = byId.get(monster.id);
    // The same monster from two devices should be identical; where it is not,
    // the one written against the newer schema is the one to keep.
    if (!existing || monster.schemaVersion > existing.schemaVersion) {
      byId.set(monster.id, normalizeMonster(monster));
    }
  }
  return [...byId.values()];
}

/** Loadouts for the monsters that survived the merge, the chosen side winning. */
function mergeLoadouts(
  chosen: readonly MoveLoadout[],
  other: readonly MoveLoadout[],
  monsters: readonly Monster[],
): MoveLoadout[] {
  const ids = new Set(monsters.map((monster) => monster.id));
  const byMonster = new Map<MonsterId, MoveLoadout>();
  for (const loadout of other) {
    if (ids.has(loadout.monsterId)) byMonster.set(loadout.monsterId, loadout);
  }
  for (const loadout of chosen) {
    if (ids.has(loadout.monsterId)) byMonster.set(loadout.monsterId, loadout);
  }
  return [...byMonster.values()];
}

/**
 * The save to keep, given which side the player chose.
 *
 * The chosen side decides everything that is a single state - the run, the
 * bag, the arena, whether it is over - and the lineage is the union, so
 * choosing never erases a creature from the other device's family tree.
 */
export function resolveSave(chosen: SyncEnvelope, other: SyncEnvelope): MonsterSaveFile {
  const monsters = mergeLineage(chosen.save.monsters, other.save.monsters);
  return {
    ...chosen.save,
    monsters,
    loadouts: mergeLoadouts(chosen.save.loadouts, other.save.loadouts, monsters),
  };
}

/**
 * What the player is being asked to choose between.
 *
 * Here rather than in the UI because the honest description of a conflict is
 * part of the rule: it has to say what each side would keep.
 */
export interface ConflictChoice {
  readonly deviceId: string;
  readonly savedAt: number;
  readonly revision: number;
  /** Monsters still playable on this side. */
  readonly owned: number;
  /** Everything this side has ever held. */
  readonly lineage: number;
  readonly arenaWins: number | null;
  readonly gameOver: boolean;
}

export function describeChoice(envelope: SyncEnvelope): ConflictChoice {
  const save = envelope.save;
  return {
    deviceId: envelope.deviceId,
    savedAt: envelope.savedAt,
    revision: envelope.revision,
    owned: save.session?.ownedIds.length ?? save.monsters.length,
    lineage: save.monsters.length,
    arenaWins: save.arena ? save.arena.wins : null,
    gameOver: save.session?.status === 'gameOver',
  };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export type PushResult =
  | { readonly ok: true; readonly stored: SyncEnvelope }
  /** Somebody else wrote first. Pull, settle it, push again. */
  | { readonly ok: false; readonly reason: 'stale'; readonly stored: SyncEnvelope }
  | { readonly ok: false; readonly reason: 'rejected' | 'offline'; readonly message: string };

/**
 * The far side, whatever it turns out to be.
 *
 * Deliberately two methods and nothing else. A server, a file the player
 * exports, or an in-memory stub for tests all fit this, which is what keeps
 * the choice of backend out of the game's rules.
 *
 * `push` takes the secret because the far side has to be able to refuse a
 * write to somebody else's account. Nothing else in the core sees it.
 */
export interface SaveTransport {
  pull(accountId: string): Promise<SyncEnvelope | null>;
  push(envelope: SyncEnvelope, secret: string): Promise<PushResult>;
}

/** A transport that keeps everything in memory. For tests, and nothing else. */
export function createMemoryTransport(
  seed: { readonly envelope: SyncEnvelope; readonly secret: string } | null = null,
): SaveTransport & { readonly stored: () => SyncEnvelope | null } {
  let held = seed?.envelope ?? null;
  let secret = seed?.secret ?? null;
  return {
    stored: () => held,
    pull(accountId) {
      return Promise.resolve(held && held.accountId === accountId ? held : null);
    },
    push(envelope, given) {
      if (secret !== null && given !== secret) {
        return Promise.resolve({
          ok: false as const,
          reason: 'rejected' as const,
          message: 'この合言葉ではこのアカウントに書けません。',
        });
      }
      if (held && envelope.basedOn !== held.revision) {
        return Promise.resolve({ ok: false as const, reason: 'stale' as const, stored: held });
      }
      held = envelope;
      secret = given;
      return Promise.resolve({ ok: true as const, stored: envelope });
    },
  };
}
