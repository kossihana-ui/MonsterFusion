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

import type { Monster } from '../shared/types.ts';
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
  | 'recoil'
  /** Stunned by an opponent: loses the next turn. */
  | 'flinch'
  /** Throws an incoming attack back at whoever made it. */
  | 'reflect'
  /** Acts twice next turn. */
  | 'doubleStrike'
  /** Has a chance to avoid an incoming attack outright. */
  | 'evasion';

/** Which side of the ledger a status sits on, for "strip buffs" and friends. */
export const STATUS_POLARITY: Readonly<Record<StatusKind, 'buff' | 'debuff'>> = {
  bind: 'debuff',
  blind: 'debuff',
  poison: 'debuff',
  seed: 'debuff',
  attackUp: 'buff',
  recoil: 'debuff',
  flinch: 'debuff',
  reflect: 'buff',
  doubleStrike: 'buff',
  evasion: 'buff',
};

/** Why a condition fired, in Japanese, for the multiplier the UI shows. */
export const BOOST_REASONS: Readonly<Record<DamageBoost['source'], string>> = {
  attackUp: '攻撃力上昇',
  seed: '種',
  targetDefending: '守りを突いた',
  targetNotDefending: '守っていない',
  targetBound: '拘束中',
  selfPoisoned: '毒をおして',
  charge: '連打',
  element: '属性',
};

export const STATUS_LABELS: Readonly<Record<StatusKind, string>> = {
  bind: 'バインド',
  blind: '暗闇',
  poison: '毒',
  seed: '種',
  attackUp: '攻撃力上昇',
  recoil: '硬直',
  flinch: 'ひるみ',
  reflect: '反射',
  doubleStrike: '連続行動',
  evasion: '回避',
};

