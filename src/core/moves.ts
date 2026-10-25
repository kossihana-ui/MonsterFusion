/**
 * Moves a monster learns from the body it ended up with.
 *
 * The design goal is that a player never has to understand the damage formula:
 * a move is chosen from its element colour, whether it is physical or magical,
 * and what it costs. So every move here states, in Japanese, the feature that
 * taught it - a spiked tail teaches ファイナルテール - and the catalogue is
 * keyed by the expressed phenotype, never by the genes underneath it. A hidden
 * allele is not a feature the monster has; it must not unlock anything.
 *
 * Two kinds of move: `normal`, and `finisher` for the heavy ones. A finisher
 * costs a slot like anything else and is paid for in MP alone - no accuracy
 * roll, no charge turn, no cooldown - so there is one number to read.
 */

import type {
  CategoricalLocus,
  Element,
  Monster,
  MonsterPhenotype,
  Skill,
} from '../shared/types.ts';
import { CATEGORICAL_LOCI } from '../shared/types.ts';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type MoveCategory = 'normal' | 'finisher';

export interface LearnableMove {
  readonly skill: Skill;
  /** Why this monster knows it, in Japanese. Shown next to the move. */
  readonly reason: string;
  readonly category: MoveCategory;
  /** The locus that taught it, or null for a move every monster knows. */
  readonly source: CategoricalLocus | null;
}

/**
 * A monster's chosen moves. Kept apart from the monster on purpose: genes are
 * what a monster IS and do not change, a loadout is what the player decided
 * and does.
 */
export interface MoveLoadout {
  readonly monsterId: string;
  readonly skillIds: readonly string[];
}

/** Attack and defend are always available, so these are the extra slots. */
export const MAX_MOVE_SLOTS = 4;

/** Power and MP by tier, so the numbers are in one place and comparable. */
export const MOVE_TIERS = {
  basic: { power: 100, cost: 2 },
  signature: { power: 140, cost: 6 },
  feature: { power: 150, cost: 7 },
  finisher: { power: 230, cost: 16 },
} as const;

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

/**
 * `self` means the move takes the monster's own element, so a fire creature's
 * tail swipe is a fire attack and the colour on the button means something.
 */
type MoveElement = Element | 'self';

interface MoveDefinition {
  readonly id: string;
  readonly name: string;
  readonly reason: string;
  readonly category: MoveCategory;
  readonly element: MoveElement;
  /** `physical` scales off attack, `magical` off magic. */
  readonly kind: 'physical' | 'magical';
  readonly tier: keyof typeof MOVE_TIERS;
  /** The feature that teaches it. */
  readonly source: CategoricalLocus;
  readonly value: string;
}

const ELEMENT_MOVE_NAMES: Readonly<Record<Element, string>> = {
  neutral: 'インパクト',
  fire: 'フレイムバースト',
  water: 'タイドランス',
  earth: 'ストーンクラッシュ',
  wind: 'ゲイルエッジ',
  light: 'レイディアンス',
  dark: 'アンブラルファング',
};

/**
 * Every move a body feature can teach.
 *
 * One entry per (locus, value) that is worth a move: a feature that reads as
 * a weapon gets one, a purely decorative value does not. Adding a feature move
 * is adding a row here - the rest of the system does not need to know.
 */
