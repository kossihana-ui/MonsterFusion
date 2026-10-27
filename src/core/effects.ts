/**
 * Status effects and move behaviour.
 *
 * Until now a move was power, scaling, element and cost, and a turn was one
 * damage calculation. The 2026-10-27 move spec needs more than that: moves
 * that heal and do not attack, moves that only strip buffs, moves that hit
 * twice, moves that pierce defence, and statuses that persist across turns.
 *
 * Two rules from the spec drive the shape of this file:
 *
 *   - "回復のみ、解除のみの技は攻撃しない" - a support move must not go
 *     through damage at all. Not zero damage: no damage event, no minimum
 *     damage floor, no critical roll, no hit reaction. `attacks: false` is
 *     what says so, and nothing infers it from power or from physical/magical.
 *   - "勝手に数値を決めない" - a move whose numbers the spec leaves open is
 *     marked `specified: false` and keeps its current plain-damage behaviour.
 *     It is not guessed at, and the UI can see which moves are still pending.
 */

import type { BattleConfig } from './config.ts';
import { DEFAULT_BATTLE_CONFIG } from './config.ts';

// ---------------------------------------------------------------------------
// Statuses
// ---------------------------------------------------------------------------

export type StatusKind =
  /** Cannot act. */
  | 'bind'
  /** Physical attacks mostly miss. */
  | 'blind'
  /** Loses HP at the end of each turn. */
  | 'poison'
  /** Primed: a follow-up of the right element does more. */
  | 'seed'
  /** Attack doubled while it lasts. */
  | 'attackUp'
  /** Spent the turn after a heavy move. */
  | 'recoil';

/** Which side of the ledger a status sits on, for "strip buffs" and friends. */
export const STATUS_POLARITY: Readonly<Record<StatusKind, 'buff' | 'debuff'>> = {
  bind: 'debuff',
  blind: 'debuff',
  poison: 'debuff',
  seed: 'debuff',
  attackUp: 'buff',
  recoil: 'debuff',
};

export const STATUS_LABELS: Readonly<Record<StatusKind, string>> = {
  bind: 'バインド',
  blind: '暗闇',
  poison: '毒',
  seed: '種',
  attackUp: '攻撃力上昇',
  recoil: '硬直',
};

export interface StatusEffect {
  readonly kind: StatusKind;
  /** Turns left, counted down at the end of a turn. */
  readonly turns: number;
  /** What the status is worth, where it has a size: a multiplier, a tick. */
  readonly magnitude?: number;
  readonly sourceId?: string;
}

export function hasStatus(
  statuses: readonly StatusEffect[] | undefined,
  kind: StatusKind,
): boolean {
  return (statuses ?? []).some((status) => status.kind === kind && status.turns > 0);
}

export function statusOf(
  statuses: readonly StatusEffect[] | undefined,
  kind: StatusKind,
): StatusEffect | undefined {
  return (statuses ?? []).find((status) => status.kind === kind && status.turns > 0);
}

/** Adds or refreshes a status. The longer of the two durations wins. */
export function applyStatus(
  statuses: readonly StatusEffect[],
  next: StatusEffect,
): StatusEffect[] {
  const existing = statuses.find((s) => s.kind === next.kind);
  if (!existing) return [...statuses, next];
  return statuses.map((s) =>
    s.kind === next.kind
      ? { ...next, turns: Math.max(s.turns, next.turns) }
      : s,
  );
}

export function removeStatuses(
  statuses: readonly StatusEffect[],
  kinds: readonly StatusKind[],
): { statuses: StatusEffect[]; removed: StatusKind[] } {
  const removed: StatusKind[] = [];
  const kept = statuses.filter((status) => {
    if (kinds.includes(status.kind)) {
      removed.push(status.kind);
      return false;
    }
    return true;
  });
  return { statuses: kept, removed };
}

/** Strips every status on one side of the ledger. */
export function removePolarity(
  statuses: readonly StatusEffect[],
  polarity: 'buff' | 'debuff',
): { statuses: StatusEffect[]; removed: StatusKind[] } {
  return removeStatuses(
    statuses,
    statuses.filter((s) => STATUS_POLARITY[s.kind] === polarity).map((s) => s.kind),
  );
}

