/**
 * ソウルメイク: building a monster out of parts instead of breeding one.
 *
 * Fusion makes a child from two parents, so every monster has somewhere it
 * came from. Soul make is the other way in: a player who has collected a
 * body and a pair of eyes can put a new creature together, and when the last
 * monster is gone that is the only way back - which is exactly why the rules
 * here are strict about spending.
 *
 * Two guarantees, both deliberate:
 *
 *   - Nothing is spent unless a monster comes out. A selection that is short
 *     a part, names a part twice, or names something that is not a part at
 *     all, changes no inventory at all.
 *   - A part that is fitted WILL be visible on the monster. The value goes in
 *     as the dominant allele, as a gene part does in a fusion, so the thing
 *     the player assembled is the thing they get.
 *
 * What the player does not place is not left blank: a monster needs a colour,
 * a size and an element to exist, and those are rolled here rather than
 * invented by a screen.
 */

import type {
  CategoricalLocus,
  Monster,
  MonsterVisualAnalysis,
} from '../shared/types.ts';
import type { GameConfig, SoulMakeConfig } from './config.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';
import type { MonsterContext } from './fusion.ts';
import { createMonsterFromAnalysis } from './fusion.ts';
import type { GenePart, PartInventory } from './parts.ts';
import {
  countOf,
  createPartInventory,
  hasCompleted,
  rememberRequest,
  removePart,
} from './parts.ts';
import { LOCUS_LABELS } from './tags.ts';

// ---------------------------------------------------------------------------
// The recipe
// ---------------------------------------------------------------------------

export interface SoulMakeRecipe {
  /** Slots that must be filled for the build to be possible at all. */
  readonly requiredLoci: readonly CategoricalLocus[];
  /** Slots that may be filled. Anything left empty is decided by the game. */
  readonly optionalLoci: readonly CategoricalLocus[];
}

/** The slots a hand-built monster has. Config, so it can be retuned. */
export function getSoulMakeRecipe(
  config: SoulMakeConfig = DEFAULT_GAME_CONFIG.soulMake,
): SoulMakeRecipe {
  return {
    requiredLoci: [...config.requiredLoci],
    optionalLoci: [...config.optionalLoci],
  };
}

/** Every slot, required first. The order a UI can lay the screen out in. */
export function soulMakeLoci(
  config: SoulMakeConfig = DEFAULT_GAME_CONFIG.soulMake,
): readonly CategoricalLocus[] {
  return [...config.requiredLoci, ...config.optionalLoci];
}

// ---------------------------------------------------------------------------
// Selection and preview
// ---------------------------------------------------------------------------

export interface SoulMakeSelection {
  /** Part ids, in any order. One per slot. */
  readonly partIds: readonly string[];
  /** Left out, the game names the monster. */
  readonly name?: string;
}

/** A part the selection resolved to, and the slot it fills. */
export interface PlacedPart {
  readonly locus: CategoricalLocus;
  readonly value: string;
  readonly part: GenePart;
}

export interface SoulMakePreview {
  readonly ok: boolean;
  /** Japanese, shown as-is. */
  readonly message: string;
  /** Required slots still empty. Empty when `ok`. */
  readonly missingLoci: readonly CategoricalLocus[];
  /**
   * What would be fitted, and guaranteed to show.
   *
   * There is deliberately no phenotype here. Colour, size and element are
   * rolled when the monster is made, so any phenotype this returned would
   * name a colour the monster is not going to have. What is certain is this
   * list, and this list is certain.
   */
  readonly placed: readonly PlacedPart[];
  /** Parts spent if the build goes ahead: one per placed part. */
  readonly cost: number;
}

function refuse(
  message: string,
  missingLoci: readonly CategoricalLocus[] = [],
): SoulMakePreview {
  return { ok: false, message, missingLoci, placed: [], cost: 0 };
}

/**
 * What this selection would build, or why it would not.
 *
 * Resolves ids against the inventory the player actually holds, so a part id
 * that is merely well-formed is not good enough.
 */
