/**
 * Gene grafting: slipping a recessive allele into a monster's carrier slot.
 *
 * A graft writes only to `hidden`. `expressGenes` never looks at `hidden`, so
 * the grafted monster's phenotype, traits and stats are bit-for-bit what they
 * were - a graft cannot change the balance of the monster it is applied to,
 * which is why it needs no cost model of its own.
 *
 * What it does change is the lineage. `inheritGenes` passes a parent's hidden
 * carrier with `atavismRate`, and `carrierFrom` keeps the weakest unpassed
 * allele as the child's carrier - so a deliberately low-dominance graft tends
 * to be handed down latent, generation after generation, until a descendant
 * happens to meet a weaker partner at that locus and the gene finally shows.
 *
 * Every function here is pure: the input monster is never touched, a new one
 * is returned, and all randomness comes from `context.rng`.
 */

import type {
  Allele,
  CategoricalLocus,
  CategoricalLocusValues,
  GeneLocus,
  GenePair,
  Monster,
  MonsterGenes,
  NumericLocus,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../shared/types.ts';
import type { GameConfig } from './config.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';
import type { MonsterContext } from './fusion.ts';
import type { Random } from './random.ts';
import { nextFloat, pick, shuffled } from './random.ts';
import { clamp, roundTo } from './util.ts';

// Same loose aliases genetics.ts uses: the exported signatures stay strict and
// the casts are confined to the per-locus plumbing.
type AnyAllele = Allele<unknown>;
type AnyPair = GenePair<unknown>;
type LooseGenes = Record<string, AnyPair>;

export interface GraftOptions {
  /** How many loci to graft. Defaults to `GraftConfig.lociPerGraft`. */
  readonly count?: number;
  /**
   * Whether numeric ability-tendency loci may be picked. Defaults to
   * `GraftConfig.includeNumericLoci`.
   */
  readonly includeNumeric?: boolean;
  /**
   * Restrict the candidate loci. Useful for a UI item that targets one body
   * part ("a horn gene"). Ignored by `graftGene`, which is already explicit.
   */
  readonly loci?: readonly GeneLocus[];
}

/** What a graft put where, for the UI to report back to the player. */
export interface GraftRecord {
  readonly locus: GeneLocus;
  readonly value: unknown;
  readonly dominance: number;
  /** The carrier that was displaced, or null if the slot was empty. */
  readonly replaced: AnyAllele | null;
}

export interface GraftResult {
  readonly monster: Monster;
  readonly grafts: readonly GraftRecord[];
}

function configOf(context: MonsterContext): GameConfig {
  return context.config ?? DEFAULT_GAME_CONFIG;
}

function cloneGenes(genes: MonsterGenes): LooseGenes {
  const source = genes as unknown as LooseGenes;
  const out: LooseGenes = {};
  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    const pair = source[locus] as AnyPair;
    out[locus] = {
      a: { value: pair.a.value, dominance: pair.a.dominance },
      b: { value: pair.b.value, dominance: pair.b.dominance },
      hidden: pair.hidden
        ? { value: pair.hidden.value, dominance: pair.hidden.dominance }
        : null,
    };
  }
  return out;
}

function isNumericLocus(locus: GeneLocus): locus is NumericLocus {
  return (NUMERIC_LOCI as readonly string[]).includes(locus);
}

/**
 * Dominance for a grafted allele: rolled from the graft range, then forced
 * below the locus' weakest existing allele so the gene really is recessive
 * even where the monster happens to carry weak alleles already.
 */
function graftDominance(pair: AnyPair, rng: Random, config: GameConfig): number {
  const [lo, hi] = config.graft.dominanceRange;
  const rolled = nextFloat(rng, lo, hi);
  const weakest = Math.min(pair.a.dominance, pair.b.dominance);
  const ceiling = weakest - config.graft.recessiveMargin;
  // A locus whose weakest allele is already at the floor leaves no margin, so
  // halve instead. Only a locus sitting at dominance 0 cannot be undercut.
  const dominance = ceiling > 0 ? Math.min(rolled, ceiling) : weakest / 2;
  return roundTo(clamp(dominance, 0, 1), 4);
}

/** Coerces a grafted value into what the locus can hold. */
function normalizeValue(locus: GeneLocus, value: unknown, config: GameConfig): unknown {
  if (!isNumericLocus(locus)) return value;
  const [lo, hi] = config.genetics.numericRange;
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : lo;
  return roundTo(clamp(numeric, lo, hi), 2);
}

