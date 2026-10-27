/**
 * MonsterFusion shared types.
 *
 * These types are the contract between the game-logic core (src/core) and any
 * UI layer. Nothing here depends on a runtime, a framework or the DOM.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type MonsterId = string;

/** Current on-disk / on-wire schema version for persisted monsters. */
export const SCHEMA_VERSION = 4;

// ---------------------------------------------------------------------------
// Visual / categorical gene vocabulary
// ---------------------------------------------------------------------------

export type BodyColor =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'white'
  | 'black';

export type BodyShape =
  | 'slim'
  | 'round'
  | 'muscular'
  | 'serpentine'
  | 'winged'
  | 'finned';

export type BodySize = 'tiny' | 'small' | 'medium' | 'large' | 'giant';

/** Smallest to largest. Evolution walks this ladder one step at a time. */
export const SIZE_LADDER: readonly BodySize[] = [
  'tiny',
  'small',
  'medium',
  'large',
  'giant',
];

export type HornType =
  | 'none'
  | 'single'
  | 'twin'
  | 'crown'
  | 'spiral'
  /**
   * Horns that sweep straight up, away from the face. The ram horns curl back
   * down past the brow, so they are the one horn that can land on the eyes;
   * this is the big horn that cannot.
   */
  | 'upright';

export type WingType = 'none' | 'feathered' | 'membrane' | 'crystal' | 'ethereal';

export type TailType = 'none' | 'short' | 'long' | 'spiked' | 'twin' | 'vine';

export type EyeType = 'normal' | 'sharp' | 'round' | 'multi' | 'glowing' | 'slit';

/** Head ornament: what sits on top of the head, horns aside. */
export type CrestType =
  | 'none'
  | 'flower'
  | 'fin'
  | 'crystal'
  | 'mane'
  | 'antenna'
  /** The royal crest an evolved monster wears. See `crestLadder` in config. */
  | 'crown';

/** Mouth shape. Drives the bite-oriented stat nudges. */
export type JawType = 'normal' | 'fangs' | 'tusks' | 'beak' | 'maw';

export type Element =
  | 'neutral'
  | 'fire'
  | 'water'
  | 'earth'
  | 'wind'
  | 'light'
  | 'dark';

/** Loci whose allele values are categorical (appearance + element). */
export type CategoricalLocus =
  | 'bodyColor'
  | 'bodyShape'
  | 'size'
  | 'horns'
  | 'wings'
  | 'tail'
  | 'eyes'
  | 'crest'
  | 'jaw'
  | 'element';

/** Loci whose allele values are numeric 0..100 ability tendencies. */
export type NumericLocus =
  | 'attackTendency'
  | 'defenseTendency'
  | 'magicTendency'
  | 'speedTendency';

export type GeneLocus = CategoricalLocus | NumericLocus;

export const CATEGORICAL_LOCI: readonly CategoricalLocus[] = [
  'bodyColor',
  'bodyShape',
  'size',
  'horns',
  'wings',
  'tail',
  'eyes',
  'crest',
  'jaw',
  'element',
];

export const NUMERIC_LOCI: readonly NumericLocus[] = [
  'attackTendency',
  'defenseTendency',
  'magicTendency',
  'speedTendency',
];

/** Maps each categorical locus to the type of its allele value. */
export interface CategoricalLocusValues {
  bodyColor: BodyColor;
  bodyShape: BodyShape;
  size: BodySize;
  horns: HornType;
  wings: WingType;
  tail: TailType;
  eyes: EyeType;
  crest: CrestType;
  jaw: JawType;
  element: Element;
}

// ---------------------------------------------------------------------------
// Genes
// ---------------------------------------------------------------------------

/**
 * One allele. `dominance` decides which of the two alleles at a locus is
 * expressed (higher wins); the loser is still carried and can resurface in a
 * later generation.
 */
export interface Allele<T> {
  value: T;
  /** 0..1. Higher dominance is expressed over lower. */
  dominance: number;
}

/**
 * A diploid locus: two expressed-candidate alleles plus one "hidden" carrier
 * slot. The carrier is never expressed directly but can be passed on, which is
 * what produces atavism.
 */
export interface GenePair<T> {
  a: Allele<T>;
  b: Allele<T>;
  /** Recessive carrier kept out of expression; may be inherited later. */
  hidden: Allele<T> | null;
}

export type CategoricalGenes = {
  [K in CategoricalLocus]: GenePair<CategoricalLocusValues[K]>;
};

export type NumericGenes = {
  [K in NumericLocus]: GenePair<number>;
};

export type MonsterGenes = CategoricalGenes & NumericGenes;

/** The expressed appearance / element of a monster, derived from its genes. */
export interface MonsterPhenotype {
  bodyColor: BodyColor;
  bodyShape: BodyShape;
  size: BodySize;
  horns: HornType;
  wings: WingType;
  tail: TailType;
  eyes: EyeType;
  crest: CrestType;
  jaw: JawType;
  element: Element;
  attackTendency: number;
  defenseTendency: number;
  magicTendency: number;
  speedTendency: number;
}

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

/**
 * A named, bounded tag derived from phenotype/mutation (e.g. "winged",
 * "mutant"). Traits are flat strings so the set stays small and serialisable.
 */
export type MonsterTrait = string;

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface MonsterStats {
  hp: number;
  attack: number;
  defense: number;
  magic: number;
  speed: number;
}

export type StatKey = keyof MonsterStats;

export const STAT_KEYS: readonly StatKey[] = [
  'hp',
  'attack',
  'defense',
  'magic',
  'speed',
];

// ---------------------------------------------------------------------------
// Monster
// ---------------------------------------------------------------------------

