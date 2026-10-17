/**
 * Persistence.
 *
 * A `Monster` is already a plain JSON-safe value, so saving is mostly about
 * three things: carrying a `schemaVersion`, validating anything that comes back
 * in, and having a place to put migrations when the shape changes.
 *
 * The save payload holds monsters as a flat list keyed by id - never nested
 * parents - so a lineage of any depth costs one entry per monster and loading
 * can never recurse.
 */

import type {
  FusionRecord,
  Monster,
  MonsterGenes,
  MonsterId,
  MonsterStats,
} from '../shared/types.ts';
import {
  CATEGORICAL_LOCI,
  NUMERIC_LOCI,
  SCHEMA_VERSION,
  STAT_KEYS,
} from '../shared/types.ts';

// ---------------------------------------------------------------------------
// Save file
// ---------------------------------------------------------------------------

export interface MonsterSaveFile {
  readonly schemaVersion: number;
  readonly savedAt: number;
  readonly monsters: readonly Monster[];
}

export interface SerializeOptions {
  /** Defaults to `Date.now`. */
  readonly now?: () => number;
}

export function createSaveFile(
  monsters: readonly Monster[],
  options: SerializeOptions = {},
): MonsterSaveFile {
  const now = options.now ?? (() => Date.now());
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: now(),
    monsters: monsters.map(normalizeMonster),
  };
}

export function serializeSaveFile(
  monsters: readonly Monster[],
  options: SerializeOptions = {},
): string {
  return JSON.stringify(createSaveFile(monsters, options));
}

export function serializeMonster(monster: Monster): string {
  return JSON.stringify(normalizeMonster(monster));
}

/**
 * Drops anything not part of the schema and fixes the schema version, so a
 * monster that went through an older build is saved in current form.
 */
export function normalizeMonster(monster: Monster): Monster {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: monster.id,
    name: monster.name,
    parentAId: monster.parentAId,
    parentBId: monster.parentBId,
    generation: monster.generation,
    genes: monster.genes,
    phenotype: monster.phenotype,
    traits: [...monster.traits],
    stats: { ...monster.stats },
    mutationCount: monster.mutationCount,
    createdAt: monster.createdAt,
    fusionHistory: monster.fusionHistory.map((record) => ({ ...record })),
  };
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------

/** Transforms a payload from version `n` to version `n + 1`. */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/** Defaults for the loci introduced by schema version 2. */
const V2_DEFAULTS: Readonly<Record<string, string>> = { crest: 'none', jaw: 'normal' };

function addV2Loci(monster: Record<string, unknown>): Record<string, unknown> {
  const genes = isRecord(monster.genes) ? { ...monster.genes } : {};
  const phenotype = isRecord(monster.phenotype) ? { ...monster.phenotype } : {};

  for (const [locus, fallback] of Object.entries(V2_DEFAULTS)) {
    if (!(locus in genes)) {
      // A fixed, mid-dominance pair: the monster expresses the default and has
      // nothing unusual to pass on at the new locus.
      genes[locus] = {
        a: { value: fallback, dominance: 0.5 },
        b: { value: fallback, dominance: 0.5 },
        hidden: null,
      };
    }
    if (!(locus in phenotype)) phenotype[locus] = fallback;
  }

  return { ...monster, genes, phenotype };
}

