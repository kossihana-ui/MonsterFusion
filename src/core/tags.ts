/**
 * Japanese tags for a monster's genes.
 *
 * The UI shows a monster's make-up as coloured tags, so this turns a genome
 * into a flat list the UI only has to style:
 *
 *   dominant  赤   the allele that is expressed
 *   recessive 青   the active allele that lost and is not shown
 *   hidden    紫枠 the carrier slot, invisible for generations at a time
 *   mutation  紫   a locus that mutated when this monster was made
 *
 * Nothing here decides colour or layout - it reports what each allele IS, and
 * the UI maps `kind` to its own palette.
 *
 * Labels are Japanese because that is what the game displays. They live in one
 * table so a missing one is a compile error rather than a blank tag.
 */

import type {
  BodyColor,
  BodySize,
  BodyShape,
  CrestType,
  Element,
  EyeType,
  GeneLocus,
  HornType,
  JawType,
  Monster,
  MonsterGenes,
  MonsterPhenotype,
  NumericLocus,
  TailType,
  WingType,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../shared/types.ts';
import type { GeneticsConfig } from './config.ts';
import { DEFAULT_GENETICS_CONFIG } from './config.ts';

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

export const LOCUS_LABELS: Readonly<Record<GeneLocus, string>> = {
  bodyColor: '体色',
  bodyShape: '体型',
  size: '大きさ',
  horns: '角',
  wings: '翼',
  tail: '尻尾',
  eyes: '目',
  crest: '頭飾り',
  jaw: '口',
  element: '属性',
  attackTendency: '攻撃傾向',
  defenseTendency: '防御傾向',
  magicTendency: '魔法傾向',
  speedTendency: '速度傾向',
};

const BODY_COLOR_LABELS: Readonly<Record<BodyColor, string>> = {
  red: '赤',
  blue: '青',
  green: '緑',
  yellow: '黄',
  purple: '紫',
  white: '白',
  black: '黒',
};

const BODY_SHAPE_LABELS: Readonly<Record<BodyShape, string>> = {
  slim: '細身',
  round: '丸型',
  muscular: '筋肉質',
  serpentine: '蛇型',
  winged: '飛行型',
  finned: '魚型',
};

const SIZE_LABELS: Readonly<Record<BodySize, string>> = {
  tiny: '極小',
  small: '小型',
  medium: '中型',
  large: '大型',
  giant: '巨大',
};

const HORN_LABELS: Readonly<Record<HornType, string>> = {
  none: '角なし',
  single: '一本角',
  twin: '双角',
  crown: '冠角',
  spiral: '巻き角',
  upright: '立ち角',
};

const WING_LABELS: Readonly<Record<WingType, string>> = {
  none: '翼なし',
  feathered: '羽根翼',
  membrane: '皮膜翼',
  crystal: '結晶翼',
  ethereal: '霊翼',
};

const TAIL_LABELS: Readonly<Record<TailType, string>> = {
  none: '尻尾なし',
  short: '短い尻尾',
  long: '長い尻尾',
  spiked: '棘の尻尾',
  twin: '双尾',
  vine: '蔓の尻尾',
};

const EYE_LABELS: Readonly<Record<EyeType, string>> = {
  normal: '普通の目',
  sharp: '鋭い目',
  round: '丸い目',
  multi: '複眼',
  glowing: '光る目',
  slit: '糸目',
};

const CREST_LABELS: Readonly<Record<CrestType, string>> = {
  none: '頭飾りなし',
  flower: '花',
  fin: '頭びれ',
  crystal: '結晶',
  mane: 'たてがみ',
  antenna: '触角',
  crown: '王冠',
};

const JAW_LABELS: Readonly<Record<JawType, string>> = {
  normal: '普通の口',
  fangs: '牙',
  tusks: '曲牙',
  beak: '嘴',
  maw: '大顎',
};

const ELEMENT_LABELS: Readonly<Record<Element, string>> = {
  neutral: '無属性',
  fire: '炎',
  water: '水',
  earth: '土',
  wind: '風',
  light: '光',
  dark: '闇',
};

const CATEGORICAL_LABELS: Record<string, Readonly<Record<string, string>>> = {
  bodyColor: BODY_COLOR_LABELS,
  bodyShape: BODY_SHAPE_LABELS,
  size: SIZE_LABELS,
  horns: HORN_LABELS,
  wings: WING_LABELS,
  tail: TAIL_LABELS,
  eyes: EYE_LABELS,
  crest: CREST_LABELS,
  jaw: JAW_LABELS,
  element: ELEMENT_LABELS,
};

/** Trait tags, the derived descriptions rather than the genes themselves. */
export const TRAIT_LABELS: Readonly<Record<string, string>> = {
  winged: '有翼',
  horned: '有角',
  'tailed-weapon': '武器尾',
  'keen-sight': '鋭い視覚',
  heavyweight: '重量級',
  lightweight: '軽量級',
  crested: '冠飾り',
  floral: '花持ち',
  fanged: '牙持ち',
  royal: '王種',
  brawler: '格闘型',
  guardian: '防御型',
  caster: '魔法型',
  swift: '俊足',
  mutant: '変異体',
  unstable: '不安定',
  throwback: '先祖返り',
  'element-fire': '炎属性',
  'element-water': '水属性',
  'element-earth': '土属性',
  'element-wind': '風属性',
  'element-light': '光属性',
  'element-dark': '闇属性',
  'element-neutral': '無属性',
};

/** The Japanese name of one allele value. Falls back to the raw value. */
export function labelFor(locus: GeneLocus, value: unknown): string {
  if (typeof value === 'number') {
    return `${LOCUS_LABELS[locus]} ${Math.round(value)}`;
  }
  const table = CATEGORICAL_LABELS[locus];
  const label = table?.[String(value)];
  return label ?? String(value);
}

/** The Japanese name of a trait tag. Falls back to the raw tag. */
export function traitLabel(trait: string): string {
  return TRAIT_LABELS[trait] ?? trait;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * What a tag is, which is what decides its colour in the UI.
 *
 * `dominant` and `recessive` are about this monster now; `hidden` is what it
 * will pass on without showing; `mutation` is how it came to be.
 */
export type TagKind = 'dominant' | 'recessive' | 'hidden' | 'mutation';

export interface MonsterTag {
  readonly locus: GeneLocus;
  readonly locusLabel: string;
  readonly kind: TagKind;
  /** The raw allele value, for the UI to key art or tooltips off. */
  readonly value: string | number;
  readonly label: string;
  /** True when this allele is the one you can see on the monster. */
  readonly expressed: boolean;
  /**
   * True when the two active alleles were close enough in dominance to mix,
   * so neither simply beat the other.
   */
  readonly codominant: boolean;
}

export interface DescribeOptions {
  /** Leave out the carrier slot, for a compact view. */
  readonly includeHidden?: boolean;
  /** Leave out the ability tendencies, which are numbers rather than features. */
  readonly includeTendencies?: boolean;
  readonly config?: GeneticsConfig;
}

interface LooseAllele {
  value: unknown;
  dominance: number;
}
interface LoosePair {
  a: LooseAllele;
  b: LooseAllele;
  hidden: LooseAllele | null;
}

/**
 * Every allele a monster carries, tagged by what it is doing.
 *
 * One locus contributes up to three tags: the expressed allele, the active
 * allele that lost, and the carrier. A locus whose two active alleles match
 * contributes one - there is no recessive to report when both are the same.
 */
export function describeMonster(
  monster: Monster,
  options: DescribeOptions = {},
): MonsterTag[] {
  const config = options.config ?? DEFAULT_GENETICS_CONFIG;
  const includeHidden = options.includeHidden ?? true;
  const includeTendencies = options.includeTendencies ?? false;

  const genes = monster.genes as unknown as Record<string, LoosePair>;
  const phenotype = monster.phenotype as unknown as Record<string, unknown>;
  const mutated = new Set<string>(monster.mutatedLoci);

  const loci: GeneLocus[] = [
    ...CATEGORICAL_LOCI,
    ...(includeTendencies ? NUMERIC_LOCI : []),
  ];

  const tags: MonsterTag[] = [];
  for (const locus of loci) {
    const pair = genes[locus];
    if (!pair) continue;

    const gap = Math.abs(pair.a.dominance - pair.b.dominance);
    const codominant = gap <= config.codominanceThreshold;
    const expressedValue = phenotype[locus];

    const [winner, loser] =
      pair.a.dominance >= pair.b.dominance ? [pair.a, pair.b] : [pair.b, pair.a];

    const push = (kind: TagKind, allele: LooseAllele, expressed: boolean): void => {
      tags.push({
        locus,
        locusLabel: LOCUS_LABELS[locus],
        kind,
        value: allele.value as string | number,
        label: labelFor(locus, allele.value),
        expressed,
        codominant,
      });
    };

    // A mutation outranks the rest: how the allele got here is the thing worth
    // showing, and the UI colours it differently for exactly that reason.
    const kindFor = (fallback: TagKind): TagKind =>
      mutated.has(locus) ? 'mutation' : fallback;

    push(kindFor('dominant'), winner, winner.value === expressedValue);

    if (loser.value !== winner.value) {
      push(kindFor('recessive'), loser, loser.value === expressedValue);
    }

    if (includeHidden && pair.hidden) {
      push('hidden', pair.hidden, false);
    }
  }

  return tags;
}

/** Just the visible features, for a compact card. */
export function describeAppearanceTags(
  monster: Monster,
  options: DescribeOptions = {},
): MonsterTag[] {
  return describeMonster(monster, options).filter((tag) => tag.expressed);
}

/** The monster's trait tags, in Japanese. */
export function describeTraits(monster: Monster): { trait: string; label: string }[] {
  return monster.traits.map((trait) => ({ trait, label: traitLabel(trait) }));
}

// ---------------------------------------------------------------------------
// Fusion reveal
// ---------------------------------------------------------------------------

/**
 * One step of the reveal a fusion animation plays.
 *
 * Ordered so the payoff lands last: inherited features first, then what came
 * back from a grandparent, then mutations, then the evolution if there was
 * one. The UI decides the timing and the sound; this decides what is said and
 * in what order.
 */
export interface RevealStep {
  readonly kind: 'inherited' | 'atavism' | 'mutation' | 'evolution';
  readonly locus?: GeneLocus;
  readonly locusLabel?: string;
  readonly label: string;
  /** A short line the UI can show under the tag. */
  readonly note: string;
}

export interface FusionSummary {
  readonly steps: readonly RevealStep[];
  readonly mutationCount: number;
  readonly atavismCount: number;
  readonly evolved: boolean;
}

/**
 * Turns a finished fusion into the sequence a reveal animation plays.
 *
 * Takes the child and the detail `fuseDetailed` returned, because the
 * evolution flag is about the pairing rather than about the child.
 */
export function describeFusion(
  child: Monster,
  evolved = false,
  options: DescribeOptions = {},
): FusionSummary {
  const phenotype = child.phenotype as unknown as Record<string, unknown>;
  const mutated = new Set<string>(child.mutatedLoci);
  const atavism = new Set<string>(child.atavismLoci);
  const steps: RevealStep[] = [];

  for (const locus of CATEGORICAL_LOCI) {
    if (mutated.has(locus) || atavism.has(locus)) continue;
    const value = phenotype[locus];
    steps.push({
      kind: 'inherited',
      locus,
      locusLabel: LOCUS_LABELS[locus],
      label: labelFor(locus, value),
      note: '親から受け継いだ',
    });
  }

  for (const locus of CATEGORICAL_LOCI) {
    if (!atavism.has(locus) || mutated.has(locus)) continue;
    steps.push({
      kind: 'atavism',
      locus,
      locusLabel: LOCUS_LABELS[locus],
      label: labelFor(locus, phenotype[locus]),
      note: '隠れていた遺伝子が現れた',
    });
  }

  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    if (!mutated.has(locus)) continue;
    steps.push({
      kind: 'mutation',
      locus,
      locusLabel: LOCUS_LABELS[locus],
      label: labelFor(locus, phenotype[locus]),
      note: '突然変異',
    });
  }

  if (evolved) {
    steps.push({
      kind: 'evolution',
      label: child.name,
      note: `進化した（ランク ${child.tier}）`,
    });
  }

  void options;

  return {
    steps,
    mutationCount: child.mutationCount,
    atavismCount: child.atavismLoci.length,
    evolved,
  };
}

/** Exposed so the UI can show the same figure the genetics uses. */
export function dominanceOf(
  genes: MonsterGenes,
  locus: GeneLocus,
): { a: number; b: number; hidden: number | null } {
  const pair = (genes as unknown as Record<string, LoosePair>)[locus];
  if (!pair) return { a: 0, b: 0, hidden: null };
  return {
    a: pair.a.dominance,
    b: pair.b.dominance,
    hidden: pair.hidden ? pair.hidden.dominance : null,
  };
}

/** Narrow helper so a caller can label a phenotype without a whole monster. */
export function describePhenotype(phenotype: MonsterPhenotype): string[] {
  const loose = phenotype as unknown as Record<string, unknown>;
  return CATEGORICAL_LOCI.map((locus) => labelFor(locus, loose[locus]));
}

export type { NumericLocus };