export const MOVE_CATALOGUE: readonly MoveDefinition[] = [
  // --- 尻尾 ---
  { id: 'final-tail', name: 'ファイナルテール', reason: 'トゲの尻尾で覚える',
    category: 'finisher', element: 'self', kind: 'physical', tier: 'finisher',
    source: 'tail', value: 'spiked' },
  { id: 'twin-lash', name: 'ツインラッシュ', reason: '双尾で覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'tail', value: 'twin' },
  { id: 'bind-whip', name: 'バインドウィップ', reason: '蔓の尻尾で覚える',
    category: 'normal', element: 'earth', kind: 'magical', tier: 'feature',
    source: 'tail', value: 'vine' },
  { id: 'tail-sweep', name: 'テールスイープ', reason: '長い尻尾で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'tail', value: 'long' },

  // --- 角 ---
  { id: 'ram-charge', name: 'ラムチャージ', reason: '巻き角で覚える',
    category: 'finisher', element: 'self', kind: 'physical', tier: 'finisher',
    source: 'horns', value: 'spiral' },
  { id: 'impact-horn', name: 'インパクトホーン', reason: '立ち角で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'horns', value: 'upright' },
  { id: 'double-gore', name: 'ダブルゴア', reason: '双角で覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'horns', value: 'twin' },
  { id: 'crown-break', name: 'クラウンブレイク', reason: '冠角で覚える',
    category: 'finisher', element: 'light', kind: 'magical', tier: 'finisher',
    source: 'horns', value: 'crown' },
  { id: 'single-thrust', name: 'シングルスラスト', reason: '一本角で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'horns', value: 'single' },

  // --- 翼 ---
  { id: 'wing-cutter', name: 'ウィングカッター', reason: '羽根翼で覚える',
    category: 'normal', element: 'wind', kind: 'physical', tier: 'feature',
    source: 'wings', value: 'feathered' },
  { id: 'dive-attack', name: 'ダイブアタック', reason: '皮膜翼で覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'wings', value: 'membrane' },
  { id: 'crystal-shard', name: 'クリスタルシャード', reason: '結晶翼で覚える',
    category: 'normal', element: 'self', kind: 'magical', tier: 'feature',
    source: 'wings', value: 'crystal' },
  { id: 'soul-wing', name: 'ソウルウィング', reason: '霊翼で覚える',
    category: 'finisher', element: 'dark', kind: 'magical', tier: 'finisher',
    source: 'wings', value: 'ethereal' },

  // --- 口 ---
  { id: 'death-bite', name: 'デスバイト', reason: '大顎で覚える',
    category: 'finisher', element: 'self', kind: 'physical', tier: 'finisher',
    source: 'jaw', value: 'maw' },
  { id: 'fang-bite', name: 'ファングバイト', reason: '牙で覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'jaw', value: 'fangs' },
  { id: 'tusk-rush', name: 'タスクラッシュ', reason: '曲牙で覚える',
    category: 'normal', element: 'earth', kind: 'physical', tier: 'feature',
    source: 'jaw', value: 'tusks' },
  { id: 'pierce-beak', name: 'ピアースビーク', reason: '嘴で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'jaw', value: 'beak' },

  // --- 目 ---
  { id: 'magic-eye', name: 'マジックアイ', reason: '光る目で覚える',
    category: 'normal', element: 'self', kind: 'magical', tier: 'feature',
    source: 'eyes', value: 'glowing' },
  { id: 'multi-gaze', name: 'マルチゲイズ', reason: '複眼で覚える',
    category: 'normal', element: 'dark', kind: 'magical', tier: 'feature',
    source: 'eyes', value: 'multi' },
  { id: 'pierce-gaze', name: 'ペネトレイト', reason: '鋭い目で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'eyes', value: 'sharp' },

  // --- 頭飾り ---
  { id: 'pollen-burst', name: 'ポレンバースト', reason: '花で覚える',
    category: 'normal', element: 'earth', kind: 'magical', tier: 'feature',
    source: 'crest', value: 'flower' },
  { id: 'crystal-ray', name: 'クリスタルレイ', reason: '結晶で覚える',
    category: 'normal', element: 'light', kind: 'magical', tier: 'feature',
    source: 'crest', value: 'crystal' },
  { id: 'royal-order', name: 'ロイヤルオーダー', reason: '王冠で覚える',
    category: 'finisher', element: 'self', kind: 'magical', tier: 'finisher',
    source: 'crest', value: 'crown' },
  { id: 'fin-slash', name: 'フィンスラッシュ', reason: '頭びれで覚える',
    category: 'normal', element: 'water', kind: 'physical', tier: 'feature',
    source: 'crest', value: 'fin' },
  { id: 'mane-guard', name: 'メインクラッシュ', reason: 'たてがみで覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'crest', value: 'mane' },
  { id: 'antenna-pulse', name: 'アンテナパルス', reason: '触角で覚える',
    category: 'normal', element: 'self', kind: 'magical', tier: 'feature',
    source: 'crest', value: 'antenna' },

  // --- 体型・大きさ ---
  { id: 'power-slam', name: 'パワースラム', reason: '筋肉質な体で覚える',
    category: 'normal', element: 'neutral', kind: 'physical', tier: 'feature',
    source: 'bodyShape', value: 'muscular' },
  { id: 'hydro-ram', name: 'ハイドロラム', reason: '魚型の体で覚える',
    category: 'normal', element: 'water', kind: 'physical', tier: 'feature',
    source: 'bodyShape', value: 'finned' },
  { id: 'coil-crush', name: 'コイルクラッシュ', reason: '蛇型の体で覚える',
    category: 'normal', element: 'self', kind: 'physical', tier: 'feature',
    source: 'bodyShape', value: 'serpentine' },
  { id: 'giant-press', name: 'ジャイアントプレス', reason: '巨大な体で覚える',
    category: 'finisher', element: 'neutral', kind: 'physical', tier: 'finisher',
    source: 'size', value: 'giant' },
];

// ---------------------------------------------------------------------------
// Learning
// ---------------------------------------------------------------------------

function resolveElement(element: MoveElement, phenotype: MonsterPhenotype): Element {
  return element === 'self' ? phenotype.element : element;
}

function toSkill(definition: MoveDefinition, phenotype: MonsterPhenotype): Skill {
  const tier = MOVE_TIERS[definition.tier];
  return {
    id: definition.id,
    name: definition.name,
    power: tier.power,
    scaling: definition.kind === 'magical' ? 'magic' : 'attack',
    element: resolveElement(definition.element, phenotype),
    cost: tier.cost,
  };
}

/** The two moves every monster has, whatever body it ended up with. */
function baseMoves(monster: Monster): LearnableMove[] {
  const element = monster.phenotype.element;
  // The stats decide, not the tendency genes that fed them: a monster whose
  // traits pushed its magic past its attack should swing with the magic.
  const magical = monster.stats.magic >= monster.stats.attack;
  const scaling = magical ? 'magic' : 'attack';

  return [
    {
      skill: {
        id: `sig-${element}`,
        name: ELEMENT_MOVE_NAMES[element],
        power: MOVE_TIERS.signature.power,
        scaling,
        element,
        cost: MOVE_TIERS.signature.cost,
      },
      reason: '属性から覚える',
      category: 'normal',
      source: null,
    },
    {
      skill: {
        id: 'strike',
        name: magical ? 'マナボルト' : 'ヘビーストライク',
        power: MOVE_TIERS.basic.power,
        scaling,
        element: 'neutral',
        cost: MOVE_TIERS.basic.cost,
      },
      reason: 'すべてのモンスターが覚える',
      category: 'normal',
      source: null,
    },
  ];
}

/**
 * Everything this monster can learn, from the body it is actually wearing.
 *
 * Read off the phenotype, so a carried-but-unexpressed allele teaches nothing:
 * a monster that merely carries the gene for a spiked tail does not have a
 * spiked tail. Fuse it, express the tail, and the move appears.
 */
export function getLearnableMoves(monster: Monster): LearnableMove[] {
  const phenotype = monster.phenotype as unknown as Record<string, unknown>;
  const moves: LearnableMove[] = baseMoves(monster);

  for (const definition of MOVE_CATALOGUE) {
    if (phenotype[definition.source] !== definition.value) continue;
    moves.push({
      skill: toSkill(definition, monster.phenotype),
      reason: definition.reason,
      category: definition.category,
      source: definition.source,
    });
  }

  return moves;
}

/** True when this monster could put that move in a slot. */
export function canLearn(monster: Monster, skillId: string): boolean {
  return getLearnableMoves(monster).some((move) => move.skill.id === skillId);
}

/**
 * The loadout a monster starts with, and what it falls back to when none was
 * chosen.
 *
 * Its own element move and its basic attack first - a monster is never left
 * without something cheap to use - then the heaviest features it has.
 */
export function defaultLoadout(monster: Monster): MoveLoadout {
  const learnable = getLearnableMoves(monster);
  const base = learnable.filter((move) => move.source === null);
  const features = learnable
    .filter((move) => move.source !== null)
    .sort((a, b) => b.skill.power - a.skill.power);

  const chosen = [...base, ...features].slice(0, MAX_MOVE_SLOTS);
  return { monsterId: monster.id, skillIds: chosen.map((move) => move.skill.id) };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type LoadoutCheck =
  | { readonly ok: true; readonly loadout: MoveLoadout }
  | { readonly ok: false; readonly message: string };

/**
 * Checks a chosen set against what the monster can actually learn.
 *
 * Messages are Japanese because they are shown to the player.
 */
export function validateMoveLoadout(
  monster: Monster,
  skillIds: readonly string[],
): LoadoutCheck {
  if (skillIds.length === 0) {
    return { ok: false, message: '技を1つ以上セットしてください。' };
  }
  if (skillIds.length > MAX_MOVE_SLOTS) {
    return {
      ok: false,
      message: `技は${MAX_MOVE_SLOTS}つまでです（${skillIds.length}つ選ばれています）。`,
    };
  }

  const seen = new Set<string>();
  for (const id of skillIds) {
    if (seen.has(id)) {
      return { ok: false, message: '同じ技は1つしかセットできません。' };
    }
    seen.add(id);
  }

  const learnable = new Map(getLearnableMoves(monster).map((m) => [m.skill.id, m]));
  for (const id of skillIds) {
    if (!learnable.has(id)) {
      return {
        ok: false,
        message: `${monster.name}はその技を覚えていません。`,
      };
    }
  }

  return { ok: true, loadout: { monsterId: monster.id, skillIds: [...skillIds] } };
}

/**
 * Repairs a loadout against a monster: keeps what it can still learn.
 *
 * This is what a fusion needs. A child is a different body, so the moves its
 * parents chose may be nonsense on it; rather than refusing to load the save,
 * keep what still applies.
 *
 * An empty result falls back to the default, because a monster that cannot
 * act is worse than one carrying a set it did not pick. Otherwise the slots
 * are left as they are: three chosen moves means three, not three plus
 * whatever core would have picked.
 */
export function reconcileLoadout(
  monster: Monster,
  skillIds: readonly string[],
): MoveLoadout {
  const learnable = new Set(getLearnableMoves(monster).map((m) => m.skill.id));
  const kept: string[] = [];
  for (const id of skillIds) {
    if (learnable.has(id) && !kept.includes(id) && kept.length < MAX_MOVE_SLOTS) {
      kept.push(id);
    }
  }
  if (kept.length === 0) return defaultLoadout(monster);
  return { monsterId: monster.id, skillIds: kept };
}

/**
 * The skills a monster takes into battle.
 *
 * An unset or unusable loadout falls back to the default rather than leaving
 * a monster unable to act, which is what the battle engine needs from this.
 */
export function skillsForLoadout(
  monster: Monster,
  loadout?: MoveLoadout | readonly string[],
): Skill[] {
  const requested = Array.isArray(loadout)
    ? (loadout as readonly string[])
    : (loadout as MoveLoadout | undefined)?.skillIds;

  const chosen = requested?.length
    ? reconcileLoadout(monster, requested).skillIds
    : defaultLoadout(monster).skillIds;

  const byId = new Map(getLearnableMoves(monster).map((m) => [m.skill.id, m.skill]));
  return chosen.map((id) => byId.get(id)).filter((skill): skill is Skill => Boolean(skill));
}

/** Finds the loadout belonging to a monster, if the caller supplied one. */
export function loadoutFor(
  monster: Monster,
  loadouts: readonly MoveLoadout[] = [],
): MoveLoadout | undefined {
  return loadouts.find((loadout) => loadout.monsterId === monster.id);
}

/**
 * Every move in the catalogue, for a reference screen that wants to show what
 * a feature would teach before the player has it.
 */
export function allMoveDefinitions(): readonly MoveDefinition[] {
  return MOVE_CATALOGUE;
}

/** Sanity check used by tests: every catalogue row names a real locus. */
export function catalogueLoci(): CategoricalLocus[] {
  return [...new Set(MOVE_CATALOGUE.map((m) => m.source))].filter((locus) =>
    CATEGORICAL_LOCI.includes(locus),
  );
}

export type { MoveDefinition };
