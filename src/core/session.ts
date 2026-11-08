/**
 * The run: what the player owns, what they have lost, and when it is over.
 *
 * Until now a monster was a value and the collection was whatever the caller
 * happened to be holding. That is fine for breeding, and not fine at all for
 * a game where fusing consumes both parents and losing a fight costs the
 * monster that fought: the moment an action destroys something, the rule for
 * "destroyed exactly once" has to live somewhere a screen cannot get wrong.
 *
 * So ownership is a value too. Every operation here returns a new session and
 * leaves the one it was given alone, and every operation that destroys
 * something is idempotent: a resent request, a double-tapped button, a defeat
 * screen that is opened twice, all land once.
 *
 * Two lists, deliberately. `owned` is what can be played, fused and spent.
 * `history` is everything that has ever existed, kept because a monster's
 * parents are part of what it is - a lineage that forgot its own names the
 * moment a parent was consumed would be no lineage at all.
 */

import type { BattleState, Monster, MonsterId } from '../shared/types.ts';
import type { MonsterContext } from './fusion.ts';
import type { GenePart, PartFusionResult, PartInventory } from './parts.ts';
import { createPartInventory, fuseWithPart } from './parts.ts';
import type { SoulMakeResult, SoulMakeSelection } from './soulmake.ts';
import { soulMake } from './soulmake.ts';

export type SessionStatus = 'playing' | 'gameOver';

export interface GameSession {
  /** Monsters the player has. Playable, fusable, losable. */
  readonly owned: readonly Monster[];
  /** Everything that has ever been owned, for lineage. Never shrinks. */
  readonly history: readonly Monster[];
  readonly inventory: PartInventory;
  readonly status: SessionStatus;
  /**
   * Monsters committed to a battle or an arena run.
   *
   * A monster cannot be fused away while it is standing in the ring, so the
   * session has to know which those are. The caller marks them with
   * `deployMonsters` when a fight starts.
   */
  readonly deployed: readonly MonsterId[];
  /** Battles whose result has already been applied. */
  readonly settledBattles: readonly string[];
  /** Fusion and soul-make requests already applied. */
  readonly completedRequests: readonly string[];
}

/** How many ids are remembered. Matches the part inventory's ledger. */
export const SESSION_LEDGER_LIMIT = 64;

export interface CreateSessionOptions {
  /** Past monsters, when restoring a run. Owned monsters are added to it. */
  readonly history?: readonly Monster[];
  readonly inventory?: PartInventory;
  readonly deployed?: readonly MonsterId[];
  readonly settledBattles?: readonly string[];
  readonly completedRequests?: readonly string[];
  /**
   * Force the status instead of deriving it.
   *
   * Only for restoring a save: a finished run with no monsters left is over,
   * and a run restored with no monsters is over too, so deriving it is right
   * for every case except one - a save that recorded `gameOver` must stay
   * over even if something later puts a monster back in the list.
   */
  readonly status?: SessionStatus;
}

/**
 * Starts a run.
 *
 * With no monsters this is a finished run, not an empty one: nothing but a
 * monster can produce a monster, so there would be no way out of it.
 */
export function createGameSession(
  owned: readonly Monster[] = [],
  options: CreateSessionOptions = {},
): GameSession {
  const kept = dedupe(owned);
  return {
    owned: kept,
    history: dedupe([...(options.history ?? []), ...kept]),
    inventory: options.inventory ?? createPartInventory(),
    status: options.status ?? (kept.length > 0 ? 'playing' : 'gameOver'),
    deployed: [...(options.deployed ?? [])],
    settledBattles: [...(options.settledBattles ?? [])],
    completedRequests: [...(options.completedRequests ?? [])],
  };
}

export function isGameOver(session: GameSession): boolean {
  return session.status === 'gameOver';
}

export function ownedMonster(
  session: GameSession,
  id: MonsterId,
): Monster | undefined {
  return session.owned.find((monster) => monster.id === id);
}

/** True while this monster is in a fight and must not be spent. */
export function isDeployed(session: GameSession, id: MonsterId): boolean {
  return session.deployed.includes(id);
}