export function previewSoulMake(
  selection: SoulMakeSelection,
  inventory: PartInventory = createPartInventory(),
  config: SoulMakeConfig = DEFAULT_GAME_CONFIG.soulMake,
): SoulMakePreview {
  const allowed = soulMakeLoci(config);
  const placed: PlacedPart[] = [];
  const filled = new Set<CategoricalLocus>();

  for (const partId of selection.partIds) {
    const stack = inventory.stacks.find((entry) => entry.part.id === partId);
    if (!stack) return refuse('持っていない素材が含まれています。');

    const { part } = stack;
    if (!allowed.includes(part.locus)) {
      return refuse(`${part.name}はソウルメイクの枠に入りません。`);
    }
    if (filled.has(part.locus)) {
      return refuse(`${LOCUS_LABELS[part.locus]}の枠に素材が2つ入っています。`);
    }
    // Counted against the whole selection rather than this one part, because
    // the same id twice is two parts out of one stack.
    const wanted = selection.partIds.filter((id) => id === partId).length;
    if (countOf(inventory, partId) < wanted) {
      return refuse(`${part.name}が足りません。`);
    }

    filled.add(part.locus);
    placed.push({ locus: part.locus, value: part.value, part });
  }

  const missingLoci = config.requiredLoci.filter((locus) => !filled.has(locus));
  if (missingLoci.length > 0) {
    return refuse(
      `${missingLoci.map((locus) => LOCUS_LABELS[locus]).join('と')}が必要です。`,
      missingLoci,
    );
  }

  // Required slots in the order the recipe lists them, then the optional ones,
  // so a UI reading this list can lay it out without sorting.
  const ordered = allowed
    .map((locus) => placed.find((entry) => entry.locus === locus))
    .filter((entry): entry is PlacedPart => entry !== undefined);

  return {
    ok: true,
    message: `${ordered.length}個の素材で新しい個体を作ります。`,
    missingLoci: [],
    placed: ordered,
    cost: ordered.length,
  };
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

export interface SoulMakeResult {
  readonly ok: boolean;
  /** Japanese, shown as-is. */
  readonly message: string;
  readonly monster: Monster | null;
  /** The inventory afterwards. Unchanged unless a monster was made. */
  readonly inventory: PartInventory;
  /** The parts actually spent. Empty on a refusal. */
  readonly spent: readonly GenePart[];
  /** True when this request had already been applied and nothing happened. */
  readonly duplicate: boolean;
}

/**
 * Builds the monster, spending one of each placed part.
 *
 * Spends nothing on any refusal, and nothing twice for a repeated
 * `requestId`: a double-tapped button produces one monster, not two.
 */
export function soulMake(
  selection: SoulMakeSelection,
  inventory: PartInventory,
  context: MonsterContext,
  requestId: string,
): SoulMakeResult {
  if (hasCompleted(inventory, requestId)) {
    return {
      ok: false,
      message: 'このソウルメイクはすでに完了しています。',
      monster: null,
      inventory,
      spent: [],
      duplicate: true,
    };
  }

  const config: GameConfig = context.config ?? DEFAULT_GAME_CONFIG;
  const preview = previewSoulMake(selection, inventory, config.soulMake);
  if (!preview.ok) {
    return {
      ok: false,
      message: preview.message,
      monster: null,
      inventory,
      spent: [],
      duplicate: false,
    };
  }

  // Spend first, and all of it, so there is no path where a monster exists
  // and a part was not taken for it.
  let next = inventory;
  for (const entry of preview.placed) {
    const after = removePart(next, entry.part.id, 1);
    if (!after) {
      return {
        ok: false,
        message: `${entry.part.name}が足りません。`,
        monster: null,
        inventory,
        spent: [],
        duplicate: false,
      };
    }
    next = after;
  }

  const analysis = {
    ...Object.fromEntries(preview.placed.map((entry) => [entry.locus, entry.value])),
    confidence: 1,
  } as unknown as MonsterVisualAnalysis;

  const monster = createMonsterFromAnalysis(analysis, context, {
    ...(selection.name !== undefined ? { name: selection.name } : {}),
  });

  for (const entry of preview.placed) {
    const shown = (monster.phenotype as unknown as Record<string, unknown>)[entry.locus];
    if (shown !== entry.value) {
      // The player placed this part. Handing back something else wearing
      // their parts' cost would be worse than failing loudly.
      throw new Error(
        `soulMake: ${entry.locus} came out as ${String(shown)}, not ${entry.value}`,
      );
    }
  }

  return {
    ok: true,
    message: `${monster.name}が生まれました。`,
    monster,
    inventory: rememberRequest(next, requestId),
    spent: preview.placed.map((entry) => entry.part),
    duplicate: false,
  };
}
