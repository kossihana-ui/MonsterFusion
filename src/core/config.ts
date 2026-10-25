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
  CrestType,
  Element,
  EyeType,
  HornType,
  JawType,
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
  crest: readonly CrestType[];
  jaw: readonly JawType[];
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
  bodyShape: ['slim', 'round', 'muscular', 'serpentine', 'winged', 'finned'],
  size: ['tiny', 'small', 'medium', 'large', 'giant'],
  horns: ['none', 'single', 'twin', 'crown', 'spiral', 'upright'],
  wings: ['none', 'feathered', 'membrane', 'crystal', 'ethereal'],
  tail: ['none', 'short', 'long', 'spiked', 'twin', 'vine'],
  eyes: ['normal', 'sharp', 'round', 'multi', 'glowing', 'slit'],
  crest: ['none', 'flower', 'fin', 'crystal', 'mane', 'antenna', 'crown'],
  jaw: ['normal', 'fangs', 'tusks', 'beak', 'maw'],
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
  /**
   * How much every cap rises per evolution tier, so a larger body is not
   * immediately swallowed by the ceiling. The total raise is bounded by
   * `FusionConfig.maxTier`.
   */
  readonly tierCapBonus: number;
  /**
   * How much stronger each evolution tier is, before caps. This is the ramp
   * the player actually feels; the cap bonus above only makes room for it.
   */
  readonly tierStatBonus: number;
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
      finned: { speed: 7, magic: 3, defense: -2 },
    },
    horns: {
      none: {},
      single: { attack: 4 },
      twin: { attack: 7 },
      crown: { attack: 5, magic: 6 },
      spiral: { magic: 9 },
      upright: { attack: 8, defense: 2 },
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
      vine: { magic: 5, hp: 2 },
    },
    eyes: {
      normal: {},
      sharp: { attack: 5 },
      round: { hp: 4 },
      multi: { magic: 5, speed: 3 },
      glowing: { magic: 8 },
      slit: { hp: 3, defense: 3 },
    },
    crest: {
      none: {},
      flower: { magic: 7, hp: 3 },
      fin: { speed: 5 },
      crystal: { defense: 6, magic: 3 },
      mane: { attack: 5, hp: 3 },
      antenna: { magic: 6, speed: 2 },
      crown: { hp: 5, attack: 4, defense: 4, magic: 4 },
    },
    jaw: {
      normal: {},
      fangs: { attack: 5 },
      tusks: { attack: 7, speed: -2 },
      beak: { attack: 4, speed: 2 },
      maw: { attack: 9, defense: -3 },
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
  tierCapBonus: 0.12,
  tierStatBonus: 0.12,
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
  /**
   * Share of appearance loci two parents must share for the fusion to be an
   * evolution rather than an ordinary cross. 0.7 means 7 of the 10 loci.
   */
  readonly evolveThreshold: number;
  /**
   * Hard ceiling on the evolution rank. The size ladder imposes its own limit
   * as well: a monster that is already `giant` has nowhere left to grow.
   */
  readonly maxTier: number;
  /**
   * Optional: force the crest of an evolved monster, by tier.
   *
   * Empty by default, and deliberately so. Overwriting the crest erases a
   * species' signature feature - an evolved Moss would lose the flower that
   * makes it a Moss. Rank is carried by `Monster.tier` instead, which the UI
   * renders as an insignia over the inherited look.
   */
  readonly crestLadder: readonly CrestType[];
  /** Title prefixed to an evolved monster's name, by tier. */
  readonly tierTitles: readonly string[];
}

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  historyLimit: 8,
  evolveThreshold: 0.7,
  maxTier: 3,
  crestLadder: [],
  tierTitles: ['', 'Great', 'King', 'Emperor'],
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
  /**
   * Extra crit chance per point of speed advantage over the target.
   *
   * Kept small on purpose. Speed already buys the first move; letting it also
   * buy critical hits made it the only stat that mattered.
   */
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
  /**
   * How much the unused offensive stat still contributes.
   *
   * A skill scales off attack or magic, so at 0 every point in the other one
   * is dead weight - and a monster's total stops predicting its strength. A
   * fused monster could beat its parents on paper and lose to them, because
   * its gains landed in the stat its skills do not read. At 0.25 the off-hand
   * stat still counts for something, without erasing the difference between a
   * brawler and a caster.
   */
  readonly offhandFactor: number;
  /**
   * Overall damage multiplier: the pacing dial.
   *
   * At 1 an even fight was over in two turns, which left no room to guard, to
   * read a matchup or to spend a skill - the speed stat decided it, because
   * acting first was most of the battle. Lower means more turns.
   */
  readonly damageScale: number;
  /** MP a combatant regains for spending its turn guarding. */
  readonly defendMpBonus: number;
  /**
   * How much a turn order roll wanders, as a fraction of speed.
   *
   * At 0 the faster monster always moves first, which made one stat decide
   * the battle. At 0.25 a ten-point edge is a strong lean rather than a
   * certainty, so a slower monster can still open - and guarding becomes a
   * read rather than a formality.
   */
  readonly initiativeVariance: number;
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
  criticalChancePerSpeed: 0.0008,
  criticalChanceCap: 0.2,
  criticalMultiplier: 1.6,
  defendDamageMultiplier: 0.45,
  damageVariance: 0.1,
  minimumDamage: 1,
  defenseScale: 1,
  offhandFactor: 0.25,
  damageScale: 0.2,
  defendMpBonus: 4,
  initiativeVariance: 0.25,
  maxTurns: 200,
  startingMp: 20,
  mpRegenPerTurn: 3,
  // Advantage compounds: a monster that deals 1.3x while taking 0.7x is at
  // nearly twice the strength of its counter, which made one starter beat
  // another 98 times in 100. These are deliberately milder than they look -
  // 1.25 and 0.8 still read clearly in play and still decide close fights.
  elementChart: {
    fire: { water: 0.8, wind: 1.25, earth: 1.0 },
    water: { fire: 1.25, earth: 1.25, wind: 0.8 },
    earth: { wind: 1.25, water: 0.8, fire: 1.0 },
    wind: { earth: 0.8, fire: 0.8, water: 1.25 },
    light: { dark: 1.35, light: 0.7 },
    dark: { light: 1.35, dark: 0.7 },
  },
};

