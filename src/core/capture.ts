/**
 * ドクロゲソ: taking the opponent home instead of beating it.
 *
 * The player's rule, in their words: using it makes the other monster your
 * ally, and it works on the boss too. So there is no hit-point threshold and
 * no roll - the item is the cost, and the cost is that you only get one when
 * a boss happens to leave one.
 *
 * What capture is NOT is a way to win a fight. The run ends where it stood:
 * no win credited, no drop claimed, no streak continued. You left with the
 * monster instead of with the prize, and the alternative - a free win, a
 * part, AND the creature - would make the item the only sensible way to play
 * a boss.
 *
 * The monster that joins is the one that was actually fought: the same
 * genes, the same look, the same tier. It is given an id of its own and a
 * birthday, and nothing else about it is touched, because a captured
 * creature that quietly differed from the one on screen would be a lie about
 * what the item does.
 */

import type { Monster, MonsterId } from '../shared/types.ts';
import type { ArenaRewardResult, ArenaRun } from './arena.ts';
import { claimArenaReward } from './arena.ts';
import type { MonsterContext } from './fusion.ts';
import { createIdFromRandom } from './fusion.ts';
import type { Consumable } from './items.ts';
import { addItem, consumableById, DOKURO_GESO, itemCount, removeItem } from './items.ts';
import type { GenePart } from './parts.ts';
import { addPart } from './parts.ts';
import type { GameSession, SessionRefusal } from './session.ts';
import { isGameOver } from './session.ts';

/** The item that captures. One today; named rather than assumed. */
export const CAPTURE_ITEM_ID = DOKURO_GESO.id;

export interface CapturePreview {
  readonly ok: boolean;
  /** Japanese, shown as-is. */
  readonly message: string;
  /** The monster that would join, for the confirmation. */
  readonly target: Monster | null;
  /** How many of the item are in hand. */
  readonly held: number;
  readonly refusal: CaptureRefusal | null;
}

export type CaptureRefusal =
  | SessionRefusal
  | 'noItem'
  | 'battleOver'
  | 'unknownItem';

function refuse(
  message: string,
  refusal: CaptureRefusal,
  held = 0,
  target: Monster | null = null,
): CapturePreview {
  return { ok: false, message, target, held, refusal };
}

/**
 * Whether the item can be used on this fight right now, and on whom.
 *
 * Checked against the run the caller is holding, so a stale run - one whose
 * fight is already decided - is refused rather than quietly capturing a
 * monster the player already beat.
 */
export function previewCapture(
  session: GameSession,
  run: ArenaRun,
  itemId: string = CAPTURE_ITEM_ID,
): CapturePreview {
  const item = consumableById(itemId);
  if (!item || item.id !== CAPTURE_ITEM_ID) {
    return refuse('そのアイテムでは捕まえられません。', 'unknownItem');
  }
  if (isGameOver(session)) {
    return refuse('この冒険は終わっています。', 'gameOver');
  }

  const held = itemCount(session.items, item.id);
  if (held < 1) {
    return refuse(`${item.name}を持っていません。`, 'noItem');
  }
  if (run.phase !== 'battle' || run.battle.outcome.status !== 'ongoing') {
    return refuse('戦いが終わったあとでは使えません。', 'battleOver', held);
  }

  const target = run.encounter.enemy;
  return {
    ok: true,
    message: `${item.name}を使って${target.name}を仲間にする。この挑戦はここで終わります。`,
    target,
    held,
    refusal: null,
  };
}

export interface CaptureResult {
  readonly ok: boolean;
  /** Japanese, shown as-is. */
  readonly message: string;
  readonly session: GameSession;
  /** The run, ended, when the capture went through. */
  readonly run: ArenaRun;
  readonly captured: Monster | null;
  /** The item actually spent. Null on a refusal. */
  readonly spent: Consumable | null;
  readonly duplicate: boolean;
  readonly refusal: CaptureRefusal | null;
}

