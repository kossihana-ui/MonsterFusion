/**
 * Gene parts: the body features taken from a defeated monster, and the fusion
 * that works one into a child.
 *
 * A part is an item, not a creature: it lives in an inventory beside the
 * collection rather than inside any monster. Spending one is the only way to
 * aim a fusion at a particular feature, so the rules around spending it are
 * the careful part - a part must be consumed exactly once, and only when a
 * child was actually produced.
 *
 * The guarantee a part buys is deliberately strong and deliberately narrow:
 * the named feature WILL be expressed on the child. It is placed as the
 * dominant active allele and the locus is held out of mutation, so nothing
 * downstream can take it away. The partner's allele is not destroyed - it
 * drops to the recessive slot and can resurface in a later generation, which
 * is what keeps this a genetics system rather than a dress-up screen.
 */

import type {
  CategoricalLocus,
  Monster,
  MonsterGenes,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI } from '../shared/types.ts';
import type { GameConfig } from './config.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';
import type { MonsterContext, FusionResult } from './fusion.ts';
import { canFuse, fuseDetailed } from './fusion.ts';
import { labelFor, LOCUS_LABELS } from './tags.ts';

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------

export interface GenePart {
  /** Stable across runs: the same feature is always the same part. */
  readonly id: string;
  /** Japanese, e.g. 「トゲの尻尾」. */
  readonly name: string;
  readonly locus: CategoricalLocus;
  readonly value: string;
  /** Where it came from, for the reward card. */
  readonly fromMonsterName: string;
}

export interface PartStack {
  readonly part: GenePart;
  readonly count: number;
}

export interface PartInventory {
  readonly stacks: readonly PartStack[];
  /**
   * Fusion requests already applied.
   *
   * A double click, a retried request or a screen that goes back and forward
   * resends the same id; without this the part would be spent twice and two
   * children would exist. Bounded, because it only has to outlive a retry.
   */
  readonly completedRequests: readonly string[];
}

/** How many request ids are remembered. A retry arrives within seconds. */
export const REQUEST_LEDGER_LIMIT = 64;

export function partIdFor(locus: CategoricalLocus, value: string): string {
  return `part-${locus}-${value}`;
}

/** Builds the part for a feature a monster is actually wearing. */
export function partFromFeature(
  monster: Monster,
  locus: CategoricalLocus,
): GenePart | null {
  const value = (monster.phenotype as unknown as Record<string, unknown>)[locus];
  if (typeof value !== 'string') return null;
  return {
    id: partIdFor(locus, value),
    name: labelFor(locus, value),
    locus,
    value,
    fromMonsterName: monster.name,
  };
}

export function createPartInventory(stacks: readonly PartStack[] = []): PartInventory {
  return { stacks: stacks.map((s) => ({ ...s })), completedRequests: [] };
}

export function countOf(inventory: PartInventory, partId: string): number {
  return inventory.stacks.find((s) => s.part.id === partId)?.count ?? 0;
}

/** Adds parts. Returns a new inventory; the input is untouched. */
export function addPart(
  inventory: PartInventory,
  part: GenePart,
  count = 1,
): PartInventory {
  if (count <= 0) return inventory;
  const stacks = inventory.stacks.map((s) => ({ ...s }));
  const existing = stacks.find((s) => s.part.id === part.id);
  if (existing) {
    stacks[stacks.indexOf(existing)] = { part: existing.part, count: existing.count + count };
  } else {
    stacks.push({ part, count });
  }
  return { ...inventory, stacks };
}

/** Spends parts. Returns null when there are not enough, so the caller stops. */
export function removePart(
  inventory: PartInventory,
  partId: string,
  count = 1,
): PartInventory | null {
  const held = countOf(inventory, partId);
  if (held < count) return null;
  const stacks = inventory.stacks
    .map((s) => (s.part.id === partId ? { part: s.part, count: s.count - count } : { ...s }))
    .filter((s) => s.count > 0);
  return { ...inventory, stacks };
}

/** Records a request as applied, keeping the ledger bounded. */
export function rememberRequest(inventory: PartInventory, requestId: string): PartInventory {
  const completed = [...inventory.completedRequests, requestId];
  return {
    ...inventory,
    completedRequests: completed.slice(-REQUEST_LEDGER_LIMIT),
  };
}