/**
 * Marks which monsters are in a fight.
 *
 * Replaces the whole list rather than adding to it, so the caller can clear
 * it by passing nothing when a run ends. Ids that are not owned are dropped:
 * a monster that is gone is not deployed.
 */
export function deployMonsters(
  session: GameSession,
  ids: readonly MonsterId[] = [],
): GameSession {
  const owned = new Set(session.owned.map((monster) => monster.id));
  return { ...session, deployed: [...new Set(ids)].filter((id) => owned.has(id)) };
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

/** Why a session refused, when it did. */
export type SessionRefusal =
  | 'gameOver'
  | 'duplicate'
  | 'sameMonster'
  | 'notOwned'
  | 'deployed'
  | 'partNotHeld';

export interface SessionFusion {
  readonly session: GameSession;
  readonly result: PartFusionResult;
  /** Set when the session itself refused, before any fusion was attempted. */
  readonly refusal: SessionRefusal | null;
}

function refusedFusion(
  session: GameSession,
  message: string,
  refusal: SessionRefusal,
): SessionFusion {
  return {
    session,
    result: {
      ok: false,
      message,
      child: null,
      inventory: session.inventory,
      spent: null,
      fusion: null,
      duplicate: refusal === 'duplicate',
    },
    refusal,
  };
}

/**
 * Fuses two owned monsters, consuming both and keeping the child.
 *
 * Nothing is consumed unless a child was produced - a fusion the genetics
 * refuse leaves both parents and the part exactly where they were. The
 * parents go to `history`, so the child's lineage can still be read.
 */
export function fuseOwnedMonsters(
  session: GameSession,
  parentAId: MonsterId,
  parentBId: MonsterId,
  context: MonsterContext,
  requestId: string,
  partId?: string,
): SessionFusion {
  if (isGameOver(session)) {
    return refusedFusion(session, 'この冒険は終わっています。', 'gameOver');
  }
  if (session.completedRequests.includes(requestId)) {
    return refusedFusion(session, 'この融合はすでに完了しています。', 'duplicate');
  }
  if (parentAId === parentBId) {
    return refusedFusion(session, '同じ個体同士では融合できません。', 'sameMonster');
  }

  const a = ownedMonster(session, parentAId);
  const b = ownedMonster(session, parentBId);
  if (!a || !b) {
    return refusedFusion(session, '手元にいない個体は融合できません。', 'notOwned');
  }
  for (const parent of [a, b]) {
    if (isDeployed(session, parent.id)) {
      return refusedFusion(
        session,
        `${parent.name}は戦闘中です。融合できません。`,
        'deployed',
      );
    }
  }

  let part: GenePart | null = null;
  if (partId !== undefined) {
    const stack = session.inventory.stacks.find((entry) => entry.part.id === partId);
    if (!stack || stack.count < 1) {
      return refusedFusion(session, 'その素材を持っていません。', 'partNotHeld');
    }
    part = stack.part;
  }

  const result = fuseWithPart(a, b, part, session.inventory, context, requestId);
  if (!result.ok || !result.child) {
    // fuseWithPart hands back the inventory it was given on a refusal, so
    // there is nothing to undo here.
    return { session, result, refusal: null };
  }

  const child = result.child;
  const owned = session.owned.filter(
    (monster) => monster.id !== a.id && monster.id !== b.id,
  );
  return {
    session: {
      ...session,
      owned: [...owned, child],
      history: dedupe([...session.history, child]),
      inventory: result.inventory,
      deployed: session.deployed.filter((id) => id !== a.id && id !== b.id),
      completedRequests: remember(session.completedRequests, requestId),
    },
    result,
    refusal: null,
  };
}

// ---------------------------------------------------------------------------
// Defeat
// ---------------------------------------------------------------------------

export interface SettledBattle {
  readonly session: GameSession;
  /** Monsters taken by this defeat. Empty when nothing was lost. */
  readonly lost: readonly Monster[];
  /** True when this battle had already been settled. */
  readonly duplicate: boolean;
}

/**
 * Applies a finished battle: a monster that fought and lost is gone.
 *
 * Losing is the one thing in this game that cannot be taken back, so the
 * rules are narrow on purpose. An undecided battle settles nothing and is not
 * recorded, because the same battle will be handed back decided later. A draw
 * is decided and costs nothing - the request of 2026-11-08 excludes it. Only
 * the side that actually lost gives anything up, whichever side that was. And
 * a run that is already over settles nothing at all.
 */
export function settleBattleLoss(
  session: GameSession,
  battle: BattleState,
  battleId: string,
): SettledBattle {
  // A finished run is finished. There is nothing left to take, and a run that
  // could still change after it ended would not have ended.
  if (isGameOver(session)) return { session, lost: [], duplicate: false };
  if (session.settledBattles.includes(battleId)) {
    return { session, lost: [], duplicate: true };
  }
  // Still being fought: settling now would mark the real result as applied.
  if (battle.outcome.status === 'ongoing') {
    return { session, lost: [], duplicate: false };
  }

  const settled = {
    ...session,
    settledBattles: remember(session.settledBattles, battleId),
  };
  if (battle.outcome.status !== 'win') {
    return { session: settled, lost: [], duplicate: false };
  }

  const { winningSide } = battle.outcome;
  const fallen = new Set(
    battle.combatants
      .filter((combatant) => combatant.side !== winningSide)
      .map((combatant) => combatant.monsterId),
  );
  const lost = session.owned.filter((monster) => fallen.has(monster.id));
  if (lost.length === 0) return { session: settled, lost: [], duplicate: false };

  const owned = session.owned.filter((monster) => !fallen.has(monster.id));
  return {
    session: {
      ...settled,
      owned,
      // history already holds them; losing a monster does not unname it.
      deployed: settled.deployed.filter((id) => !fallen.has(id)),
      status: owned.length > 0 ? 'playing' : 'gameOver',
    },
    lost,
    duplicate: false,
  };
}

// ---------------------------------------------------------------------------
// Soul make
// ---------------------------------------------------------------------------

export interface SessionSoulMake {
  readonly session: GameSession;
  readonly result: SoulMakeResult;
  readonly refusal: SessionRefusal | null;
}

/**
 * Builds a monster from parts and keeps it.
 *
 * Refused once the run is over. Parts outlive the monsters that dropped them,
 * so without this a player with a full inventory could carry on after losing
 * everything, and running out of monsters would not mean anything.
 */
export function soulMakeInSession(
  session: GameSession,
  selection: SoulMakeSelection,
  context: MonsterContext,
  requestId: string,
): SessionSoulMake {
  const refuse = (message: string, refusal: SessionRefusal): SessionSoulMake => ({
    session,
    result: {
      ok: false,
      message,
      monster: null,
      inventory: session.inventory,
      spent: [],
      duplicate: refusal === 'duplicate',
    },
    refusal,
  });

  if (isGameOver(session)) {
    return refuse('この冒険は終わっています。素材は使えません。', 'gameOver');
  }
  if (session.completedRequests.includes(requestId)) {
    return refuse('このソウルメイクはすでに完了しています。', 'duplicate');
  }

  const result = soulMake(selection, session.inventory, context, requestId);
  if (!result.ok || !result.monster) {
    return { session, result, refusal: null };
  }

  const monster = result.monster;
  return {
    session: {
      ...session,
      owned: [...session.owned, monster],
      history: dedupe([...session.history, monster]),
      inventory: result.inventory,
      completedRequests: remember(session.completedRequests, requestId),
    },
    result,
    refusal: null,
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function dedupe(monsters: readonly Monster[]): readonly Monster[] {
  const byId = new Map<MonsterId, Monster>();
  for (const monster of monsters) byId.set(monster.id, monster);
  return [...byId.values()];
}

function remember(ledger: readonly string[], id: string): readonly string[] {
  return [...ledger, id].slice(-SESSION_LEDGER_LIMIT);
}
