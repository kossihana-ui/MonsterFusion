/**
 * The arena: a run of five ordinary fights and then a boss.
 *
 * The whole run is a value. Every step returns a new one, nothing is stored
 * in the module, and every roll comes from a seed derived from the run's own
 * id - so showing the same encounter again shows the same enemy rather than
 * drawing a new one, and a saved run resumes exactly where it stopped.
 *
 * Two rules the UI must not be left to enforce, because a screen that goes
 * back and forward would break both:
 *
 *   - a reward is claimed once per encounter, never twice;
 *   - an enemy drops only the features it was actually wearing.
 */

import type {
  BattleAction,
  BattleState,
  Monster,
  MonsterPhenotype,
  MonsterVisualAnalysis,
} from '../shared/types.ts';
import type { ArenaConfig, GameConfig } from './config.ts';
import { DEFAULT_GAME_CONFIG } from './config.ts';
import type { MonsterContext } from './fusion.ts';
import { createMonsterFromAnalysis, createRootMonster } from './fusion.ts';
import type { MoveLoadout } from './moves.ts';
import { defaultLoadout, reconcileLoadout } from './moves.ts';
import type { Consumable } from './items.ts';
import { DOKURO_GESO } from './items.ts';
import type { GenePart, PartInventory } from './parts.ts';
import { addPart, partFromFeature } from './parts.ts';
import { createBasicPolicy, createDuelWithLoadouts, stepTurn } from './battle.ts';
import type { Random } from './random.ts';
import { chance, createSeededRandom, nextInt, pick, seedFromString, shuffled } from './random.ts';
import { CATEGORICAL_LOCI } from '../shared/types.ts';
import { statTotal } from './stats.ts';

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

export type ArenaPhase = 'battle' | 'reward' | 'cleared' | 'failed';

export interface ArenaEncounter {
  /** 0-based. */
  readonly index: number;
  /** Either of the two: the one after five wins, or the dragon at the end. */
  readonly isBoss: boolean;
  /** 冥蒼竜ヴェルグラント, at `finalBossFight`. Leaves no parts. */
  readonly isFinalBoss: boolean;
  readonly enemy: Monster;
  readonly enemyLoadout: MoveLoadout;
}

export interface ArenaRun {
  readonly id: string;
  readonly seed: number;
  /** A snapshot: the collection can change underneath a run. */
  readonly player: Monster;
  readonly playerLoadout: MoveLoadout;
  readonly wins: number;
  readonly phase: ArenaPhase;
  readonly encounter: ArenaEncounter;
  readonly battle: BattleState;
  /** Encounters whose reward has been taken. Guards against a second claim. */
  readonly claimed: readonly number[];
  /**
   * A sparring run: weaker opponents, nothing won and nothing lost.
   *
   * Optional so that a save written before practice existed still loads as
   * the ordinary thing it was.
   */
  readonly practice?: boolean;
}

