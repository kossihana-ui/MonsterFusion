/**
 * Starter monsters.
 *
 * These are the three designs the UI has art for, so their ids are fixed
 * strings rather than drawn from the context: a save written today must still
 * point at the same sprite tomorrow.
 *
 * They are built through the normal creation path, so their genes, phenotype
 * and stats are consistent with every other monster and they fuse exactly like
 * one. What is pinned is only what the art shows: the appearance loci and the
 * ability tendencies. The hidden carrier alleles stay randomly rolled, so two
 * players' starters still carry different recessive traits and their fused
 * children differ.
 */

import type {
  Monster,
  MonsterGenes,
  MonsterId,
  MonsterVisualAnalysis,
  NumericLocus,
} from '../shared/types.ts';
import { createGenesFromAnalysis } from './genetics.ts';
import type { MonsterContext, CreateMonsterOptions } from './fusion.ts';
import { createRootMonster } from './fusion.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';

/** Ability tendencies, 0..100, matching the fields of `NumericLocus`. */
export type TendencySpec = Readonly<Record<NumericLocus, number>>;

export interface StarterSpec {
  readonly id: MonsterId;
  /** Display name. The UI may localise it; the id is what is persisted. */
  readonly name: string;
  /** Sprite key, for the UI to resolve its art with. */
  readonly art: string;
  /** The appearance the art shows. Every locus here is pinned as dominant. */
  readonly appearance: MonsterVisualAnalysis;
  readonly tendencies: TendencySpec;
}

/**
 * The three starters, matching the art in the UI repository
 * (`src/mocks/assets/starters`).
 *
 * The tendencies are balanced against each other by measurement rather than
 * by eye: before this, the round robin ran Aqua > Ignis > Moss with the
 * weakest winning 21% of the time. They now sit within about ten points of
 * even while keeping their characters - Moss defensive, Ignis hitting
 * hardest, Aqua fastest.
 */
export const STARTER_SPECS: readonly StarterSpec[] = [
  {
    id: 'starter-moss',
    name: 'Moss',
    art: 'moss-v2-64.png',
    appearance: {
      bodyColor: 'green',
      bodyShape: 'round',
      size: 'small',
      horns: 'none',
      wings: 'none',
      tail: 'vine',
      eyes: 'round',
      crest: 'flower',
      jaw: 'normal',
      element: 'earth',
      confidence: 1,
      notes: 'starter art, appearance pinned by design',
    },
    tendencies: {
      attackTendency: 45,
      defenseTendency: 65,
      magicTendency: 60,
      speedTendency: 30,
    },
  },
  {
    id: 'starter-ignis',
    name: 'Ignis',
    art: 'ignis-v2-64.png',
    appearance: {
      bodyColor: 'red',
      bodyShape: 'muscular',
      size: 'small',
      horns: 'spiral',
      wings: 'none',
      tail: 'spiked',
      eyes: 'slit',
      crest: 'none',
      jaw: 'fangs',
      element: 'fire',
      confidence: 1,
      notes: 'starter art, appearance pinned by design',
    },
    tendencies: {
      attackTendency: 70,
      defenseTendency: 50,
      magicTendency: 25,
      speedTendency: 35,
    },
  },
  {
    id: 'starter-aqua',
    name: 'Aqua',
    art: 'aqua-v2-64.png',
    appearance: {
      bodyColor: 'blue',
      bodyShape: 'finned',
      size: 'small',
      horns: 'none',
      wings: 'none',
      tail: 'long',
      eyes: 'glowing',
      crest: 'fin',
      jaw: 'maw',
      element: 'water',
      confidence: 1,
      notes: 'starter art, appearance pinned by design',
    },
    tendencies: {
      attackTendency: 70,
      defenseTendency: 25,
      magicTendency: 35,
      speedTendency: 55,
    },
  },
];

/**
 * Pins the tendency loci to the spec while leaving the hidden carriers alone,
 * so the starter plays as designed but still has something of its own to pass
 * on when it is fused.
 */
function applyTendencies(genes: MonsterGenes, tendencies: TendencySpec): MonsterGenes {
  const loose = genes as unknown as Record<string, { a: { value: number }; b: { value: number } }>;
  for (const [locus, value] of Object.entries(tendencies)) {
    const pair = loose[locus];
    if (!pair) continue;
    pair.a.value = value;
    pair.b.value = value;
  }
  return genes;
}

/** Builds one starter from its spec. */
export function createStarterMonster(
  spec: StarterSpec,
  context: MonsterContext,
  options: CreateMonsterOptions = {},
): Monster {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const genes = applyTendencies(
    createGenesFromAnalysis(spec.appearance, context.rng, config.genetics),
    spec.tendencies,
  );
  return createRootMonster(context, {
    id: spec.id,
    name: spec.name,
    ...options,
    genes,
  });
}

/** Builds all three starters, in the order the UI should present them. */
export function createStarterMonsters(
  context: MonsterContext,
  specs: readonly StarterSpec[] = STARTER_SPECS,
): Monster[] {
  return specs.map((spec) => createStarterMonster(spec, context));
}

/** Looks a spec up by its id, for the UI to find the matching art. */
export function findStarterSpec(id: MonsterId): StarterSpec | undefined {
  return STARTER_SPECS.find((spec) => spec.id === id);
}