/** Writes one allele into a locus' carrier slot, in place, on cloned genes. */
function applyGraft(
  genes: LooseGenes,
  locus: GeneLocus,
  value: unknown,
  rng: Random,
  config: GameConfig,
): GraftRecord {
  const pair = genes[locus] as AnyPair;
  const dominance = graftDominance(pair, rng, config);
  const replaced = pair.hidden;
  pair.hidden = { value: normalizeValue(locus, value, config), dominance };
  return { locus, value: pair.hidden.value, dominance, replaced };
}

/**
 * Rebuilds the monster around a new genome.
 *
 * `phenotype`, `traits`, `stats`, `mutationCount` and the whole identity
 * (id, name, parents, generation, tier, createdAt, history) are carried over
 * untouched: a hidden allele is not expressed, so there is nothing to
 * recompute, and recomputing would only risk re-rolling a co-dominant tie.
 */
function withGenes(monster: Monster, genes: LooseGenes): Monster {
  return { ...monster, genes: genes as unknown as MonsterGenes };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Grafts a known value into one locus' carrier slot.
 *
 * The value is not checked against `AllelePools`: grafting something outside
 * the normal pool is the point of a rare item, and mutation can never produce
 * it, so such a gene is traceable to the graft that introduced it.
 */
export function graftGene<L extends CategoricalLocus>(
  monster: Monster,
  locus: L,
  value: CategoricalLocusValues[L],
  context: MonsterContext,
  options?: GraftOptions,
): Monster;
export function graftGene(
  monster: Monster,
  locus: NumericLocus,
  value: number,
  context: MonsterContext,
  options?: GraftOptions,
): Monster;
export function graftGene(
  monster: Monster,
  locus: GeneLocus,
  value: unknown,
  context: MonsterContext,
  _options: GraftOptions = {},
): Monster {
  return graftGeneDetailed(monster, locus, value, context).monster;
}

/** `graftGene`, plus what was written and what it displaced. */
export function graftGeneDetailed(
  monster: Monster,
  locus: GeneLocus,
  value: unknown,
  context: MonsterContext,
): GraftResult {
  const config = configOf(context);
  const genes = cloneGenes(monster.genes);
  if (!genes[locus]) throw new Error(`graftGene: unknown locus ${String(locus)}`);
  const record = applyGraft(genes, locus, value, context.rng, config);
  return { monster: withGenes(monster, genes), grafts: [record] };
}

/**
 * Grafts randomly chosen values into randomly chosen loci.
 *
 * Both the loci and the values come from `context.rng`, so the same seed
 * yields the same graft.
 */
export function graftRandomRecessive(
  monster: Monster,
  context: MonsterContext,
  options: GraftOptions = {},
): Monster {
  return graftRandomRecessiveDetailed(monster, context, options).monster;
}

/** `graftRandomRecessive`, plus what was written and what it displaced. */
export function graftRandomRecessiveDetailed(
  monster: Monster,
  context: MonsterContext,
  options: GraftOptions = {},
): GraftResult {
  const config = configOf(context);
  const includeNumeric = options.includeNumeric ?? config.graft.includeNumericLoci;
  const pool: GeneLocus[] = options.loci
    ? options.loci.slice()
    : [...CATEGORICAL_LOCI, ...(includeNumeric ? NUMERIC_LOCI : [])];
  if (pool.length === 0) throw new Error('graftRandomRecessive: no candidate loci');

  const requested = options.count ?? config.graft.lociPerGraft;
  const count = Math.max(0, Math.min(Math.trunc(requested), pool.length));
  if (count === 0) return { monster, grafts: [] };

  const genes = cloneGenes(monster.genes);
  const chosen = shuffled(context.rng, pool).slice(0, count);
  const grafts: GraftRecord[] = [];

  for (const locus of chosen) {
    if (!genes[locus]) throw new Error(`graftRandomRecessive: unknown locus ${String(locus)}`);
    const value = isNumericLocus(locus)
      ? nextFloat(context.rng, config.genetics.numericRange[0], config.genetics.numericRange[1])
      : pick(context.rng, config.genetics.pools[locus] as readonly unknown[]);
    grafts.push(applyGraft(genes, locus, value, context.rng, config));
  }

  return { monster: withGenes(monster, genes), grafts };
}
