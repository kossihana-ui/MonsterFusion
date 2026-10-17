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
  Monster,
  MonsterGenes,
  MonsterId,
  MonsterPhenotype,
  MonsterStats,
  MonsterTrait,
  MonsterVisualAnalysis,
  FusionRecord,
} from '../shared/types.ts';
import { SCHEMA_VERSION } from '../shared/types.ts';
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
    createdAt: number;
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
  /** Supply a genome instead of rolling one. */
  readonly genes?: MonsterGenes;
  /**
   * Pin the id instead of drawing one from the context. Used by the starters,
   * whose ids must stay stable across sessions and saves.
   */
  readonly id?: MonsterId;
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
    genes,
    phenotype,
    traits,
    stats: computeStats(phenotype, 0, ctx.config.stats),
    mutationCount: 0,
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

export type FusionCheck = { readonly ok: true } | FusionRejection;

/** Validates a pairing before fusing. Pure. */
export function canFuse(parentA: Monster, parentB: Monster): FusionCheck {
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
  return { ok: true };
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
  const check = canFuse(parentA, parentB);
  if (!check.ok) throw new Error(check.message);

  const ctx = resolve(context);
  const inheritance = inheritGenes(
    parentA.genes,
    parentB.genes,
    ctx.rng,
    ctx.config.genetics,
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

  const child = assemble({
    id,
    name: options.name ?? createMonsterName(ctx.rng, ctx.config.fusion.nameSyllables),
    parentAId: parentA.id,
    parentBId: parentB.id,
    generation,
    genes: inheritance.genes,
    phenotype,
    traits,
    stats: computeStats(phenotype, inheritance.mutationCount, ctx.config.stats),
    mutationCount: inheritance.mutationCount,
    createdAt,
    fusionHistory: mergeHistory(parentA, parentB, record, ctx.config.fusion.historyLimit),
  });

  return {
    child,
    mutationCount: inheritance.mutationCount,
    mutatedLoci: inheritance.mutatedLoci,
    atavismLoci: inheritance.atavismLoci,
  };
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