/**
 * Uses the item: the opponent joins, the item is gone, the run is over.
 *
 * Nothing is spent on a refusal, and nothing twice for a repeated
 * `requestId` - the same tap does not cost two items or produce two copies.
 */
export function captureArenaMonster(
  session: GameSession,
  run: ArenaRun,
  context: MonsterContext,
  requestId: string,
  itemId: string = CAPTURE_ITEM_ID,
): CaptureResult {
  if (session.completedRequests.includes(requestId)) {
    return {
      ok: false,
      message: 'この捕獲はすでに完了しています。',
      session,
      run,
      captured: null,
      spent: null,
      duplicate: true,
      refusal: 'duplicate',
    };
  }

  const preview = previewCapture(session, run, itemId);
  if (!preview.ok || !preview.target) {
    return {
      ok: false,
      message: preview.message,
      session,
      run,
      captured: null,
      spent: null,
      duplicate: false,
      refusal: preview.refusal,
    };
  }

  const item = consumableById(itemId) as Consumable;
  const items = removeItem(session.items, item.id, 1);
  if (!items) {
    return {
      ok: false,
      message: `${item.name}を持っていません。`,
      session,
      run,
      captured: null,
      spent: null,
      duplicate: false,
      refusal: 'noItem',
    };
  }

  const captured = recruit(preview.target, context);
  // The run stops here. Not a win: no reward to claim, no streak to continue.
  const endedRun: ArenaRun = { ...run, phase: 'cleared' };

  return {
    ok: true,
    message: `${captured.name}が仲間になった。`,
    session: {
      ...session,
      owned: [...session.owned, captured],
      history: [...session.history, captured],
      items,
      deployed: session.deployed.filter((id) => id !== run.player.id),
      completedRequests: [...session.completedRequests, requestId].slice(-64),
    },
    run: endedRun,
    captured,
    spent: item,
    duplicate: false,
    refusal: null,
  };
}

/**
 * The opponent, as a monster of the player's own.
 *
 * Its genes, look, tier and name are the ones that were on screen. What
 * changes is that it gets an identity instead of an encounter slot: its own
 * id, its own birthday, and no claim on the arena run it came from.
 */
function recruit(enemy: Monster, context: MonsterContext): Monster {
  const id: MonsterId = context.nextId
    ? context.nextId()
    : createIdFromRandom(context.rng);
  const now = context.now ?? (() => Date.now());
  return {
    ...enemy,
    id,
    createdAt: now(),
    parentAId: null,
    parentBId: null,
    generation: 0,
    fusionHistory: [],
  };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export interface SessionReward {
  readonly session: GameSession;
  readonly run: ArenaRun;
  readonly result: ArenaRewardResult;
}

/**
 * Claims a win's reward into the run's own session.
 *
 * The arena only knows about parts, so it reports consumables rather than
 * storing them; this is the one place both inventories are in scope. A
 * second claim of the same encounter is already refused by the arena and
 * changes nothing here either.
 */
export function claimArenaRewardInSession(
  session: GameSession,
  run: ArenaRun,
  context: MonsterContext,
): SessionReward {
  const result = claimArenaReward(run, session.inventory, context);
  if (result.duplicate) return { session, run: result.run, result };
  let items = session.items;
  for (const item of result.items) items = addItem(items, item, 1);
  return {
    session: { ...session, inventory: result.inventory, items },
    run: result.run,
    result,
  };
}

/** Adds a part to a session's inventory. For callers outside the arena. */
export function giveSessionPart(
  session: GameSession,
  part: GenePart,
  count = 1,
): GameSession {
  return { ...session, inventory: addPart(session.inventory, part, count) };
}

/** Adds a consumable to a session. For rewards granted outside the arena. */
export function giveSessionItem(
  session: GameSession,
  item: Consumable,
  count = 1,
): GameSession {
  return { ...session, items: addItem(session.items, item, count) };
}