/** Counts a turn off every status and drops the expired ones. */
export function tickStatuses(statuses: readonly StatusEffect[]): StatusEffect[] {
  return statuses
    .map((status) => ({ ...status, turns: status.turns - 1 }))
    .filter((status) => status.turns > 0);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * What actually happened, as a list the UI replays in order.
 *
 * The UI must not recompute a heal, a removal or a status from the state it
 * had before: it plays these and then adopts the state core returned.
 */
export type BattleEffectEvent =
  | { readonly type: 'damage'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly amount: number; readonly critical: boolean;
      readonly elementMultiplier: number; readonly mitigated: number;
      /** 1-based, for a move that hits more than once. */
      readonly hit: number; readonly hits: number; readonly pierced: boolean }
  | { readonly type: 'heal'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; /** What was actually restored, after the HP cap. */
      readonly amount: number }
  | { readonly type: 'cleanse'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly removed: readonly StatusKind[] }
  | { readonly type: 'status'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly status: StatusKind; readonly turns: number }
  | { readonly type: 'miss'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly reason: 'blind' | 'chance' }
  | { readonly type: 'skip'; readonly actorId: string; readonly reason: StatusKind }
  | { readonly type: 'blocked'; readonly actorId: string; readonly skillId?: string;
      readonly reason: 'consecutive' | 'mp' };

// ---------------------------------------------------------------------------
// Move behaviour
// ---------------------------------------------------------------------------

export type ActionMode = 'damage' | 'support' | 'reflect';

export interface StatusApplication {
  readonly status: StatusKind;
  readonly target: 'self' | 'enemy';
  readonly turns: number;
  readonly chance: number;
  readonly magnitude?: number;
}

export interface MoveBehavior {
  readonly skillId: string;
  readonly actionMode: ActionMode;
  readonly target: 'self' | 'enemy' | 'both';
  /**
   * Whether the move deals damage at all.
   *
   * Never inferred from power or from physical/magical: a support move is
   * `false` here and skips the damage path entirely.
   */
  readonly attacks: boolean;
  /** How many times it connects. */
  readonly hits: number;
  /** Ignores the target's defence stat and its guard. */
  readonly piercesDefense: boolean;
  /** Flat HP restored to the target named by `target`. */
  readonly heal: number;
  /** Statuses stripped, by polarity, from whom. */
  readonly cleanse: readonly { target: 'self' | 'enemy'; polarity: 'buff' | 'debuff' }[];
  /** Specific statuses stripped from whom. */
  readonly cure: readonly { target: 'self' | 'enemy'; statuses: readonly StatusKind[] }[];
  readonly applies: readonly StatusApplication[];
  /** Cannot be used two turns running. */
  readonly noConsecutiveUse: boolean;
  /** Usable even while bound. */
  readonly usableWhileBound: boolean;
  /**
   * False while the spec still leaves a number open. The move keeps its
   * current plain-damage behaviour and the UI can show it as pending.
   */
  readonly specified: boolean;
  /** What is still undecided, in Japanese, for the pending list. */
  readonly pending?: string;
}

const PLAIN: Omit<MoveBehavior, 'skillId'> = {
  actionMode: 'damage',
  target: 'enemy',
  attacks: true,
  hits: 1,
  piercesDefense: false,
  heal: 0,
  cleanse: [],
  cure: [],
  applies: [],
  noConsecutiveUse: false,
  usableWhileBound: false,
  specified: true,
};

function behaviour(skillId: string, overrides: Partial<MoveBehavior> = {}): MoveBehavior {
  return { ...PLAIN, skillId, ...overrides };
}

/** A move still waiting on a number the spec has not given. */
function pending(skillId: string, note: string): MoveBehavior {
  return behaviour(skillId, { specified: false, pending: note });
}

/**
 * How each move behaves.
 *
 * Only the moves whose numbers the spec actually states are implemented. The
 * rest are listed as pending with the question that blocks them, so nothing
 * here is a guess and the open list is visible rather than buried.
 */
export const MOVE_BEHAVIOURS: Readonly<Record<string, MoveBehavior>> = {
  // --- fully specified -----------------------------------------------------

  // 「30回復する／連続で使えない」。回復のみなので攻撃しない。
  'hydro-ram': behaviour('hydro-ram', {
    actionMode: 'support',
    target: 'self',
    attacks: false,
    heal: 30,
    noConsecutiveUse: true,
  }),

  // 「お互いのデバフ、バフを消す／消費MP2」。解除のみなので攻撃しない。
  'crystal-ray': behaviour('crystal-ray', {
    actionMode: 'support',
    target: 'both',
    attacks: false,
    cleanse: [
      { target: 'self', polarity: 'buff' },
      { target: 'self', polarity: 'debuff' },
      { target: 'enemy', polarity: 'buff' },
      { target: 'enemy', polarity: 'debuff' },
    ],
  }),

  // 「防御を貫通する／相手のバフ解除」。解除を含むが攻撃は消さない。
  'tusk-rush': behaviour('tusk-rush', {
    piercesDefense: true,
    cleanse: [{ target: 'enemy', polarity: 'buff' }],
  }),

  // 「相手がバインドだと2倍／相手のバインドを解除」。判定してから解除する。
  'coil-crush': behaviour('coil-crush', {
    cure: [{ target: 'enemy', statuses: ['bind'] }],
  }),

  // 防御貫通のみ。
  'impact-horn': behaviour('impact-horn', { piercesDefense: true }),
  'crystal-shard': behaviour('crystal-shard', { piercesDefense: true }),
  'mane-guard': behaviour('mane-guard', { piercesDefense: true }),

  // 2回攻撃。
  'double-gore': behaviour('double-gore', { hits: 2 }),

  // 使用後1ターン動けない。
  'final-tail': behaviour('final-tail', {
    applies: [{ status: 'recoil', target: 'self', turns: 1, chance: 1 }],
  }),

  // 相手が守っていると1.2倍。守りの上から入る技。
  'fang-bite': behaviour('fang-bite'),

  // --- pending: the spec leaves a number open ------------------------------

  'twin-lash': pending('twin-lash', '「威力は1か2」が固定値か倍率か段階か未確定。暗闇の継続ターン数も未指定。'),
  'bind-whip': pending('bind-whip', 'バインドの20%が「2ターン継続する確率」か「全体の発生確率」か未確定。'),
  'tail-sweep': pending('tail-sweep', '反射と通常攻撃の区別、連続使用時の成功率20%の適用条件が未確定。'),
  'ram-charge': pending('ram-charge', '攻撃を伴うかが未明示（強化のみに見える技）。'),
  'crown-break': pending('crown-break', '「大ダメージ」の値と、ひるみの確率・ターン数が未指定。'),
  'single-thrust': pending('single-thrust', '「大ダメージ」の値が未指定。'),
  'wing-cutter': pending('wing-cutter', '攻撃を伴うかが未明示。種の継続ターン数も未指定。'),
  'dive-attack': pending('dive-attack', '「大ダメージ」の値が未指定。'),
  'soul-wing': pending('soul-wing', '即死20%は明記されているが、外れたときの「ダメージ」が通常威力か別値か未確定。'),
  'death-bite': pending('death-bite', '毒とバインドの継続ターン数・発生確率が未指定。'),
  'pierce-beak': pending('pierce-beak', '倍率は明記されているが、守っていない相手への0.5倍と防御貫通の関係が未確定。'),
  'magic-eye': pending('magic-eye', '攻撃を伴うかが未明示。バインドと暗闇の継続ターン数も未指定。'),
  'multi-gaze': pending('multi-gaze', '「威力1」の意味と、MP+10が回復か最大値上昇かが未確定。'),
  'pierce-gaze': pending('pierce-gaze', '攻撃を伴うかが未明示。'),
  'pollen-burst': pending('pollen-burst', '攻撃を伴うかが未明示。毒の継続ターン数も未指定。'),
  'royal-order': pending('royal-order', '攻撃を伴うかが未明示。バインドの継続ターン数も未指定。'),
  'fin-slash': pending('fin-slash', '「+威力2」の意味が未確定。移すデバフが全部か1つかも未指定。'),
  'antenna-pulse': pending('antenna-pulse', '攻撃を伴うかが未明示。'),
  'power-slam': pending('power-slam', '「威力3」の意味が未確定。'),
  'giant-press': pending('giant-press', '「大ダメージ」の値が未指定。'),
};

/**
 * How a move behaves. An unknown move, or one still pending, is a plain
 * single-hit attack - which is what every move does today.
 */
export function getMoveBehavior(skillId: string): MoveBehavior {
  const known = MOVE_BEHAVIOURS[skillId];
  if (!known) return behaviour(skillId);
  if (!known.specified) return behaviour(skillId, { specified: false, ...(known.pending ? { pending: known.pending } : {}) });
  return known;
}

/** Moves still waiting on a decision, for a status screen or a report. */
export function pendingMoves(): { skillId: string; question: string }[] {
  return Object.values(MOVE_BEHAVIOURS)
    .filter((move) => !move.specified)
    .map((move) => ({ skillId: move.skillId, question: move.pending ?? '' }));
}

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

/** Whether a blinded attacker misses this physical swing. */
export function blindMisses(
  statuses: readonly StatusEffect[] | undefined,
  isPhysical: boolean,
  roll: number,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): boolean {
  if (!isPhysical) return false;
  if (!hasStatus(statuses, 'blind')) return false;
  return roll < config.blindEvasion;
}

/** The damage multiplier a monster's buffs are worth. */
export function offenceMultiplier(statuses: readonly StatusEffect[] | undefined): number {
  const buff = statusOf(statuses, 'attackUp');
  return buff ? (buff.magnitude ?? 2) : 1;
}

/** Whether a combatant is stopped from acting this turn, and by what. */
export function blockingStatus(
  statuses: readonly StatusEffect[] | undefined,
): StatusKind | null {
  if (hasStatus(statuses, 'recoil')) return 'recoil';
  if (hasStatus(statuses, 'bind')) return 'bind';
  return null;
}
