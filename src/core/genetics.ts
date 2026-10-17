/**
 * Genetics: how genes are rolled, inherited and expressed.
 *
 * Model: every locus is diploid (`a`, `b`) plus one `hidden` carrier slot.
 *
 * - Dominant / recessive: the allele with the higher `dominance` is expressed;
 *   the other is still carried and can be expressed in a descendant.
 * - Hidden gene: `hidden` is never expressed, only passed on.
 * - Atavism: with `atavismRate`, a parent passes its `hidden` allele instead
 *   of an active one, so a trait can skip generations and come back.
 * - Mixing: when two candidates are nearly equal in dominance they are
 *   co-dominant (categorical: coin flip, numeric: average).
 * - Mutation: with `mutationRate` a locus is re-rolled or drifted.
 * - Ability tendencies are numeric loci, inherited with optional blending, so
 *   tendencies regress toward the parents' mean instead of inflating.
 *
 * Every function here is pure apart from consuming the injected `Random`.
 */

import type {
  Allele,
  CategoricalLocus,
  GenePair,
  MonsterGenes,
  MonsterPhenotype,
  MonsterTrait,
  MonsterVisualAnalysis,
  NumericLocus,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../shared/types.ts';
import type { GeneticsConfig } from './config.ts';
import { DEFAULT_GENETICS_CONFIG } from './config.ts';
import type { Random } from './random.ts';
import { chance, nextFloat, pick } from './random.ts';
import { clamp, roundTo } from './util.ts';

// Loose aliases used inside this module. The exported signatures stay strict;
// the casts are confined to the per-locus plumbing below.
type AnyAllele = Allele<unknown>;
type AnyPair = GenePair<unknown>;
type LooseGenes = Record<string, AnyPair>;

function poolFor(config: GeneticsConfig, locus: CategoricalLocus): readonly unknown[] {
  return config.pools[locus] as readonly unknown[];
}

function rollDominance(rng: Random, config: GeneticsConfig): number {
  const [lo, hi] = config.dominanceRange;
  return roundTo(nextFloat(rng, lo, hi), 4);
}

function clampNumeric(value: number, config: GeneticsConfig): number {
  const [lo, hi] = config.numericRange;
  return roundTo(clamp(value, lo, hi), 2);
}

function copyAllele<T>(allele: Allele<T>): Allele<T> {
  return { value: allele.value, dominance: allele.dominance };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Rolls a complete random genome. Used for root (generation 0) monsters. */
export function createRandomGenes(
  rng: Random,
  config: GeneticsConfig = DEFAULT_GENETICS_CONFIG,
): MonsterGenes {
  const genes: LooseGenes = {};

  for (const locus of CATEGORICAL_LOCI) {
    const pool = poolFor(config, locus);
    genes[locus] = {
      a: { value: pick(rng, pool), dominance: rollDominance(rng, config) },
      b: { value: pick(rng, pool), dominance: rollDominance(rng, config) },
      hidden: { value: pick(rng, pool), dominance: rollDominance(rng, config) },
    };
  }

  for (const locus of NUMERIC_LOCI) {
    const [lo, hi] = config.numericRange;
    genes[locus] = {
      a: { value: clampNumeric(nextFloat(rng, lo, hi), config), dominance: rollDominance(rng, config) },
      b: { value: clampNumeric(nextFloat(rng, lo, hi), config), dominance: rollDominance(rng, config) },
      hidden: {
        value: clampNumeric(nextFloat(rng, lo, hi), config),
        dominance: rollDominance(rng, config),
      },
    };
  }

  return genes as unknown as MonsterGenes;
}

/**
 * Builds a genome whose expressed appearance matches a visual analysis.
 *
 * The analysed value is placed as the dominant allele; the recessive slot and
 * the carrier stay random, so a monster created from an image still has hidden
 * variety to pass on. Ability tendencies are not visible in an image, so they
 * are rolled.
 */
export function createGenesFromAnalysis(
  analysis: MonsterVisualAnalysis,
  rng: Random,
  config: GeneticsConfig = DEFAULT_GENETICS_CONFIG,
): MonsterGenes {
  const genes = createRandomGenes(rng, config) as unknown as LooseGenes;
  const [, domHi] = config.dominanceRange;

  for (const locus of CATEGORICAL_LOCI) {
    const observed = (analysis as unknown as Record<string, unknown>)[locus];
    if (observed === undefined) continue;
    const pair = genes[locus] as AnyPair;
    // Dominant enough to beat a randomly rolled partner, and clear of the
    // co-dominance band so the analysed look is what actually shows.
    pair.a = { value: observed, dominance: domHi };
    pair.b.dominance = Math.min(pair.b.dominance, domHi - config.codominanceThreshold - 0.01);
  }

  return genes as unknown as MonsterGenes;
}

// ---------------------------------------------------------------------------
// Expression
// ---------------------------------------------------------------------------

/**
 * Derives the phenotype from a genome.
 *
 * `rng` is only consumed to break co-dominant categorical ties, so a monster's
 * phenotype is computed once at creation and then stored on the monster.
 */
export function expressGenes(
  genes: MonsterGenes,
  rng: Random,
  config: GeneticsConfig = DEFAULT_GENETICS_CONFIG,
): MonsterPhenotype {
  const loose = genes as unknown as LooseGenes;
  const phenotype: Record<string, unknown> = {};

  for (const locus of CATEGORICAL_LOCI) {
    const pair = loose[locus] as AnyPair;
    const gap = Math.abs(pair.a.dominance - pair.b.dominance);
    if (gap <= config.codominanceThreshold) {
      phenotype[locus] = chance(rng, 0.5) ? pair.a.value : pair.b.value;
    } else {
      phenotype[locus] = pair.a.dominance > pair.b.dominance ? pair.a.value : pair.b.value;
    }
  }

  for (const locus of NUMERIC_LOCI) {
    const pair = loose[locus] as GenePair<number>;
    const gap = Math.abs(pair.a.dominance - pair.b.dominance);
    if (gap <= config.codominanceThreshold) {
      phenotype[locus] = clampNumeric((pair.a.value + pair.b.value) / 2, config);
    } else {
      const dominant = pair.a.dominance > pair.b.dominance ? pair.a : pair.b;
      const recessive = pair.a.dominance > pair.b.dominance ? pair.b : pair.a;
      // Partial penetrance: the dominant allele leads but the recessive one
      // still tints the result, which is how parents' tendencies blend.
      phenotype[locus] = clampNumeric(dominant.value * 0.75 + recessive.value * 0.25, config);
    }
  }

  return phenotype as unknown as MonsterPhenotype;
}

/** True when `locus` carries `value` without expressing it. */
export function isCarrier<L extends CategoricalLocus>(
  genes: MonsterGenes,
  locus: L,
  value: unknown,
  phenotype: MonsterPhenotype,
): boolean {
  const pair = (genes as unknown as LooseGenes)[locus] as AnyPair;
  const expressed = (phenotype as unknown as Record<string, unknown>)[locus];
  if (expressed === value) return false;
  return pair.a.value === value || pair.b.value === value || pair.hidden?.value === value;
}

/** Every allele value present at a locus, expressed or not. */
export function allelesAt(genes: MonsterGenes, locus: NumericLocus | CategoricalLocus): unknown[] {
  const pair = (genes as unknown as LooseGenes)[locus] as AnyPair;
  const out: unknown[] = [pair.a.value, pair.b.value];
  if (pair.hidden) out.push(pair.hidden.value);
  return out;
}

// ---------------------------------------------------------------------------
// Inheritance
// ---------------------------------------------------------------------------

/**
 * Loci the caller wants to come out at a known value, used by evolution: when
 * two parents already look alike, the shared features are passed on verbatim
 * instead of being re-rolled, which is what makes an evolution predictable.
 */
export interface InheritanceOptions {
  /** locus -> the value the child must express. Mutation is skipped there. */
  readonly locked?: Readonly<Record<string, unknown>>;
}

export interface InheritanceResult {
  readonly genes: MonsterGenes;
  /** How many loci mutated. Feeds the mutation stat bonus and the traits. */
  readonly mutationCount: number;
  readonly mutatedLoci: readonly (CategoricalLocus | NumericLocus)[];
  /** Loci where the child received a parent's hidden carrier (atavism). */
  readonly atavismLoci: readonly (CategoricalLocus | NumericLocus)[];
  /** Loci that were pinned by `InheritanceOptions.locked`. */
  readonly lockedLoci: readonly CategoricalLocus[];
}

/** Picks the gamete a parent contributes at one locus. */
function gameteFrom(
  pair: AnyPair,
  rng: Random,
  config: GeneticsConfig,
): { allele: AnyAllele; fromHidden: boolean } {
  if (pair.hidden && chance(rng, config.atavismRate)) {
    return { allele: copyAllele(pair.hidden), fromHidden: true };
  }
  return { allele: copyAllele(chance(rng, 0.5) ? pair.a : pair.b), fromHidden: false };
}

/**
 * Chooses the child's carrier slot: the least dominant allele the parents did
 * not pass on. Keeping the most recessive candidate is what lets a trait stay
 * latent for several generations before resurfacing.
 */
function carrierFrom(parentA: AnyPair, parentB: AnyPair, passed: readonly AnyAllele[]): AnyAllele | null {
  const candidates: AnyAllele[] = [];
  for (const pair of [parentA, parentB]) {
    for (const allele of [pair.a, pair.b, pair.hidden]) {
      if (!allele) continue;
      const alreadyPassed = passed.some(
        (p) => p.value === allele.value && p.dominance === allele.dominance,
      );
      if (!alreadyPassed) candidates.push(allele);
    }
  }
  if (candidates.length === 0) return null;
  let weakest = candidates[0] as AnyAllele;
  for (const candidate of candidates) {
    if (candidate.dominance < weakest.dominance) weakest = candidate;
  }
  return copyAllele(weakest);
}

function mutateCategorical(allele: AnyAllele, rng: Random, config: GeneticsConfig, locus: CategoricalLocus): void {
  allele.value = pick(rng, poolFor(config, locus));
  const [lo, hi] = config.dominanceRange;
  const drift = nextFloat(rng, -config.dominanceMutationDelta, config.dominanceMutationDelta);
  allele.dominance = roundTo(clamp(allele.dominance + drift, lo, hi), 4);
}

function mutateNumeric(allele: Allele<number>, rng: Random, config: GeneticsConfig): void {
  const drift = nextFloat(rng, -config.numericMutationDelta, config.numericMutationDelta);
  allele.value = clampNumeric(allele.value + drift, config);
  const [lo, hi] = config.dominanceRange;
  const domDrift = nextFloat(rng, -config.dominanceMutationDelta, config.dominanceMutationDelta);
  allele.dominance = roundTo(clamp(allele.dominance + domDrift, lo, hi), 4);
}

/**
 * Produces a child genome from two parent genomes.
 *
 * Data size is constant: the child holds exactly the same number of loci as
 * its parents, three alleles each, regardless of generation.
 */
export function inheritGenes(
  parentAGenes: MonsterGenes,
  parentBGenes: MonsterGenes,
  rng: Random,
  config: GeneticsConfig = DEFAULT_GENETICS_CONFIG,
  options: InheritanceOptions = {},
): InheritanceResult {
  const a = parentAGenes as unknown as LooseGenes;
  const b = parentBGenes as unknown as LooseGenes;
  const child: LooseGenes = {};
  const mutatedLoci: (CategoricalLocus | NumericLocus)[] = [];
  const atavismLoci: (CategoricalLocus | NumericLocus)[] = [];
  const lockedLoci: CategoricalLocus[] = [];
  const locked = options.locked ?? {};
  const [, domHi] = config.dominanceRange;

  for (const locus of CATEGORICAL_LOCI) {
    const pairA = a[locus] as AnyPair;
    const pairB = b[locus] as AnyPair;
    const fromA = gameteFrom(pairA, rng, config);
    const fromB = gameteFrom(pairB, rng, config);
    if (fromA.fromHidden || fromB.fromHidden) atavismLoci.push(locus);

    const pair: AnyPair = {
      a: fromA.allele,
      b: fromB.allele,
      hidden: carrierFrom(pairA, pairB, [fromA.allele, fromB.allele]),
    };

    const lockedValue = locked[locus];
    if (lockedValue !== undefined) {
      // Pin both active alleles so the locus is guaranteed to express, and
      // keep the carrier: the recessive variety is not lost by evolving.
      pair.a = { value: lockedValue, dominance: domHi };
      pair.b = { value: lockedValue, dominance: domHi };
      lockedLoci.push(locus);
      child[locus] = pair;
      continue;
    }

    if (chance(rng, config.mutationRate)) {
      mutateCategorical(chance(rng, 0.5) ? pair.a : pair.b, rng, config, locus);
      mutatedLoci.push(locus);
    }

    child[locus] = pair;
  }

  for (const locus of NUMERIC_LOCI) {
    const pairA = a[locus] as GenePair<number>;
    const pairB = b[locus] as GenePair<number>;
    const fromA = gameteFrom(pairA as AnyPair, rng, config);
    const fromB = gameteFrom(pairB as AnyPair, rng, config);
    if (fromA.fromHidden || fromB.fromHidden) atavismLoci.push(locus);

    const alleleA = fromA.allele as Allele<number>;
    const alleleB = fromB.allele as Allele<number>;

    if (chance(rng, config.numericBlendRate)) {
      // Blended inheritance: both alleles move toward the parental mean, which
      // is what keeps tendencies (and therefore stats) from inflating.
      const mean = (alleleA.value + alleleB.value) / 2;
      const jitter = config.numericBlendJitter;
      alleleA.value = clampNumeric(mean + nextFloat(rng, -jitter, jitter), config);
      alleleB.value = clampNumeric(mean + nextFloat(rng, -jitter, jitter), config);
    }

    const pair: GenePair<number> = {
      a: alleleA,
      b: alleleB,
      hidden: carrierFrom(pairA as AnyPair, pairB as AnyPair, [alleleA, alleleB]) as Allele<number> | null,
    };

    if (chance(rng, config.mutationRate)) {
      mutateNumeric(chance(rng, 0.5) ? pair.a : pair.b, rng, config);
      mutatedLoci.push(locus);
    }

    child[locus] = pair as AnyPair;
  }

  return {
    genes: child as unknown as MonsterGenes,
    mutationCount: mutatedLoci.length,
    mutatedLoci,
    atavismLoci,
    lockedLoci,
  };
}

// ---------------------------------------------------------------------------
// Traits
// ---------------------------------------------------------------------------

/**
 * Derives the trait tags from the expressed phenotype. The set is bounded by
 * the number of rules here, so traits never accumulate across generations.
 */
export function deriveTraits(
  phenotype: MonsterPhenotype,
  mutationCount: number,
  atavismCount = 0,
): MonsterTrait[] {
  const traits: MonsterTrait[] = [];

  if (phenotype.wings !== 'none') traits.push('winged');
  if (phenotype.horns !== 'none') traits.push('horned');
  if (phenotype.tail === 'spiked' || phenotype.tail === 'twin') traits.push('tailed-weapon');
  if (phenotype.eyes === 'glowing' || phenotype.eyes === 'multi') traits.push('keen-sight');
  if (phenotype.crest !== 'none') traits.push('crested');
  if (phenotype.crest === 'crown') traits.push('royal');
  if (phenotype.crest === 'flower' || phenotype.tail === 'vine') traits.push('floral');
  if (phenotype.jaw === 'fangs' || phenotype.jaw === 'tusks' || phenotype.jaw === 'maw') {
    traits.push('fanged');
  }
  if (phenotype.size === 'giant' || phenotype.size === 'large') traits.push('heavyweight');
  if (phenotype.size === 'tiny' || phenotype.size === 'small') traits.push('lightweight');
  if (phenotype.element !== 'neutral') traits.push(`element-${phenotype.element}`);

  const tendencies: Array<[string, number]> = [
    ['brawler', phenotype.attackTendency],
    ['guardian', phenotype.defenseTendency],
    ['caster', phenotype.magicTendency],
    ['swift', phenotype.speedTendency],
  ];
  tendencies.sort((x, y) => y[1] - x[1]);
  const top = tendencies[0];
  if (top && top[1] >= 60) traits.push(top[0]);

  if (mutationCount > 0) traits.push('mutant');
  if (mutationCount >= 3) traits.push('unstable');
  if (atavismCount > 0) traits.push('throwback');

  return traits;
}