export interface ArenaRewardResult {
  readonly run: ArenaRun;
  readonly inventory: PartInventory;
  readonly parts: readonly GenePart[];
  /**
   * Consumables the fight left behind, if any. Only the boss drops these.
   *
   * Reported rather than applied: parts and consumables are counted in
   * different inventories, and this function only holds one of them.
   * `claimArenaRewardInSession` puts them away.
   */
  readonly items: readonly Consumable[];
  /** True when the fight was won but nothing dropped. Still a result. */
  readonly empty: boolean;
  /** True when this encounter had already been claimed and nothing was added. */
  readonly duplicate: boolean;
  readonly canContinue: boolean;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

/** Every roll in a run comes from here, so the run is reproducible. */
function runRandom(run: Pick<ArenaRun, 'id'>, purpose: string): Random {
  return createSeededRandom(seedFromString(`${run.id}:${purpose}`));
}

function encounterRandom(runId: string, index: number): Random {
  return createSeededRandom(seedFromString(`${runId}:encounter:${index}`));
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

/**
 * How strong this encounter should be, relative to the monster that entered.
 *
 * The opening fight sits a little below the player and the boss well above,
 * so a run reads as a climb rather than a flat wall.
 */
function strengthFor(index: number, config: ArenaConfig, practice = false): number {
  const scale = practice ? config.practiceStrength : 1;
  return scale * rawStrengthFor(index, config);
}

function rawStrengthFor(index: number, config: ArenaConfig): number {
  if (index === finalBossIndex(config)) return config.finalBossStrength;
  if (index === config.normalWins) return config.bossStrength;
  if (index > config.normalWins) {
    // The long climb from the first boss to the dragon. Deliberately gentler
    // than the opening five: this stretch is 93 fights, not four.
    const span = config.finalStrength - config.lastStrength;
    const steps = Math.max(1, finalBossIndex(config) - config.normalWins - 1);
    return config.lastStrength + (span * (index - config.normalWins)) / steps;
  }
  const span = config.lastStrength - config.firstStrength;
  const steps = Math.max(1, config.normalWins - 1);
  return config.firstStrength + (span * index) / steps;
}

/** 0-based index of the last fight. `finalBossFight` counts from 1. */
export function finalBossIndex(config: ArenaConfig): number {
  return Math.max(config.normalWins + 1, config.finalBossFight - 1);
}

/** True for the fight the dragon stands at. */
export function isFinalBossIndex(index: number, config: ArenaConfig): boolean {
  return index === finalBossIndex(config);
}

/**
 * Pushes an enemy's ability tendencies toward a share of the player's, so the
 * difficulty curve is about the opponent rather than about luck.
 */
function scaledTendencies(
  player: Monster,
  strength: number,
  rng: Random,
): Record<string, number> {
  const source = player.phenotype;
  const jitter = () => 0.9 + rng.next() * 0.2;
  return {
    attackTendency: clampTendency(source.attackTendency * strength * jitter()),
    defenseTendency: clampTendency(source.defenseTendency * strength * jitter()),
    magicTendency: clampTendency(source.magicTendency * strength * jitter()),
    speedTendency: clampTendency(source.speedTendency * strength * jitter()),
  };
}

function clampTendency(value: number): number {
  return Math.round(Math.max(10, Math.min(95, value)));
}

/** The look a boss keeps, so every boss reads as the same kind of thing. */
export const BOSS_TEMPLATE: Omit<MonsterVisualAnalysis, 'confidence'> = {
  bodyShape: 'muscular',
  size: 'giant',
  horns: 'spiral',
  wings: 'membrane',
  tail: 'long',
  jaw: 'maw',
  eyes: 'glowing',
  crest: 'crown',
};

/**
 * 冥蒼竜ヴェルグラント, the thing at the end of the ladder.
 *
 * Fixed rather than rolled, because it is one named creature rather than a
 * kind: obsidian plate, curled horns, a pale blue burn behind the eyes, and
 * the soul core at its chest.
 */
export const FINAL_BOSS_TEMPLATE: Omit<MonsterVisualAnalysis, 'confidence'> = {
  bodyShape: 'muscular',
  bodyColor: 'black',
  size: 'giant',
  horns: 'spiral',
  wings: 'membrane',
  tail: 'long',
  jaw: 'maw',
  eyes: 'glowing',
  crest: 'crystal',
  element: 'dark',
};

export const FINAL_BOSS_NAME = '冥蒼竜ヴェルグラント';

function applyTendencies(monster: Monster, tendencies: Record<string, number>): Monster {
  // Written through the genes so phenotype and stats stay derived rather than
  // patched: a monster whose stats disagree with its genes is a bug waiting.
  const genes = JSON.parse(JSON.stringify(monster.genes)) as Record<
    string,
    { a: { value: number }; b: { value: number } }
  >;
  for (const [locus, value] of Object.entries(tendencies)) {
    const pair = genes[locus];
    if (!pair) continue;
    pair.a.value = value;
    pair.b.value = value;
  }
  return { ...monster, genes: genes as unknown as Monster['genes'] };
}

/**
 * Builds the opponent for one encounter.
 *
 * Deterministic in the run id and the index: the same encounter always
 * produces the same monster, so redrawing the screen cannot reroll it.
 */
export function createArenaEnemy(
  runId: string,
  index: number,
  player: Monster,
  context: MonsterContext,
  practice = false,
): ArenaEncounter {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const arena = config.arena;
  const isFinalBoss = isFinalBossIndex(index, arena);
  const isBoss = isFinalBoss || index === arena.normalWins;
  const rng = encounterRandom(runId, index);
  const strength = strengthFor(index, arena, practice);

  const enemyContext: MonsterContext = {
    rng,
    config,
    now: context.now ?? (() => 0),
    nextId: () => `arena-${runId}-${index}`,
  };

  const tendencies = scaledTendencies(player, strength, rng);

  let enemy: Monster;
  if (isFinalBoss) {
    enemy = createMonsterFromAnalysis(
      { ...FINAL_BOSS_TEMPLATE, confidence: 1 },
      enemyContext,
      { name: FINAL_BOSS_NAME, tier: arena.finalBossTier },
    );
  } else if (isBoss) {
    // A fixed silhouette, a random element, and a tier so its caps rise with
    // the rest of it.
    enemy = createMonsterFromAnalysis(
      {
        ...BOSS_TEMPLATE,
        bodyColor: pick(rng, ['red', 'purple', 'black', 'blue'] as const),
        element: pick(rng, ['fire', 'dark', 'water', 'earth'] as const),
        confidence: 1,
      },
      enemyContext,
      { name: bossName(rng), tier: arena.bossTier },
    );
  } else {
    enemy = createRootMonster(enemyContext, { name: enemyName(rng) });
  }

  enemy = rebuild(applyTendencies(enemy, tendencies), context);

  // Scaling the tendencies alone does not produce a curve: the visual stat
  // modifiers swing a total by more than the scaling does, so a later fight
  // could come out weaker than an earlier one. Converge on the target total
  // instead, which is the thing the player experiences.
  const target = statTotal(player.stats) * strength;
  let current = { ...tendencies };
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = statTotal(enemy.stats);
    if (actual === 0 || Math.abs(actual - target) / target <= 0.04) break;
    const correction = target / actual;
    current = Object.fromEntries(
      Object.entries(current).map(([locus, value]) => [locus, clampTendency(value * correction)]),
    );
    enemy = rebuild(applyTendencies(enemy, current), context);
  }

  return {
    index,
    isBoss,
    isFinalBoss,
    enemy,
    enemyLoadout: defaultLoadout(enemy),
  };
}

/**
 * Recomputes phenotype and stats after the genes were adjusted, so the three
 * stay consistent. Done through the public creation path rather than by hand.
 */
function rebuild(monster: Monster, context: MonsterContext): Monster {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const rng = createSeededRandom(seedFromString(monster.id));
  const rebuilt = createRootMonster(
    { rng, config, now: () => monster.createdAt, nextId: () => monster.id },
    { name: monster.name, genes: monster.genes, id: monster.id, tier: monster.tier },
  );
  return rebuilt;
}

const BOSS_TITLES = ['覇王', '魔竜', '古王', '滅牙', '暴君'];
const BOSS_NAMES = ['グランドラ', 'ヴァルガ', 'ゼノヴィア', 'バハムド', 'ドラグーン'];
const ENEMY_NAMES = ['ワイルド', 'ローグ', 'ハンター', 'スカウト', 'ガーダー', 'レイダー', 'ストーカー'];

function bossName(rng: Random): string {
  return `${pick(rng, BOSS_TITLES)}${pick(rng, BOSS_NAMES)}`;
}

function enemyName(rng: Random): string {
  return `${pick(rng, ENEMY_NAMES)}${nextInt(rng, 2, 99)}`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function battleFor(
  player: Monster,
  playerLoadout: MoveLoadout,
  encounter: ArenaEncounter,
  config: GameConfig,
): BattleState {
  // Both sides enter at full health: a run is a sequence of fair fights, not
  // an endurance test decided by the first one.
  return createDuelWithLoadouts(
    player,
    encounter.enemy,
    [
      { monsterId: player.id, skillIds: playerLoadout.skillIds },
      { monsterId: encounter.enemy.id, skillIds: encounter.enemyLoadout.skillIds },
    ],
    config.battle,
  );
}

/** Opens a run. The player monster is snapshotted as it is now. */
export function startArena(
  player: Monster,
  loadout: MoveLoadout | undefined,
  context: MonsterContext,
  options: { readonly id?: string; readonly practice?: boolean } = {},
): ArenaRun {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const id = options.id ?? `arena-${player.id}-${Math.floor(context.rng.next() * 1e9)}`;
  const playerLoadout = loadout
    ? reconcileLoadout(player, loadout.skillIds)
    : defaultLoadout(player);

  const practice = options.practice === true;
  const encounter = createArenaEnemy(id, 0, player, context, practice);

  return {
    id,
    seed: seedFromString(id),
    player,
    playerLoadout,
    wins: 0,
    phase: 'battle',
    encounter,
    battle: battleFor(player, playerLoadout, encounter, config),
    claimed: [],
    practice,
  };
}

/**
 * Plays one turn: the player's declared action against the house AI.
 *
 * The turn's randomness is derived from the run and the turn number, so a run
 * replays identically and a reloaded save continues the same fight.
 */
export function advanceArenaTurn(
  run: ArenaRun,
  action: BattleAction,
  context: MonsterContext,
): ArenaRun {
  if (run.phase !== 'battle') return run;
  const config = context.config ?? DEFAULT_GAME_CONFIG;

  const rng = createSeededRandom(
    seedFromString(`${run.id}:turn:${run.encounter.index}:${run.battle.turn}`),
  );
  const enemyPolicy = createBasicPolicy(rng);

  const next = stepTurn(
    run.battle,
    (actor) =>
      actor.side === 0
        ? { chooseAction: () => action }
        : enemyPolicy,
    rng,
    config.battle,
  );

  if (next.outcome.status === 'ongoing') {
    return { ...run, battle: next };
  }

  const won = next.outcome.status === 'win' && next.outcome.winningSide === 0;
  if (!won) {
    // A draw ends the run too: the handoff asks for a streak, and a streak
    // that survives not winning is not a streak.
    return { ...run, battle: next, phase: 'failed' };
  }

  return { ...run, battle: next, wins: run.wins + 1, phase: 'reward' };
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/**
 * Takes the reward for the fight just won.
 *
 * Only features the defeated monster was actually wearing can drop, and only
 * once per encounter. A second call returns the same inventory, flagged as a
 * duplicate, rather than paying out again.
 */
export function claimArenaReward(
  run: ArenaRun,
  inventory: PartInventory,
  context: MonsterContext,
): ArenaRewardResult {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  const arena = config.arena;

  if (run.phase !== 'reward') {
    return {
      run,
      inventory,
      parts: [],
      items: [],
      empty: true,
      duplicate: false,
      canContinue: run.phase === 'battle',
      message: 'まだ報酬を受け取れません。',
    };
  }

  if (run.claimed.includes(run.encounter.index)) {
    return {
      run,
      inventory,
      parts: [],
      items: [],
      empty: true,
      duplicate: true,
      canContinue: true,
      message: 'この報酬はすでに受け取っています。',
    };
  }

  // Practice takes nothing and gives nothing. Without this a risk-free run
  // would be the cheapest way to farm parts, and the ladder that exists to
  // take the pressure off a first run would quietly become the best one.
  if (run.practice === true) {
    const practiceCleared = run.wins > finalBossIndex(arena);
    return {
      run: {
        ...run,
        claimed: [...run.claimed, run.encounter.index],
        phase: practiceCleared ? 'cleared' : 'reward',
      },
      inventory,
      parts: [],
      items: [],
      empty: true,
      duplicate: false,
      canContinue: !practiceCleared,
      message: '練習なので、素材は手に入らない。',
    };
  }

  const rng = runRandom(run, `reward:${run.encounter.index}`);
  const enemy = run.encounter.enemy;
  const maxDrops = run.encounter.isBoss ? arena.bossDropCount : arena.dropCount;
  const dropChance = run.encounter.isBoss ? arena.bossDropChance : arena.dropChance;

  // Only the loci the design calls cosmetic drop, and only from what this
  // monster was wearing: a part it did not have must never appear.
  const candidates = shuffled(
    rng,
    arena.dropLoci.filter((locus) => CATEGORICAL_LOCI.includes(locus)),
  );

  const parts: GenePart[] = [];
  // 「パーツドロップなし」: the dragon is not something you take pieces off.
  const dropsParts = !run.encounter.isFinalBoss || arena.finalBossDropsParts;
  for (const locus of dropsParts ? candidates : []) {
    if (parts.length >= maxDrops) break;
    if (!chance(rng, dropChance)) continue;
    const part = partFromFeature(enemy, locus);
    if (!part) continue;
    if (arena.skipAbsentFeatures && isAbsentValue(enemy.phenotype, locus)) continue;
    parts.push(part);
  }

  let nextInventory = inventory;
  for (const part of parts) nextInventory = addPart(nextInventory, part, 1);

  // Its own stream, so adding this did not move a single existing part drop.
  const items: Consumable[] = [];
  if (
    run.encounter.isBoss
    && chance(runRandom(run, `item:${run.encounter.index}`), arena.bossCaptureItemChance)
  ) {
    items.push(DOKURO_GESO);
  }

  const cleared = run.wins > finalBossIndex(arena);
  const nextRun: ArenaRun = {
    ...run,
    claimed: [...run.claimed, run.encounter.index],
    phase: cleared ? 'cleared' : 'reward',
  };

  const spoils = [...parts.map((p) => p.name), ...items.map((i) => i.name)];
  return {
    run: nextRun,
    inventory: nextInventory,
    parts,
    items,
    empty: spoils.length === 0,
    duplicate: false,
    canContinue: !cleared,
    message: spoils.length
      ? `${spoils.join('、')}を手に入れた。`
      : '今回は何も落とさなかった。',
  };
}

/** A feature whose value means "none" is nothing to carry away. */
function isAbsentValue(phenotype: MonsterPhenotype, locus: string): boolean {
  const value = (phenotype as unknown as Record<string, unknown>)[locus];
  return value === 'none' || value === 'normal';
}

/**
 * Moves to the next fight.
 *
 * Refuses while a reward is unclaimed, so the UI cannot skip past a drop by
 * navigating, and refuses once the run is over.
 */
export function nextArenaEncounter(run: ArenaRun, context: MonsterContext): ArenaRun {
  const config = context.config ?? DEFAULT_GAME_CONFIG;
  if (run.phase !== 'reward') return run;
  if (!run.claimed.includes(run.encounter.index)) return run;
  if (run.wins > finalBossIndex(config.arena)) return { ...run, phase: 'cleared' };

  const encounter = createArenaEnemy(run.id, run.wins, run.player, context, run.practice === true);
  return {
    ...run,
    phase: 'battle',
    encounter,
    battle: battleFor(run.player, run.playerLoadout, encounter, config),
  };
}

/** How the rules read, for a screen that explains them. */
export function arenaRules(config: GameConfig = DEFAULT_GAME_CONFIG): string[] {
  const arena = config.arena;
  return [
    '評価は「何連勝できたか」だけで決まります。長く勝ち抜いた人がチャンピオンです。',
    `通常戦に${arena.normalWins}回勝つとボス戦です（${arena.normalWins + 1}戦目）。`,
    `その先も戦いは続き、${arena.finalBossFight}戦目に${FINAL_BOSS_NAME}が待っています。`,
    '敗北・引き分けで連勝は終了します。そこまでの勝ち数が記録になります。',
    '各戦のあいだに全回復します。',
    '倒した相手が持っていた特徴だけが素材になります。',
    `素材は1回の融合につき${arena.partsPerFusion}個まで使えます。`,
  ];
}

/** True when the run has ended, either way. */
export function isArenaOver(run: ArenaRun): boolean {
  return run.phase === 'cleared' || run.phase === 'failed';
}