/**
 * Keyed by the version the migration upgrades *from*.
 *
 * 1 -> 2 added the `crest` and `jaw` loci. Monsters saved under version 1 get
 * them filled with the neutral defaults, so old saves keep loading and old
 * monsters stay fusable with new ones.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  1: (data) => {
    if (Array.isArray(data.monsters)) {
      return {
        ...data,
        monsters: data.monsters.map((entry) =>
          isRecord(entry) ? addV2Loci(entry) : entry,
        ),
      };
    }
    return addV2Loci(data);
  },
};

export function migrateToCurrent(
  data: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): Record<string, unknown> {
  let current = data;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 0;

  while (version < SCHEMA_VERSION) {
    const migration = migrations[version];
    if (!migration) {
      throw new Error(
        `No migration from schema version ${version} to ${version + 1}.`,
      );
    }
    current = migration(current);
    version += 1;
    current = { ...current, schemaVersion: version };
  }

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `Save was written by a newer build (schema ${version} > ${SCHEMA_VERSION}).`,
    );
  }

  return current;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: readonly string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateStats(value: unknown, errors: string[], path: string): MonsterStats | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  const stats: Record<string, number> = {};
  for (const key of STAT_KEYS) {
    const entry = value[key];
    if (typeof entry !== 'number' || !Number.isFinite(entry)) {
      errors.push(`${path}.${key}: expected a finite number`);
      return null;
    }
    stats[key] = entry;
  }
  return stats as unknown as MonsterStats;
}

function validateGenes(value: unknown, errors: string[], path: string): MonsterGenes | null {
  if (!isRecord(value)) {
    errors.push(`${path}: expected an object`);
    return null;
  }
  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    const pair = value[locus];
    if (!isRecord(pair)) {
      errors.push(`${path}.${locus}: missing gene pair`);
      return null;
    }
    for (const slot of ['a', 'b'] as const) {
      const allele = pair[slot];
      if (!isRecord(allele) || typeof allele.dominance !== 'number') {
        errors.push(`${path}.${locus}.${slot}: invalid allele`);
        return null;
      }
    }
    if (pair.hidden !== null && !isRecord(pair.hidden)) {
      errors.push(`${path}.${locus}.hidden: expected an allele or null`);
      return null;
    }
  }
  return value as unknown as MonsterGenes;
}

function validateHistory(
  value: unknown,
  errors: string[],
  path: string,
): FusionRecord[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array`);
    return null;
  }
  const out: FusionRecord[] = [];
  for (const [index, entry] of value.entries()) {
    if (
      !isRecord(entry) ||
      typeof entry.childId !== 'string' ||
      typeof entry.parentAId !== 'string' ||
      typeof entry.parentBId !== 'string' ||
      typeof entry.generation !== 'number'
    ) {
      errors.push(`${path}[${index}]: invalid fusion record`);
      return null;
    }
    out.push({
      childId: entry.childId,
      parentAId: entry.parentAId,
      parentBId: entry.parentBId,
      generation: entry.generation,
      mutationCount: typeof entry.mutationCount === 'number' ? entry.mutationCount : 0,
      createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : 0,
    });
  }
  return out;
}

/** Validates one already-migrated monster payload. */
export function validateMonster(value: unknown): ValidationResult<Monster> {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['monster: expected an object'] };

  if (typeof value.id !== 'string' || value.id.length === 0) errors.push('id: expected a non-empty string');
  if (typeof value.name !== 'string') errors.push('name: expected a string');
  if (typeof value.generation !== 'number' || value.generation < 0) {
    errors.push('generation: expected a non-negative number');
  }
  const parentAId = value.parentAId;
  const parentBId = value.parentBId;
  if (parentAId !== null && typeof parentAId !== 'string') errors.push('parentAId: expected a string or null');
  if (parentBId !== null && typeof parentBId !== 'string') errors.push('parentBId: expected a string or null');
  if (typeof value.id === 'string' && (parentAId === value.id || parentBId === value.id)) {
    errors.push('parent ids: a monster cannot be its own parent');
  }

  const stats = validateStats(value.stats, errors, 'stats');
  const genes = validateGenes(value.genes, errors, 'genes');
  const history = validateHistory(value.fusionHistory ?? [], errors, 'fusionHistory');
  if (!isRecord(value.phenotype)) errors.push('phenotype: expected an object');

  if (errors.length > 0 || !stats || !genes || !history) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      id: value.id as string,
      name: value.name as string,
      parentAId: (parentAId as MonsterId | null) ?? null,
      parentBId: (parentBId as MonsterId | null) ?? null,
      generation: value.generation as number,
      genes,
      phenotype: value.phenotype as Monster['phenotype'],
      traits: Array.isArray(value.traits) ? (value.traits.filter((t) => typeof t === 'string') as string[]) : [],
      stats,
      mutationCount: typeof value.mutationCount === 'number' ? value.mutationCount : 0,
      createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
      fusionHistory: history,
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function deserializeMonster(json: string): ValidationResult<Monster> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${(error as Error).message}`] };
  }
  if (!isRecord(parsed)) return { ok: false, errors: ['monster: expected an object'] };
  try {
    return validateMonster(migrateToCurrent(parsed));
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }
}

export function deserializeSaveFile(json: string): ValidationResult<MonsterSaveFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    return { ok: false, errors: [`invalid JSON: ${(error as Error).message}`] };
  }
  if (!isRecord(parsed)) return { ok: false, errors: ['save: expected an object'] };

  let migrated: Record<string, unknown>;
  try {
    migrated = migrateToCurrent(parsed);
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] };
  }

  if (!Array.isArray(migrated.monsters)) {
    return { ok: false, errors: ['save.monsters: expected an array'] };
  }

  const monsters: Monster[] = [];
  const errors: string[] = [];
  for (const [index, entry] of migrated.monsters.entries()) {
    const result = validateMonster(entry);
    if (result.ok) monsters.push(result.value);
    else errors.push(...result.errors.map((e) => `monsters[${index}].${e}`));
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      schemaVersion: SCHEMA_VERSION,
      savedAt: typeof migrated.savedAt === 'number' ? migrated.savedAt : 0,
      monsters,
    },
  };
}

// ---------------------------------------------------------------------------
// Collection helpers
// ---------------------------------------------------------------------------

/** Id -> monster index for lineage lookups. */
export function indexById(monsters: readonly Monster[]): Map<MonsterId, Monster> {
  return new Map(monsters.map((m) => [m.id, m]));
}

/**
 * Reports ids referenced as parents that are not present in the collection.
 * A missing ancestor is tolerated by design (old monsters can be released), so
 * this is information for the UI, not an error.
 */
export function danglingParentIds(monsters: readonly Monster[]): MonsterId[] {
  const known = new Set(monsters.map((m) => m.id));
  const missing = new Set<MonsterId>();
  for (const monster of monsters) {
    for (const id of [monster.parentAId, monster.parentBId]) {
      if (id && !known.has(id)) missing.add(id);
    }
  }
  return [...missing];
}
