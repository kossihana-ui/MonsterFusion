/**
 * Fusion: building monsters, and combining any two of them into a child that
 * can itself be fused again, without limit.
 *
 * The key property is that a monster's serialised size is independent of its
 * generation. A child stores:
 *
 *   - its two parent ids (not the parents),
 *   - its generation number,
 *   - its own genes / phenotype / traits / stats,
 *   - a fusion history capped at `config.fusion.historyLimit` entries.
 *
 * Nothing holds a reference to a parent object, so there are no object cycles
 * and no retained ancestor graph. Because a child always gets a fresh id and
 * `generation = max(parents) + 1`, the ancestry relation is a DAG by
 * construction: a monster can never become its own ancestor.
 */

import type {
  GeneLocus,
  Monster,
  MonsterGenes,
  MonsterId,
  MonsterPhenotype,
  MonsterStats,
  MonsterTrait,
  MonsterVisualAnalysis,
  FusionRecord,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI, SCHEMA_VERSION, SIZE_LADDER } from '../shared/types.ts';
import type { GameConfig } from './config.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';
import {
  createGenesFromAnalysis,
  createRandomGenes,
  deriveTraits,
  expressGenes,
  inheritGenes,
} from './genetics.ts';
import type { Random } from './random.ts';
import { nextInt, pick } from './random.ts';
import { computeStats } from './stats.ts';

/** Everything impure the factory functions need, all injectable. */
export interface MonsterContext {
  readonly rng: Random;
  readonly config?: GameConfig;
  /** Defaults to `Date.now`. Inject a fixed clock for reproducible tests. */
  readonly now?: () => number;
  /** Defaults to a seeded id derived from `rng`, so a seed reproduces ids. */
  readonly nextId?: () => MonsterId;
}

interface ResolvedContext {
  readonly rng: Random;
  readonly config: GameConfig;
  readonly now: () => number;
  readonly nextId: () => MonsterId;
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Seeded, collision-resistant-enough id. Deterministic for a given `rng`. */
export function createIdFromRandom(rng: Random, length = 12): MonsterId {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ID_ALPHABET[nextInt(rng, 0, ID_ALPHABET.length - 1)];
  }
  return out;
}

function resolve(context: MonsterContext): ResolvedContext {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  return {
    rng: context.rng,
    config,
    now: context.now ?? (() => Date.now()),
    nextId: context.nextId ?? (() => createIdFromRandom(context.rng)),
  };
}