/**
 * One entry of the bounded fusion history. Deliberately tiny: it holds ids
 * only, never nested monsters, so a monster never grows with its generation.
 */
export interface FusionRecord {
  childId: MonsterId;
  parentAId: MonsterId;
  parentBId: MonsterId;
  generation: number;
  mutationCount: number;
  createdAt: number;
}

export interface Monster {
  readonly schemaVersion: number;
  readonly id: MonsterId;
  readonly name: string;
  /** null for a root (non-fused) monster. */
  readonly parentAId: MonsterId | null;
  readonly parentBId: MonsterId | null;
  /** 0 for roots; max(parentA, parentB) + 1 for fused monsters. */
  readonly generation: number;
  /**
   * Evolution rank. 0 for an ordinary monster; raised only by fusing two
   * same-rank monsters that are alike enough (see `evolveThreshold`). Higher
   * tiers raise the stat caps and wear a larger body and a crest to match.
   */
  readonly tier: number;
  readonly genes: MonsterGenes;
  readonly phenotype: MonsterPhenotype;
  readonly traits: readonly MonsterTrait[];
  readonly stats: MonsterStats;
  /** Number of loci that mutated when this monster was created. */
  readonly mutationCount: number;
  /**
   * Which loci mutated, so a mutation can be pointed at rather than counted.
   * Bounded by the number of loci, so it does not grow with generation.
   */
  readonly mutatedLoci: readonly GeneLocus[];
  /** Loci where this monster received a parent's hidden carrier. */
  readonly atavismLoci: readonly GeneLocus[];
  readonly createdAt: number;
  /** Most recent fusions on this lineage, capped in length. */
  readonly fusionHistory: readonly FusionRecord[];
}

// ---------------------------------------------------------------------------
// Visual analysis (AI hook)
// ---------------------------------------------------------------------------

export interface MonsterImage {
  /** Opaque image payload: a data URL, a URL, or raw bytes. */
  readonly data: string | Uint8Array;
  readonly mimeType: string;
  readonly width?: number;
  readonly height?: number;
}

/**
 * What an image analyser reports back.
 *
 * Every appearance field is optional: an analysis is partial by nature, and a
 * model that cannot make out a feature should omit it rather than guess. Any
 * omitted locus keeps its randomly rolled allele.
 */
export interface MonsterVisualAnalysis {
  readonly bodyColor?: BodyColor;
  readonly bodyShape?: BodyShape;
  readonly size?: BodySize;
  readonly horns?: HornType;
  readonly wings?: WingType;
  readonly tail?: TailType;
  readonly eyes?: EyeType;
  readonly crest?: CrestType;
  readonly jaw?: JawType;
  readonly element?: Element;
  /** 0..1 overall confidence of the analysis. */
  readonly confidence: number;
  readonly notes?: string;
}

export interface MonsterAnalyzer {
  analyze(image: MonsterImage): Promise<MonsterVisualAnalysis>;
}

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export type BattleActionKind = 'attack' | 'defend' | 'skill';

export interface BattleAction {
  readonly kind: BattleActionKind;
  /** Combatant id being targeted. Ignored by `defend`. */
  readonly targetId?: string;
  /** Skill id for `kind: 'skill'`. */
  readonly skillId?: string;
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly power: number;
  /** Which stat scales the damage. */
  readonly scaling: 'attack' | 'magic';
  readonly element: Element;
  readonly cost: number;
}

/** A monster instantiated into a battle, with mutable per-battle state. */
export interface Combatant {
  readonly id: string;
  readonly monsterId: MonsterId;
  readonly name: string;
  /** Which side of the field. 0 and 1 for a 1v1 or a team battle. */
  readonly side: number;
  readonly maxHp: number;
  hp: number;
  mp: number;
  readonly stats: MonsterStats;
  readonly element: Element;
  readonly skills: readonly Skill[];
  /** Set for the turn when the combatant defends. */
  defending: boolean;
  /** Ongoing effects: bind, poison, a buff. Empty for an untouched monster. */
  statuses: import('../core/effects.ts').StatusEffect[];
  /** The move used last turn, for the moves that cannot repeat. */
  lastSkillId?: string;
}

export interface BattleLogEntry {
  readonly turn: number;
  readonly actorId: string;
  readonly kind: BattleActionKind | 'faint' | 'start' | 'end' | 'status';
  readonly targetId?: string;
  readonly damage?: number;
  readonly critical?: boolean;
  /** The skill used, so the UI can name it without parsing the message. */
  readonly skillId?: string;
  /** Element matchup applied to this hit. 1 when neither resists nor is weak. */
  readonly elementMultiplier?: number;
  /** Damage the target's guard absorbed. 0 when it was not defending. */
  readonly mitigated?: number;
  /** MP the actor spent. */
  readonly mpSpent?: number;
  /**
   * Everything that happened, in order, for the UI to replay.
   *
   * A heal, a removal or a status is reported here rather than left for the
   * UI to work out from the state it had before.
   */
  readonly effects?: readonly import('../core/effects.ts').BattleEffectEvent[];
  /**
   * English sentence describing the entry. The UI is expected to build its own
   * text from the fields above; this is a fallback and a debugging aid.
   */
  readonly message: string;
}

export type BattleOutcome =
  | { readonly status: 'ongoing' }
  | { readonly status: 'win'; readonly winningSide: number }
  | { readonly status: 'draw' };

export interface BattleState {
  readonly combatants: readonly Combatant[];
  readonly turn: number;
  readonly log: readonly BattleLogEntry[];
  readonly outcome: BattleOutcome;
}

/** Chooses an action for a combatant. Swap in a UI-driven or AI policy. */
export interface BattlePolicy {
  chooseAction(actor: Combatant, state: BattleState): BattleAction;
}
