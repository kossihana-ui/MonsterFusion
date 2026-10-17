/**
 * All tunable numbers live here.
 *
 * Nothing in the core hard-codes a probability or a coefficient: every module
 * takes a config object, and `create*Config(overrides)` lets a caller (or a
 * balance test) change one value without restating the rest.
 */

import type {
  BodyColor,
  BodyShape,
  BodySize,
  CategoricalLocus,
  Element,
  EyeType,
  HornType,
  MonsterStats,
  NumericLocus,
  TailType,
  WingType,
} from '../shared/types.ts';

// ---------------------------------------------------------------------------
// Genetics
// ---------------------------------------------------------------------------

/** The allele values each categorical locus can hold. */
export interface AllelePools {
  bodyColor: readonly BodyColor[];
  bodyShape: readonly BodyShape[];
  size: readonly BodySize[];
  horns: readonly HornType[];
  wings: readonly WingType[];
  tail: readonly TailType[];
  eyes: readonly EyeType[];
  element: readonly Element[];
}

export interface GeneticsConfig {
  /** Probability a locus mutates when a child is created. */
  readonly mutationRate: number;
  /**
   * Probability that, instead of one of a parent's two active alleles, the
   * parent passes down its hidden carrier. This is what makes a trait skip a
   * generation and reappear later.
   */
  readonly atavismRate: number;
  /**
   * Probability a numeric locus is inherited as a blend of both parents rather
   * than by picking one parent's allele outright.
   */
  readonly numericBlendRate: number;
  /** Max absolute drift applied to a mutated numeric allele (in 0..100 units). */
  readonly numericMutationDelta: number;
  /** Max absolute jitter applied to a blended numeric allele. */
  readonly numericBlendJitter: number;
  /** Inclusive dominance range for a freshly rolled allele. */
  readonly dominanceRange: readonly [number, number];
  /** Dominance drift applied when an allele mutates. */
  readonly dominanceMutationDelta: number;
  /**
   * When two expressed candidates are within this dominance distance, the
   * locus is treated as co-dominant: categorical loci coin-flip, numeric loci
   * average. This is the "parents' features mix" rule.
   */
  readonly codominanceThreshold: number;
  /** Numeric allele clamp. Keeps tendencies from running away over generations. */
  readonly numericRange: readonly [number, number];
  readonly pools: AllelePools;
}

export const DEFAULT_ALLELE_POOLS: AllelePools = {
  bodyColor: ['red', 'blue', 'green', 'yellow', 'purple', 'white', 'black'],
  bodyShape: ['slim', 'round', 'muscular', 'serpentine', 'winged'],
  size: ['tiny', 'small', 'medium', 'large', 'giant'],
  horns: ['none', 'single', 'twin', 'crown', 'spiral'],
  wings: ['none', 'feathered', 'membrane', 'crystal', 'ethereal'],
  tail: ['none', 'short', 'long', 'spiked', 'twin'],
  eyes: ['normal', 'sharp', 'round', 'multi', 'glowing'],
  element: ['neutral', 'fire', 'water', 'earth', 'wind', 'light', 'dark'],
};

export const DEFAULT_GENETICS_CONFIG: GeneticsConfig = {
  mutationRate: 0.05,
  atavismRate: 0.12,
  numericBlendRate: 0.6,
  numericMutationDelta: 12,
  numericBlendJitter: 4,
  dominanceRange: [0.1, 0.9],
  dominanceMutationDelta: 0.2,
  codominanceThreshold: 0.08,
  numericRange: [0, 100],
  pools: DEFAULT_ALLELE_POOLS,
};