export interface StatusEffect {
  readonly kind: StatusKind;
  /** Turns left, counted down at the end of a turn. */
  readonly turns: number;
  /**
   * The turn it was applied on.
   *
   * A status applied this turn is not aged at the end of it. Without this a
   * one-turn buff is gone before its owner can use it, and a recoil clears
   * before the turn it is supposed to cost.
   */
  readonly appliedTurn?: number;
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

/**
 * Whether a status can be put on at all right now.
 *
 * An ailment that is already running cannot be re-applied. The spec gives
 * every ailment a length - blindness two turns, a bind one or two - and
 * refreshing it on the turn it was about to end makes that length a
 * formality: a move that costs 7 MP held an opponent blind for the whole
 * fight. So the length is what it says, and the way to keep someone blind is
 * to have blinded them recently, not to keep paying for it.
 *
 * Buffs still refresh, because the cost of holding one is already the turn
 * spent on it instead of attacking.
 */
export function canApplyStatus(
  statuses: readonly StatusEffect[] | undefined,
  kind: StatusKind,
): boolean {
  if (STATUS_POLARITY[kind] === 'buff') return true;
  return !hasStatus(statuses, kind);
}

/**
 * Adds a status, refreshes a buff, or refuses an ailment that is still
 * running. The longer of the two durations wins on a refresh.
 *
 * A refusal returns the statuses as they were. Callers that report what
 * happened should ask `canApplyStatus` first, so they can say that the
 * status did not land rather than announcing one that never arrived.
 */
export function applyStatus(
  statuses: readonly StatusEffect[],
  next: StatusEffect,
): StatusEffect[] {
  const existing = statuses.find((s) => s.kind === next.kind);
  if (!existing) return [...statuses, next];
  if (!canApplyStatus(statuses, next.kind)) return [...statuses];
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

/**
 * Counts a turn off every status and drops the expired ones.
 *
 * A status applied on `turn` is left alone: it was put there this turn and
 * has not been lived through yet.
 */
export function tickStatuses(
  statuses: readonly StatusEffect[],
  turn?: number,
): StatusEffect[] {
  return statuses
    .map((status) =>
      turn !== undefined && status.appliedTurn === turn
        ? status
        : { ...status, turns: status.turns - 1 },
    )
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
/**
 * One reason a hit was bigger or smaller than usual.
 *
 * `reason` is Japanese and ready to show: the UI announces the multiplier
 * rather than working out that there was one.
 */
export interface DamageBoost {
  readonly source:
    | 'attackUp'
    | 'seed'
    | 'targetDefending'
    | 'targetNotDefending'
    | 'targetBound'
    | 'selfPoisoned'
    | 'charge'
    | 'element';
  readonly reason: string;
  readonly factor: number;
}

export type BattleEffectEvent =
  | { readonly type: 'damage'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly amount: number; readonly critical: boolean;
      readonly elementMultiplier: number; readonly mitigated: number;
      /** 1-based, for a move that hits more than once. */
      readonly hit: number; readonly hits: number; readonly pierced: boolean;
      /**
       * Every multiplier that applied, element included, in the order they
       * were worked out. Empty for an ordinary hit.
       */
      readonly boosts?: readonly DamageBoost[];
      /** The product of `boosts`. 1 when nothing applied. */
      readonly boostTotal?: number }
  | { readonly type: 'heal'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; /** What was actually restored, after the HP cap. */
      readonly amount: number }
  /**
   * MP handed back. Separate from `heal` because a heal of zero means the
   * target was already full, and an MP restore is not that.
   */
  | { readonly type: 'mp'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; /** What was actually restored, after the MP cap. */
      readonly amount: number }
  | { readonly type: 'cleanse'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly removed: readonly StatusKind[] }
  | { readonly type: 'status'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly status: StatusKind; readonly turns: number }
  | { readonly type: 'miss'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly reason: 'blind' | 'chance' }
  /**
   * A status was going to be applied and was not.
   *
   * Play nothing on the status bar for this - the status that is already
   * there is unchanged. It is worth a line of text ("already blind"), and it
   * is the one event that tells a player why a move did nothing.
   */
  | { readonly type: 'noEffect'; readonly actorId: string; readonly targetId: string;
      readonly skillId?: string; readonly status: StatusKind;
      readonly reason: 'alreadyActive' }
  | { readonly type: 'skip'; readonly actorId: string; readonly reason: StatusKind }
  | { readonly type: 'blocked'; readonly actorId: string; readonly skillId?: string;
      readonly reason: 'consecutive' | 'mp' };

// ---------------------------------------------------------------------------
// Move behaviour
// ---------------------------------------------------------------------------

export type ActionMode = 'damage' | 'support' | 'reflect';

/**
 * A multiplier that only applies when the fight is in a particular state.
 *
 * `seedElement` is the spec's 種 mechanic: a seeded target takes more from a
 * follow-up of the named element.
 */
export interface ConditionalMultiplier {
  readonly when:
    | 'targetDefending'
    | 'targetNotDefending'
    | 'targetBound'
    | 'selfPoisoned'
    | 'targetSeeded';
  readonly factor: number;
  /** For `targetSeeded`: which element the follow-up has to be. */
  readonly element?: string;
}

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
  /**
   * 防御貫通: ignores the target's GUARD - the defend action - while still
   * meeting its defence stat.
   */
  readonly piercesDefense: boolean;
  /**
   * 砕牙: ignores the target's DEFENCE STAT.
   *
   * This is what earns a deliberately weak move its slot: it is small, but it
   * lands whole against anything. Separate from 防御貫通, which is about the
   * guard, so a move can have either or both.
   */
  readonly shattersDefense: boolean;
  /** Replaces the move's catalogue power, for the spec's power steps. */
  readonly power?: number;
  /**
   * Success chance when the move was also used last turn.
   *
   * The reflect move is meant to be read rather than held down: using it two
   * turns running drops it to this.
   */
  readonly repeatSuccessChance?: number;
  /** Chance the move connects at all. 1 for the ones that always do. */
  readonly successChance: number;
  /** Chance the target is felled outright, before damage is considered. */
  readonly instantDeathChance: number;
  /** Multipliers that depend on the state of the fight. */
  readonly conditions: readonly ConditionalMultiplier[];
  /** MP handed back to the user. */
  readonly restoreMp: number;
  /** Moves the user's own debuffs onto the target. */
  readonly transfersDebuffs: boolean;
  /** Flat HP restored to the target named by `target`. */
  readonly heal: number;
  /** Statuses stripped, by polarity, from whom. */
  readonly cleanse: readonly { target: 'self' | 'enemy'; polarity: 'buff' | 'debuff' }[];
  /** Specific statuses stripped from whom. */
  readonly cure: readonly { target: 'self' | 'enemy'; statuses: readonly StatusKind[] }[];
  readonly applies: readonly StatusApplication[];
  /** Cannot be used two turns running. */
  readonly noConsecutiveUse: boolean;
  /**
   * Damage per press, for a move the player hammers a key for.
   *
   * Zero for every ordinary move. When set, the damage is the press count
   * times this and nothing else: no attack stat, no defence, no element
   * chart. The player earned it at the keyboard, so the keyboard is what
   * decides it, and a monster with no hands is not better at mashing.
   */
  readonly chargeDamage: number;
  /** Seconds the player gets to press. Shown by the UI, enforced by it too. */
  readonly chargeSeconds: number;
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
  shattersDefense: false,
  successChance: 1,
  instantDeathChance: 0,
  conditions: [],
  restoreMp: 0,
  transfersDebuffs: false,
  heal: 0,
  chargeDamage: 0,
  chargeSeconds: 0,
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

/**
 * How each move behaves.
 *
 * Only the moves whose numbers the spec actually states are implemented. The
 * rest are listed as pending with the question that blocks them, so nothing
 * here is a guess and the open list is visible rather than buried.
 */
const T = DEFAULT_BATTLE_CONFIG.statusTurns;
const P = DEFAULT_BATTLE_CONFIG.powerSteps;
const FLINCH = DEFAULT_BATTLE_CONFIG.flinchChance;

/** The spec's 「バインド確率60%」, from config so it stays adjustable. */
const BIND_CHANCE = DEFAULT_BATTLE_CONFIG.bindChance;
/** 「2ターン継続確率20%」: of the binds that land, this share holds on. */
const BIND_EXTEND_CHANCE = DEFAULT_BATTLE_CONFIG.bindExtendChance;

/**
 * How each of the thirty moves behaves.
 *
 * The numbers were settled with the player on 2026-10-27. The power steps and
 * the durations come from config so they stay adjustable; the per-move
 * chances the spec stated are written here beside the move they belong to.
 */
export const MOVE_BEHAVIOURS: Readonly<Record<string, MoveBehavior>> = {
  // --- 尻尾 --------------------------------------------------------------

  // 使用後1ターン動けない／火力を強く（大技の230のまま）。
  // 「５秒間スペースキーを連打させて連打数×２ダメージ／連続で使えない」
  'final-tail': behaviour('final-tail', {
    chargeDamage: 2,
    chargeSeconds: 5,
    noConsecutiveUse: true,
    applies: [{ status: 'recoil', target: 'self', turns: 1, chance: 1 }],
  }),

  // 2回攻撃／威力は弱い／30%で暗闇。弱い技なので砕牙を持たせている。
  'twin-lash': behaviour('twin-lash', {
    hits: 2,
    power: P.one,
    shattersDefense: true,
    applies: [{ status: 'blind', target: 'enemy', turns: T.blind, chance: 0.3 }],
  }),

  // バインド60%。そのうち20%が2ターン続く。
  'bind-whip': behaviour('bind-whip', {
    applies: [
      { status: 'bind', target: 'enemy', turns: T.bind, chance: BIND_CHANCE },
      {
        status: 'bind',
        target: 'enemy',
        turns: T.bindExtended,
        chance: BIND_CHANCE * BIND_EXTEND_CHANCE,
      },
    ],
  }),

  // 相手の技を跳ね返す。連続で打つと成功率が落ちる。
  'tail-sweep': behaviour('tail-sweep', {
    actionMode: 'reflect',
    attacks: false,
    target: 'self',
    repeatSuccessChance: 0.2,
    applies: [{ status: 'reflect', target: 'self', turns: 1, chance: 1 }],
  }),

  // --- 角 ----------------------------------------------------------------

  // 1ターン攻撃力2倍。攻撃も伴う。
  'ram-charge': behaviour('ram-charge', {
    applies: [{ status: 'attackUp', target: 'self', turns: 1, chance: 1, magnitude: 2 }],
  }),

  'impact-horn': behaviour('impact-horn', { piercesDefense: true }),
  'double-gore': behaviour('double-gore', { hits: 2 }),

  // 大ダメージ＋ひるみ。
  'crown-break': behaviour('crown-break', {
    power: P.heavy,
    applies: [{ status: 'flinch', target: 'enemy', turns: T.flinch, chance: FLINCH }],
  }),

  // 防御貫通＋大ダメージ。当たれば強いが6割。
  'single-thrust': behaviour('single-thrust', {
    piercesDefense: true,
    power: P.heavy,
    successChance: 0.6,
  }),

  // --- 翼 ----------------------------------------------------------------

  'wing-cutter': behaviour('wing-cutter', {
    applies: [{ status: 'seed', target: 'enemy', turns: T.seed, chance: 1 }],
  }),

  'dive-attack': behaviour('dive-attack', {
    power: P.heavy,
    applies: [{ status: 'recoil', target: 'self', turns: 1, chance: 1 }],
  }),

  'crystal-shard': behaviour('crystal-shard', { piercesDefense: true }),

  // 20%で即死、外れれば通常のダメージ。
  'soul-wing': behaviour('soul-wing', { instantDeathChance: 0.2 }),

  // --- 口 ----------------------------------------------------------------

  'death-bite': behaviour('death-bite', {
    piercesDefense: true,
    applies: [
      { status: 'bind', target: 'enemy', turns: T.bind, chance: BIND_CHANCE },
      { status: 'poison', target: 'enemy', turns: T.poison, chance: 1 },
    ],
  }),

  // 守っている相手に強い。
  'fang-bite': behaviour('fang-bite', {
    conditions: [{ when: 'targetDefending', factor: 1.2 }],
  }),

  'tusk-rush': behaviour('tusk-rush', {
    piercesDefense: true,
    cleanse: [{ target: 'enemy', polarity: 'buff' }],
  }),

  // 読み合いの技: 守りを狙えば強く、外せば弱い。
  'pierce-beak': behaviour('pierce-beak', {
    conditions: [
      { when: 'targetDefending', factor: 1.6 },
      { when: 'targetNotDefending', factor: 0.5 },
    ],
  }),

  // --- 目 ----------------------------------------------------------------

  'magic-eye': behaviour('magic-eye', {
    applies: [
      { status: 'bind', target: 'enemy', turns: T.bind, chance: BIND_CHANCE },
      { status: 'blind', target: 'enemy', turns: T.blind, chance: 1 },
    ],
  }),

  // 威力は低いが砕牙で通る。MPも戻る。
  'multi-gaze': behaviour('multi-gaze', {
    power: P.one,
    shattersDefense: true,
    restoreMp: 10,
    applies: [{ status: 'evasion', target: 'self', turns: 1, chance: 1, magnitude: 0.1 }],
  }),

  // 次のターン2回攻撃。
  'pierce-gaze': behaviour('pierce-gaze', {
    applies: [{ status: 'doubleStrike', target: 'self', turns: 1, chance: 1 }],
  }),

  // --- 頭飾り ------------------------------------------------------------

  'pollen-burst': behaviour('pollen-burst', {
    applies: [
      { status: 'poison', target: 'enemy', turns: T.poison, chance: 1 },
      { status: 'seed', target: 'enemy', turns: T.seed, chance: 1 },
    ],
  }),

  // 解除のみなので攻撃しない。
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

  // バインド中でも打てる、数少ない切り返し。
  'royal-order': behaviour('royal-order', {
    usableWhileBound: true,
    applies: [
      { status: 'attackUp', target: 'self', turns: 1, chance: 1, magnitude: 2 },
      { status: 'bind', target: 'enemy', turns: T.bind, chance: BIND_CHANCE },
    ],
    cure: [{ target: 'self', statuses: ['poison'] }],
  }),

  // 自分のデバフを相手に移す。威力は低いので砕牙。
  'fin-slash': behaviour('fin-slash', {
    power: P.two,
    shattersDefense: true,
    transfersDebuffs: true,
  }),

  'mane-guard': behaviour('mane-guard', { piercesDefense: true }),

  'antenna-pulse': behaviour('antenna-pulse', {
    applies: [{ status: 'doubleStrike', target: 'self', turns: 1, chance: 1 }],
  }),

  // --- 体型・大きさ ------------------------------------------------------

  // 毒を抱えたまま殴る技。バインドも無視する。
  'power-slam': behaviour('power-slam', {
    power: P.three,
    usableWhileBound: true,
    conditions: [{ when: 'selfPoisoned', factor: 2 }],
  }),

  // 回復のみなので攻撃しない。
  'hydro-ram': behaviour('hydro-ram', {
    actionMode: 'support',
    target: 'self',
    attacks: false,
    heal: 30,
    noConsecutiveUse: true,
  }),

  // 倍率を判定してから解除する。順序を逆にすると2倍が乗らない。
  'coil-crush': behaviour('coil-crush', {
    conditions: [{ when: 'targetBound', factor: 2 }],
    cure: [{ target: 'enemy', statuses: ['bind'] }],
  }),

  'giant-press': behaviour('giant-press', {
    piercesDefense: true,
    power: P.heavy,
    applies: [{ status: 'recoil', target: 'self', turns: 1, chance: 1 }],
  }),
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

/**
 * What a heal of `nominal` is worth in the hands of a given 魔力.
 *
 * The figure in the move's description is what an average healer manages;
 * magic moves it from there, within bounds. Takes the stat rather than a
 * monster so that the battle can ask about a combatant and a UI can ask
 * about a monster, and both get the same answer.
 *
 * Returns the amount before the HP cap is applied - what the move offers,
 * not what the target can take.
 */
export function scaleHeal(
  nominal: number,
  magic: number,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  if (nominal <= 0) return 0;
  const { referenceMagic, perMagic, minRatio, maxRatio } = config.healScaling;
  const scaled = nominal + (magic - referenceMagic) * perMagic;
  const floor = nominal * minRatio;
  const ceiling = nominal * maxRatio;
  return Math.round(Math.min(ceiling, Math.max(floor, scaled)));
}

/**
 * How much `caster` would heal with `skillId`, for a description or a tooltip.
 *
 * Zero for every move that does not heal, so a caller can ask about any move
 * without checking first. The figure is before the HP cap: what the battle
 * reports afterwards is what actually went in, which is smaller near full HP.
 */
export function getMoveHealing(
  skillId: string,
  caster: Monster,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  return scaleHeal(getMoveBehavior(skillId).heal, caster.stats.magic, config);
}

/**
 * Moves still waiting on a decision.
 *
 * Empty since the numbers were settled on 2026-10-27. Kept because the next
 * batch of moves will arrive the same way: defined but unspecified, and the
 * UI should be able to see which ones rather than guessing.
 */
export function pendingMoves(): { skillId: string; question: string }[] {
  return Object.values(MOVE_BEHAVIOURS)
    .filter((move) => !move.specified)
    .map((move) => ({ skillId: move.skillId, question: move.pending ?? '' }));
}

/**
 * The multiplier a move's conditions are worth right now.
 *
 * Read before anything is removed: coil-crush doubles against a bound target
 * and then frees it, so asking afterwards would always find it unbound.
 */
export function conditionMultiplier(
  conditions: readonly ConditionalMultiplier[],
  context: {
    readonly targetDefending: boolean;
    readonly targetStatuses: readonly StatusEffect[];
    readonly selfStatuses: readonly StatusEffect[];
    readonly element?: string;
  },
  /** Filled with a line per condition that fired, for the UI to announce. */
  found?: DamageBoost[],
): number {
  let factor = 1;
  const note = (source: DamageBoost['source'], value: number): void => {
    found?.push({ source, reason: BOOST_REASONS[source], factor: value });
  };
  for (const condition of conditions) {
    switch (condition.when) {
      case 'targetDefending':
        if (context.targetDefending) {
          factor *= condition.factor;
          note('targetDefending', condition.factor);
        }
        break;
      case 'targetNotDefending':
        if (!context.targetDefending) {
          factor *= condition.factor;
          note('targetNotDefending', condition.factor);
        }
        break;
      case 'targetBound':
        if (hasStatus(context.targetStatuses, 'bind')) {
          factor *= condition.factor;
          note('targetBound', condition.factor);
        }
        break;
      case 'selfPoisoned':
        if (hasStatus(context.selfStatuses, 'poison')) {
          factor *= condition.factor;
          note('selfPoisoned', condition.factor);
        }
        break;
      case 'targetSeeded':
        if (
          hasStatus(context.targetStatuses, 'seed') &&
          (!condition.element || condition.element === context.element)
        ) {
          factor *= condition.factor;
          note('seed', condition.factor);
        }
        break;
    }
  }
  return factor;
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
  if (hasStatus(statuses, 'flinch')) return 'flinch';
  if (hasStatus(statuses, 'bind')) return 'bind';
  return null;
}