/** Builds a pronounceable name from the configured syllables. */
export function createMonsterName(rng: Random, syllables: readonly string[]): string {
  const count = nextInt(rng, 2, 3);
  let name = '';
  for (let i = 0; i < count; i++) name += pick(rng, syllables);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function assemble(
  parts: {
    id: MonsterId;
    name: string;
    parentAId: MonsterId | null;
    parentBId: MonsterId | null;
    generation: number;
    genes: MonsterGenes;
    phenotype: MonsterPhenotype;
    traits: readonly MonsterTrait[];
    stats: MonsterStats;
    mutationCount: number;
    mutatedLoci: readonly GeneLocus[];
    atavismLoci: readonly GeneLocus[];
    createdAt: number;
    tier: number;
    fusionHistory: readonly FusionRecord[];
  },
): Monster {
  return { schemaVersion: SCHEMA_VERSION, ...parts };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateMonsterOptions {
  readonly name?: string;
  /**
   * Evolution rank for a monster built directly rather than fused into
   * existence - an arena boss, say, which has to stand above the collection
   * without being descended from it.
   */
  readonly tier?: number;
  /** Supply a genome instead of rolling one. */
  readonly genes?: MonsterGenes;
  /**
   * Pin the id instead of drawing one from the context. Used by the starters,
   * whose ids must stay stable across sessions and saves.
   */
  readonly id?: MonsterId;
  /**
   * locus -> value the child must express, from a gene part. Pinned as the
   * dominant allele, leaving the inherited partner as a recessive.
   */
  readonly pinnedLoci?: Readonly<Record<string, unknown>>;
}

/** Creates a generation-0 monster with a freshly rolled genome. */
export function createRootMonster(
  context: MonsterContext,
  options: CreateMonsterOptions = {},
): Monster {
  const ctx = resolve(context);
  const genes = options.genes ?? createRandomGenes(ctx.rng, ctx.config.genetics);
  const phenotype = expressGenes(genes, ctx.rng, ctx.config.genetics);
  const traits = deriveTraits(phenotype, 0, 0);

  return assemble({
    id: options.id ?? ctx.nextId(),
    name: options.name ?? createMonsterName(ctx.rng, ctx.config.fusion.nameSyllables),
    parentAId: null,
    parentBId: null,
    generation: 0,
    tier: options.tier ?? 0,
    genes,
    phenotype,
    traits,
    stats: computeStats(phenotype, 0, ctx.config.stats, options.tier ?? 0),
    mutationCount: 0,
    mutatedLoci: [],
    atavismLoci: [],
    createdAt: ctx.now(),
    fusionHistory: [],
  });
}

/**
 * Creates a generation-0 monster whose look comes from an image analysis.
 * See analyzer.ts for the analyser interface and the offline mock.
 */
export function createMonsterFromAnalysis(
  analysis: MonsterVisualAnalysis,
  context: MonsterContext,
  options: CreateMonsterOptions = {},
): Monster {
  const ctx = resolve(context);
  const genes = createGenesFromAnalysis(analysis, ctx.rng, ctx.config.genetics);
  return createRootMonster(context, { ...options, genes });
}

// ---------------------------------------------------------------------------
// Fusion
// ---------------------------------------------------------------------------

export type FusionRejection =
  | { readonly ok: false; readonly reason: 'same-monster'; readonly message: string }
  | { readonly ok: false; readonly reason: 'schema-mismatch'; readonly message: string };

/** What an upcoming fusion would do, so the UI can preview it. */
export interface EvolutionPreview {
  /** Share of appearance loci the parents already share, 0..1. */
  readonly similarity: number;
  readonly willEvolve: boolean;
  /** The tier the child will have. */
  readonly tier: number;
  /** Why an otherwise-similar pair cannot evolve, if that is the case. */
  readonly blockedBy?: 'tier-mismatch' | 'max-tier' | 'max-size' | 'not-similar';
}

export type FusionCheck =
  | { readonly ok: true; readonly evolution: EvolutionPreview }
  | FusionRejection;

/** Share of appearance loci on which two monsters look the same, 0..1. */
export function appearanceSimilarity(parentA: Monster, parentB: Monster): number {
  let matches = 0;
  for (const locus of CATEGORICAL_LOCI) {
    const a = (parentA.phenotype as unknown as Record<string, unknown>)[locus];
    const b = (parentB.phenotype as unknown as Record<string, unknown>)[locus];
    if (a === b) matches++;
  }
  return matches / CATEGORICAL_LOCI.length;
}

function sizeIndex(size: string): number {
  const index = SIZE_LADDER.indexOf(size as (typeof SIZE_LADDER)[number]);
  return index < 0 ? 0 : index;
}

/**
 * Decides whether a pairing is an evolution.
 *
 * Two monsters evolve when they are alike enough, stand at the same tier, and
 * still have room to grow - both on the tier ladder and on the size ladder. A
 * monster that is already `giant` has nowhere left to go, which is what caps
 * the whole mechanic without an arbitrary number.
 */
export function previewEvolution(
  parentA: Monster,
  parentB: Monster,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): EvolutionPreview {
  const similarity = appearanceSimilarity(parentA, parentB);
  const tier = Math.min(parentA.tier, parentB.tier);

  if (similarity < config.fusion.evolveThreshold) {
    return { similarity, willEvolve: false, tier, blockedBy: 'not-similar' };
  }
  if (parentA.tier !== parentB.tier) {
    return { similarity, willEvolve: false, tier, blockedBy: 'tier-mismatch' };
  }
  if (parentA.tier >= config.fusion.maxTier) {
    return { similarity, willEvolve: false, tier, blockedBy: 'max-tier' };
  }

  const baseSize = Math.max(
    sizeIndex(parentA.phenotype.size),
    sizeIndex(parentB.phenotype.size),
  );
  if (baseSize + 1 >= SIZE_LADDER.length) {
    return { similarity, willEvolve: false, tier, blockedBy: 'max-size' };
  }

  return { similarity, willEvolve: true, tier: parentA.tier + 1 };
}

/** Validates a pairing before fusing, and previews the evolution. Pure. */
export function canFuse(
  parentA: Monster,
  parentB: Monster,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): FusionCheck {
  if (parentA.id === parentB.id) {
    return {
      ok: false,
      reason: 'same-monster',
      message: 'A monster cannot be fused with itself.',
    };
  }
  if (parentA.schemaVersion !== parentB.schemaVersion) {
    return {
      ok: false,
      reason: 'schema-mismatch',
      message: `Schema versions differ: ${parentA.schemaVersion} vs ${parentB.schemaVersion}.`,
    };
  }
  return { ok: true, evolution: previewEvolution(parentA, parentB, config) };
}

/** Merges both parents' bounded histories plus the new record, then trims. */
function mergeHistory(
  parentA: Monster,
  parentB: Monster,
  record: FusionRecord,
  limit: number,
): FusionRecord[] {
  const merged: FusionRecord[] = [];
  const seen = new Set<MonsterId>();
  // Newest-first while deduplicating, then trim and restore chronological order.
  const candidates = [record, ...parentA.fusionHistory, ...parentB.fusionHistory].sort(
    (x, y) => y.generation - x.generation || y.createdAt - x.createdAt,
  );
  for (const entry of candidates) {
    if (seen.has(entry.childId)) continue;
    seen.add(entry.childId);
    merged.push(entry);
    if (merged.length >= limit) break;
  }
  return merged.reverse();
}

export interface FusionResult {
  readonly child: Monster;
  readonly mutationCount: number;
  readonly mutatedLoci: readonly string[];
  readonly atavismLoci: readonly string[];
  /**
   * Appearance loci the child inherited verbatim because the parents already
   * agreed on them. Empty for an ordinary cross; on an evolution this is what
   * the UI can show as "kept from the parents".
   */
  readonly lockedLoci: readonly string[];
  /** Loci a gene part pinned dominant on the child. */
  readonly pinnedLoci: readonly string[];
  /** What the fusion turned out to be, matching `canFuse`'s preview. */
  readonly evolution: EvolutionPreview;
}

/**
 * Fuses two monsters. Both parents are left untouched; the child is new.
 *
 * Throws on an invalid pairing - call `canFuse` first if the UI wants to
 * explain the refusal instead.
 */
export function fuseDetailed(
  parentA: Monster,
  parentB: Monster,
  context: MonsterContext,
  options: CreateMonsterOptions = {},
): FusionResult {
  const check = canFuse(parentA, parentB, context.config ?? DEFAULT_GAME_CONFIG);
  if (!check.ok) throw new Error(check.message);

  const ctx = resolve(context);
  const evolution = previewEvolution(parentA, parentB, ctx.config);

  // An evolution keeps everything the parents already agree on and steps the
  // size and the crest up, so the result is a bigger, crowned version of the
  // same creature rather than a re-roll.
  const locked: Record<string, unknown> = {};
  if (evolution.willEvolve) {
    for (const locus of CATEGORICAL_LOCI) {
      const a = (parentA.phenotype as unknown as Record<string, unknown>)[locus];
      const b = (parentB.phenotype as unknown as Record<string, unknown>)[locus];
      if (a === b) locked[locus] = a;
    }
    const baseSize = Math.max(
      sizeIndex(parentA.phenotype.size),
      sizeIndex(parentB.phenotype.size),
    );
    locked.size = SIZE_LADDER[baseSize + 1];
    const crest = ctx.config.fusion.crestLadder[evolution.tier];
    if (crest !== undefined) locked.crest = crest;
  }

  const inheritance = inheritGenes(
    parentA.genes,
    parentB.genes,
    ctx.rng,
    ctx.config.genetics,
    { locked, ...(options.pinnedLoci ? { pinned: options.pinnedLoci } : {}) },
  );
  const phenotype = expressGenes(inheritance.genes, ctx.rng, ctx.config.genetics);
  const traits = deriveTraits(
    phenotype,
    inheritance.mutationCount,
    inheritance.atavismLoci.length,
  );

  const generation = Math.max(parentA.generation, parentB.generation) + 1;
  const createdAt = ctx.now();
  const id = ctx.nextId();

  const record: FusionRecord = {
    childId: id,
    parentAId: parentA.id,
    parentBId: parentB.id,
    generation,
    mutationCount: inheritance.mutationCount,
    createdAt,
  };

  // An evolution is the same creature grown up, so it keeps the parent's name
  // and only changes its title. An ordinary cross gets a fresh name.
  const baseName =
    options.name ??
    (evolution.willEvolve
      ? parentA.name
      : createMonsterName(ctx.rng, ctx.config.fusion.nameSyllables));

  const child = assemble({
    id,
    name: evolution.willEvolve
      ? applyTierTitle(baseName, evolution.tier, ctx.config.fusion.tierTitles)
      : baseName,
    parentAId: parentA.id,
    parentBId: parentB.id,
    generation,
    genes: inheritance.genes,
    phenotype,
    traits,
    stats: computeStats(
      phenotype,
      inheritance.mutationCount,
      ctx.config.stats,
      evolution.tier,
    ),
    mutationCount: inheritance.mutationCount,
    mutatedLoci: inheritance.mutatedLoci,
    atavismLoci: inheritance.atavismLoci,
    createdAt,
    tier: evolution.tier,
    fusionHistory: mergeHistory(parentA, parentB, record, ctx.config.fusion.historyLimit),
  });

  return {
    child,
    mutationCount: inheritance.mutationCount,
    mutatedLoci: inheritance.mutatedLoci,
    atavismLoci: inheritance.atavismLoci,
    lockedLoci: inheritance.lockedLoci,
    pinnedLoci: inheritance.pinnedLoci,
    evolution,
  };
}

/**
 * Prefixes the tier title, replacing any title the base name already carries
 * so "King Great Moss" can never happen.
 */
export function applyTierTitle(
  name: string,
  tier: number,
  titles: readonly string[],
): string {
  let bare = name;
  for (const title of titles) {
    if (title && bare.startsWith(`${title} `)) {
      bare = bare.slice(title.length + 1);
      break;
    }
  }
  const title = titles[tier];
  return title ? `${title} ${bare}` : bare;
}

/** `fuseDetailed` when only the child is wanted. */
export function fuse(
  parentA: Monster,
  parentB: Monster,
  context: MonsterContext,
  options: CreateMonsterOptions = {},
): Monster {
  return fuseDetailed(parentA, parentB, context, options).child;
}

// ---------------------------------------------------------------------------
// Lineage helpers (id-based, so they never build an object graph)
// ---------------------------------------------------------------------------

/** The direct parent ids of a monster, in order, skipping missing ones. */
export function parentIdsOf(monster: Monster): MonsterId[] {
  const ids: MonsterId[] = [];
  if (monster.parentAId) ids.push(monster.parentAId);
  if (monster.parentBId) ids.push(monster.parentBId);
  return ids;
}

/**
 * Walks ancestry through a lookup, breadth-first, with a visited set and a
 * depth limit so a corrupted save can never hang the caller.
 */
export function ancestorIds(
  monster: Monster,
  lookup: (id: MonsterId) => Monster | undefined,
  maxDepth = 64,
): MonsterId[] {
  const out: MonsterId[] = [];
  const seen = new Set<MonsterId>([monster.id]);
  let frontier = parentIdsOf(monster);
  let depth = 0;

  while (frontier.length > 0 && depth < maxDepth) {
    const next: MonsterId[] = [];
    for (const id of frontier) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      const parent = lookup(id);
      if (parent) next.push(...parentIdsOf(parent));
    }
    frontier = next;
    depth++;
  }
  return out;
}