export function createBattleConfig(overrides: Partial<BattleConfig> = {}): BattleConfig {
  return { ...DEFAULT_BATTLE_CONFIG, ...overrides };
}

// ---------------------------------------------------------------------------
// Gene graft
// ---------------------------------------------------------------------------

/**
 * Gene grafting: slipping a recessive allele into a monster's carrier slot.
 *
 * The grafted allele always lands in `hidden`, which is never expressed, so a
 * graft changes neither the look nor the stats of the monster it is applied
 * to. What it changes is the lineage: the carrier can be passed on (see
 * `atavismRate`) and surface in a descendant several generations later.
 *
 * Because nothing is expressed at graft time, these numbers cannot shift the
 * balance of the monster being grafted. They only decide how deeply the gene
 * is buried, and therefore how long it tends to stay latent.
 */
export interface GraftConfig {
  /**
   * Inclusive dominance range for a grafted allele. Deliberately below
   * `GeneticsConfig.dominanceRange` so the gene is recessive against the
   * alleles it will eventually meet.
   */
  readonly dominanceRange: readonly [number, number];
  /**
   * How far below the locus' weakest existing allele the graft is forced. This
   * is what guarantees the graft is recessive even at a locus that happens to
   * be weakly dominant already.
   */
  readonly recessiveMargin: number;
  /** How many loci a single graft touches. */
  readonly lociPerGraft: number;
  /** Whether ability-tendency loci are eligible for a random graft. */
  readonly includeNumericLoci: boolean;
}

export const DEFAULT_GRAFT_CONFIG: GraftConfig = {
  dominanceRange: [0.02, 0.2],
  recessiveMargin: 0.02,
  lociPerGraft: 1,
  includeNumericLoci: false,
};

export function createGraftConfig(overrides: Partial<GraftConfig> = {}): GraftConfig {
  return { ...DEFAULT_GRAFT_CONFIG, ...overrides };
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
  readonly graft: GraftConfig;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  genetics: DEFAULT_GENETICS_CONFIG,
  stats: DEFAULT_STATS_CONFIG,
  fusion: DEFAULT_FUSION_CONFIG,
  battle: DEFAULT_BATTLE_CONFIG,
  graft: DEFAULT_GRAFT_CONFIG,
};

/** Partial overrides, nested one level deep. */
export interface GameConfigOverrides {
  readonly genetics?: Partial<GeneticsConfig>;
  readonly stats?: Partial<StatsConfig>;
  readonly fusion?: Partial<FusionConfig>;
  readonly battle?: Partial<BattleConfig>;
  readonly graft?: Partial<GraftConfig>;
}

export function createGameConfig(overrides: GameConfigOverrides = {}): GameConfig {
  return {
    genetics: createGeneticsConfig(overrides.genetics ?? {}),
    stats: createStatsConfig(overrides.stats ?? {}),
    fusion: createFusionConfig(overrides.fusion ?? {}),
    battle: createBattleConfig(overrides.battle ?? {}),
    graft: createGraftConfig(overrides.graft ?? {}),
  };
}