export function createGeneticsConfig(
  overrides: Partial<GeneticsConfig> = {},
): GeneticsConfig {
  return {
    ...DEFAULT_GENETICS_CONFIG,
    ...overrides,
    pools: { ...DEFAULT_GENETICS_CONFIG.pools, ...(overrides.pools ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** How much a single appearance locus can push each stat. */
export type VisualStatModifiers = Partial<Record<StatModifierKey, number>>;
type StatModifierKey = keyof MonsterStats;

export interface StatsConfig {
  /** Floor every monster starts from before any modifier. */
  readonly base: MonsterStats;
  /** Weight applied to the matching 0..100 tendency gene. */
  readonly tendencyWeight: Record<NumericLocus, Partial<MonsterStats>>;
  /** Per-appearance-value stat nudges, keyed locus -> allele value. */
  readonly visual: Partial<Record<CategoricalLocus, Record<string, VisualStatModifiers>>>;
  /** Flat bonus per mutated locus, before caps. */
  readonly mutationBonus: Partial<MonsterStats>;
  /** How many mutations are counted at most, so mutations cannot stack forever. */
  readonly mutationBonusCap: number;
  /** Hard per-stat ceiling. No monster can exceed this, ever. */
  readonly statCap: MonsterStats;
  /** Hard ceiling on hp + attack + defense + magic + speed. */
  readonly totalCap: number;
  /**
   * Fraction of the per-stat cap at which growth starts to compress. Above it,
   * extra points are discounted asymptotically, so each generation buys less.
   */
  readonly softCapRatio: number;
}

export const DEFAULT_STATS_CONFIG: StatsConfig = {
  base: { hp: 60, attack: 20, defense: 20, magic: 20, speed: 20 },
  tendencyWeight: {
    attackTendency: { attack: 0.9, hp: 0.2 },
    defenseTendency: { defense: 0.9, hp: 0.5 },
    magicTendency: { magic: 0.9 },
    speedTendency: { speed: 0.9 },
  },
  visual: {
    size: {
      tiny: { hp: -15, defense: -5, speed: 12 },
      small: { hp: -7, speed: 6 },
      medium: {},
      large: { hp: 10, attack: 5, speed: -6 },
      giant: { hp: 20, attack: 9, defense: 5, speed: -12 },
    },
    bodyShape: {
      slim: { speed: 8, defense: -4 },
      round: { hp: 8, defense: 4, speed: -4 },
      muscular: { attack: 10, defense: 4, magic: -6 },
      serpentine: { speed: 5, magic: 4, defense: -3 },
      winged: { speed: 10, hp: -5 },
    },
    horns: {
      none: {},
      single: { attack: 4 },
      twin: { attack: 7 },
      crown: { attack: 5, magic: 6 },
      spiral: { magic: 9 },
    },
    wings: {
      none: {},
      feathered: { speed: 8 },
      membrane: { speed: 6, attack: 3 },
      crystal: { speed: 4, defense: 6 },
      ethereal: { speed: 7, magic: 8 },
    },
    tail: {
      none: {},
      short: { defense: 2 },
      long: { speed: 4 },
      spiked: { attack: 6 },
      twin: { speed: 3, magic: 4 },
    },
    eyes: {
      normal: {},
      sharp: { attack: 5 },
      round: { hp: 4 },
      multi: { magic: 5, speed: 3 },
      glowing: { magic: 8 },
    },
    element: {
      neutral: { hp: 6 },
      fire: { attack: 7, defense: -3 },
      water: { magic: 5, defense: 3 },
      earth: { defense: 9, speed: -5 },
      wind: { speed: 9, hp: -4 },
      light: { magic: 7, hp: 3 },
      dark: { attack: 5, magic: 5, hp: -5 },
    },
  },
  mutationBonus: { hp: 4, attack: 2, defense: 2, magic: 2, speed: 2 },
  mutationBonusCap: 3,
  statCap: { hp: 300, attack: 150, defense: 150, magic: 150, speed: 150 },
  totalCap: 700,
  softCapRatio: 0.75,
};

export function createStatsConfig(overrides: Partial<StatsConfig> = {}): StatsConfig {
  return { ...DEFAULT_STATS_CONFIG, ...overrides };
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

export interface FusionConfig {
  /**
   * How many fusion records a monster carries. Bounded on purpose: this is the
   * only reason a monster's size could grow with its generation.
   */
  readonly historyLimit: number;
  /** Syllables used to name a fused monster. */
  readonly nameSyllables: readonly string[];
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  historyLimit: 8,
  nameSyllables: [
    'ga', 'ru', 'do', 'za', 'mi', 'ne', 'vo', 'ky', 'ra', 'su',
    'bel', 'dra', 'nox', 'lum', 'fer', 'tis',
  ],
};

export function createFusionConfig(overrides: Partial<FusionConfig> = {}): FusionConfig {
  return { ...DEFAULT_FUSION_CONFIG, ...overrides };
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export interface BattleConfig {
  /** Base chance of a critical hit, before the speed bonus. */
  readonly criticalChance: number;
  /** Extra crit chance per point of speed advantage over the target. */
  readonly criticalChancePerSpeed: number;
  readonly criticalChanceCap: number;
  readonly criticalMultiplier: number;
  /** Incoming damage is multiplied by this while defending. */
  readonly defendDamageMultiplier: number;
  /** Random damage spread, e.g. 0.1 means 0.9x..1.1x. */
  readonly damageVariance: number;
  /** Minimum damage a connecting hit deals. */
  readonly minimumDamage: number;
  /** Scales the attack-vs-defense curve. */
  readonly defenseScale: number;
  /** Turn limit; a battle that reaches it ends in a draw-by-hp comparison. */
  readonly maxTurns: number;
  /** MP every combatant starts with, and regain per turn. */
  readonly startingMp: number;
  readonly mpRegenPerTurn: number;
  /** element -> element -> damage multiplier. Missing pairs are 1. */
  readonly elementChart: Partial<Record<Element, Partial<Record<Element, number>>>>;
}

export const DEFAULT_BATTLE_CONFIG: BattleConfig = {
  criticalChance: 0.06,
  criticalChancePerSpeed: 0.002,
  criticalChanceCap: 0.35,
  criticalMultiplier: 1.6,
  defendDamageMultiplier: 0.45,
  damageVariance: 0.1,
  minimumDamage: 1,
  defenseScale: 1,
  maxTurns: 200,
  startingMp: 20,
  mpRegenPerTurn: 3,
  elementChart: {
    fire: { water: 0.7, wind: 1.3, earth: 1.0 },
    water: { fire: 1.3, earth: 1.3, wind: 0.7 },
    earth: { wind: 1.3, water: 0.7, fire: 1.0 },
    wind: { earth: 0.7, fire: 0.7, water: 1.3 },
    light: { dark: 1.4, light: 0.6 },
    dark: { light: 1.4, dark: 0.6 },
  },
};

export function createBattleConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { ...DEFAULT_BATTLE_CONFIG, ...overrides };
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/** Everything the core needs, in one object a UI can hold and tweak. */
export interface GameConfig {
  readonly genetics: GeneticsConfig;
  readonly stats: StatsConfig;
  readonly fusion: FusionConfig;
  readonly battle: BattleConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  genetics: DEFAULT_GENETICS_CONFIG,
  stats: DEFAULT_STATS_CONFIG,
  fusion: DEFAULT_FUSION_CONFIG,
  battle: DEFAULT_BATTLE_CONFIG,
};

/** Partial overrides, nested one level deep. */
export interface GameConfigOverrides {
  readonly genetics?: Partial<GeneticsConfig>;
  readonly stats?: Partial<StatsConfig>;
  readonly fusion?: Partial<FusionConfig>;
  readonly battle?: Partial<BattleConfig>;
}

export function createGameConfig(overrides: GameConfigOverrides = {}): GameConfig {
  return {
    genetics: createGeneticsConfig(overrides.genetics ?? {}),
    stats: createStatsConfig(overrides.stats ?? {}),
    fusion: createFusionConfig(overrides.fusion ?? {}),
    battle: createBattleConfig(overrides.battle ?? {}),
  };
}