export function hasCompleted(inventory: PartInventory, requestId: string): boolean {
  return inventory.completedRequests.includes(requestId);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface PartFusionPreview {
  readonly ok: boolean;
  /** Japanese, shown as-is. */
  readonly message: string;
  /** The locus the part will pin, when it can be used. */
  readonly locus: CategoricalLocus | null;
  readonly value: string | null;
  /**
   * True when the feature is guaranteed to be visible on the child.
   *
   * It always is for a part fusion - that is what a part is for - but the
   * field is explicit so the UI never has to assume, and so a future mode
   * that only seeds the carrier slot can say `false` here.
   */
  readonly guaranteedExpression: boolean;
  /** Parts spent if the fusion goes ahead. */
  readonly cost: number;
}

/**
 * What putting this part into this pairing would do.
 *
 * Returns a sentence the UI can show without rewording, because the UI must
 * not be the thing that decides whether a feature is guaranteed.
 */
export function previewPartFusion(
  a: Monster,
  b: Monster,
  part: GenePart | null,
  inventory: PartInventory = createPartInventory(),
): PartFusionPreview {
  const pairing = canFuse(a, b);
  if (!pairing.ok) {
    return {
      ok: false,
      message: pairing.message,
      locus: null,
      value: null,
      guaranteedExpression: false,
      cost: 0,
    };
  }

  if (!part) {
    return {
      ok: true,
      message: '素材なしで融合します。子の特徴は遺伝で決まります。',
      locus: null,
      value: null,
      guaranteedExpression: false,
      cost: 0,
    };
  }

  if (!CATEGORICAL_LOCI.includes(part.locus)) {
    return {
      ok: false,
      message: 'この素材は融合に使えません。',
      locus: null,
      value: null,
      guaranteedExpression: false,
      cost: 0,
    };
  }

  if (countOf(inventory, part.id) < 1) {
    return {
      ok: false,
      message: `${part.name}を持っていません。`,
      locus: part.locus,
      value: part.value,
      guaranteedExpression: false,
      cost: 1,
    };
  }

  return {
    ok: true,
    message: `子の${LOCUS_LABELS[part.locus]}は必ず「${part.name}」になります。`,
    locus: part.locus,
    value: part.value,
    guaranteedExpression: true,
    cost: 1,
  };
}

// ---------------------------------------------------------------------------
// Fusion with a part
// ---------------------------------------------------------------------------

export interface PartFusionResult {
  readonly ok: boolean;
  readonly message: string;
  readonly child: Monster | null;
  readonly inventory: PartInventory;
  /** The part actually spent. null when none was used. */
  readonly spent: GenePart | null;
  /** The underlying fusion detail, for the reveal animation. */
  readonly fusion: FusionResult | null;
  /** True when this request had already been applied and nothing happened. */
  readonly duplicate: boolean;
}

/**
 * Fuses two monsters, optionally working a part into the child.
 *
 * The part is spent only if a child was produced, and only once per
 * `requestId`: a resend returns the same refusal-to-act rather than a second
 * child. Both parents and the inventory handed in are left untouched.
 */
export function fuseWithPart(
  a: Monster,
  b: Monster,
  part: GenePart | null,
  inventory: PartInventory,
  context: MonsterContext,
  requestId: string,
  /** The child's name. Left out, the game names it. */
  name?: string,
): PartFusionResult {
  if (hasCompleted(inventory, requestId)) {
    return {
      ok: false,
      message: 'この融合はすでに完了しています。',
      child: null,
      inventory,
      spent: null,
      fusion: null,
      duplicate: true,
    };
  }

  const preview = previewPartFusion(a, b, part, inventory);
  if (!preview.ok) {
    return {
      ok: false,
      message: preview.message,
      child: null,
      inventory,
      spent: null,
      fusion: null,
      duplicate: false,
    };
  }

  // Spend first, so a throw below cannot leave a child that cost nothing.
  let nextInventory = inventory;
  if (part) {
    const spent = removePart(inventory, part.id, 1);
    if (!spent) {
      return {
        ok: false,
        message: `${part.name}を持っていません。`,
        child: null,
        inventory,
        spent: null,
        fusion: null,
        duplicate: false,
      };
    }
    nextInventory = spent;
  }

  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const fusion = fuseDetailed(a, b, context, {
    ...(part ? { pinnedLoci: { [part.locus]: part.value } } : {}),
    ...(name !== undefined && name !== '' ? { name } : {}),
  });

  if (part) {
    const shown = (fusion.child.phenotype as unknown as Record<string, unknown>)[part.locus];
    if (shown !== part.value) {
      // The guarantee is the whole product here; failing it quietly would be
      // worse than failing loudly.
      throw new Error(
        `fuseWithPart: ${part.locus} came out as ${String(shown)}, not ${part.value}`,
      );
    }
  }

  void config;

  return {
    ok: true,
    message: part
      ? `${part.name}を組み込みました。`
      : '融合しました。',
    child: fusion.child,
    inventory: rememberRequest(nextInventory, requestId),
    spent: part,
    fusion,
    duplicate: false,
  };
}

/** The loci a part can pin. Exposed so the UI can filter an inventory. */
export function pinnableLoci(): readonly CategoricalLocus[] {
  return CATEGORICAL_LOCI;
}

/** Every part a monster could drop: one per feature it is wearing. */
export function partsOf(monster: Monster): GenePart[] {
  return CATEGORICAL_LOCI.map((locus) => partFromFeature(monster, locus)).filter(
    (part): part is GenePart => part !== null,
  );
}

export type { MonsterGenes, GameConfig };
