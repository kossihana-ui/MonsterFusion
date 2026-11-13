import {
  createStarterMonsters,
  DEFAULT_GAME_CONFIG,
  createMonsterName,
  createSeededRandom,
  findStarterSpec,
  createMonsterFromAnalysis,
  describeMonster,
  describeTraits,
  describeFusion,
  labelFor,
  createDuelWithLoadouts,
  getLearnableMoves, defaultLoadout, reconcileLoadout,
  validateMoveLoadout,
  stepTurn,
  createBasicPolicy,
  startArena, advanceArenaTurn, nextArenaEncounter,
  seasons, freeSeason,
  claimArenaRewardInSession, previewCapture, captureArenaMonster, getConsumables,
  previewPartFusion, createGameSession, deployMonsters, ownedMonster,
  fuseOwnedMonsters, settleBattleLoss, soulMakeInSession, isGameOver,
} from "@core/core/index.ts";
import type {
  Monster as CoreMonster,
  BattleState as CoreBattleState,
  MoveLoadout,
  ArenaRun, GameSession, SoulMakeSelection,
} from "@core/core/index.ts";
import type { Monster, BattleState, GameAdapter } from "../shared/ui";
import { battleLogLabel } from "../shared/battlePresentation";
import { recordRun } from "../shared/record";

// UI presentation adapter. Core objects are kept intact and never edited here.
const context = { rng: createSeededRandom(12345) };
const records = new Map<string, CoreMonster>();
let arenaRun: ArenaRun | null = null;
let session: GameSession;
const listeners = new Set<() => void>();
export const getGameSession = () => session;
export const subscribeSession = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function applySession(next: GameSession) { if (session === next) return; session = next; listeners.forEach(listener => listener()); }
export const getPartInventory = () => session.inventory;
export const getItems = () => getConsumables(session);
/** A name to offer when the player would rather not think of one. */
export const suggestMonsterName = () =>
  createMonsterName(context.rng, DEFAULT_GAME_CONFIG.fusion.nameSyllables);
export function presentSessionMonster(monster: CoreMonster) {
  const spec = findStarterSpec(monster.id);
  return present(monster, spec ? starterArt[spec.art] : '');
}
export function makeSoul(selection: SoulMakeSelection, requestId: string) {
  const outcome = soulMakeInSession(session, selection, context, requestId);
  applySession(outcome.session);
  return { ...outcome.result, monster: outcome.result.monster ? presentSessionMonster(outcome.result.monster) : null };
}
let arenaId = '';
const duelIds = new WeakMap<CoreBattleState, string>();
function settle(battle: CoreBattleState, id: string, arena = false) {
  if (battle.outcome.status === 'ongoing') return;
  let next = settleBattleLoss(session, battle, id).session;
  if (!isGameOver(next) && (!arena || battle.outcome.status !== 'win' || battle.outcome.winningSide !== 0)) next = deployMonsters(next);
  applySession(next);
}
export function previewMaterial(a: Monster, b: Monster, partId: string) {
  const part = session.inventory.stacks.find(s => s.part.id === partId)?.part;
  if (!part) return { ok: false, message: "素材を所持していません。", guaranteedExpression: false };
  return previewPartFusion(getCoreMonster(a.id), getCoreMonster(b.id), part, session.inventory);
}
/** The dragon at the end has its own portrait, not a composed sprite. */
export const FINAL_BOSS_ART = `${import.meta.env.BASE_URL}monsters/bosses/arena-100-dragon-concept.png`;
function presentArena(run: ArenaRun): BattleState {
  const spec = findStarterSpec(run.player.id);
  const enemy = run.encounter.isFinalBoss
    ? present(run.encounter.enemy, FINAL_BOSS_ART, false)
    : present(run.encounter.enemy);
  return { ...presentBattle(run.battle, present(run.player, spec ? starterArt[spec.art] : ""), enemy), arenaRun: run };
}
export function resumeArena(): BattleState | null { return arenaRun ? presentArena(arenaRun) : null; }
/** The ladders on offer, plus a private one for trying a monster out. */
export const arenaSeasons = () => [...seasons(), freeSeason(crypto.randomUUID())];
let season = seasons()[0];
export const currentSeason = () => season;
export function enterArena(id: string, seasonId?: string): BattleState {
  const monster = ownedMonster(session, id);
  if (isGameOver(session) || !monster) throw new Error('出場できる仲間がいません。');
  if (arenaRun && arenaRun.phase !== 'failed' && arenaRun.phase !== 'cleared') throw new Error('現在の挑戦を終えてください。');
  // The season IS the run id: everyone on it walks the same ladder. A free
  // ladder carries its own id, so it is taken as given rather than looked
  // up - arenaSeasons() mints a new one every call and would never match.
  season = seasons().find(s => s.id === seasonId)
    ?? (seasonId?.startsWith('free-') ? freeSeason(seasonId.slice('free-'.length)) : undefined)
    ?? seasons()[0];
  arenaRun = startArena(monster, getMoveLoadout(id), context, { id: season.id });
  arenaId = crypto.randomUUID();
  applySession(deployMonsters(session, [id]));
  return presentArena(arenaRun);
}
export function receiveArenaReward() {
  if (!arenaRun) throw new Error("挑戦がありません。");
  // Core puts parts and consumables in their own inventories; the UI only
  // has to adopt the session it hands back.
  const claimed = claimArenaRewardInSession(session, arenaRun, context);
  arenaRun = claimed.run;
  if (!isGameOver(session)) applySession(claimed.session);
  return claimed.result;
}
/** Whether ドクロゲソ can be used on the fight in progress, and on whom. */
export function previewEnemyCapture() {
  if (!arenaRun) return { ok: false, message: "挑戦がありません。", target: null, held: 0, refusal: null };
  return previewCapture(session, arenaRun);
}
export function captureEnemy(requestId: string) {
  if (!arenaRun) throw new Error("挑戦がありません。");
  const result = captureArenaMonster(session, arenaRun, context, requestId);
  if (!result.ok) return { ...result, captured: null };
  arenaRun = result.run;
  applySession(result.session);
  return { ...result, captured: result.captured ? presentSessionMonster(result.captured) : null };
}
export function continueArena(): BattleState {
  if (!arenaRun) throw new Error("挑戦がありません。");
  arenaRun = nextArenaEncounter(arenaRun, context);
  return presentArena(arenaRun);
}
export function leaveArena() { arenaRun = null; if (!isGameOver(session)) applySession(deployMonsters(session)); }
/** How far the current run has got. 0 outside a run. */
export const arenaWins = () => arenaRun?.wins ?? 0;
/**
 * Walks away mid-fight.
 *
 * The streak is kept - eight wins is eight wins whether you stopped or were
 * stopped - and the monster comes home, because retiring is not a defeat.
 * The run itself is over either way.
 */
function runDetails(run: ArenaRun) {
  return {
    look: run.player.phenotype as unknown as Record<string, string>,
    season: season.id,
    seasonLabel: season.label,
  };
}
export function retireArena() {
  if (!arenaRun) throw new Error('挑戦がありません。');
  const wins = arenaRun.wins;
  const monster = arenaRun.player.name;
  const details = runDetails(arenaRun);
  leaveArena();
  return { wins, ...recordRun(wins, monster, 'retired', details) };
}
/** Files a run that ended on its own, so the record sees it too. */
export function recordArenaEnding(ending: 'defeated' | 'cleared') {
  if (!arenaRun) return null;
  return recordRun(arenaRun.wins, arenaRun.player.name, ending, runDetails(arenaRun));
}
// Session preferences, separate from canonical monsters, like the demo collection.
const loadouts = new Map<string, MoveLoadout>();
export function getFeatureMoves(id: string) {
  return getLearnableMoves(getCoreMonster(id));
}
export function recommendedFeatureLoadout(id: string): MoveLoadout {
  return defaultLoadout(getCoreMonster(id));
}
export function getMoveLoadout(id: string): MoveLoadout {
  const monster = getCoreMonster(id);
  const saved = loadouts.get(id);
  return saved ? reconcileLoadout(monster, saved.skillIds) : defaultLoadout(monster);
}
export function setMoveLoadout(id: string, skillIds: readonly string[]) {
  const result = validateMoveLoadout(getCoreMonster(id), skillIds);
  if (result.ok) loadouts.set(id, result.loadout);
  return result;
}
const starterArt: Record<string, string> = {
  "moss-v2-64.png": new URL("./assets/starters/moss-v2-64.png", import.meta.url)
    .href,
  "ignis-v2-64.png": new URL(
    "./assets/starters/ignis-v2-64.png",
    import.meta.url,
  ).href,
  "aqua-v2-64.png": new URL("./assets/starters/aqua-v2-64.png", import.meta.url)
    .href,
};
const names: Record<string, string> = {
  "starter-moss": "モス",
  "starter-ignis": "イグニス",
  "starter-aqua": "アクア",
};
export function getCoreMonster(id: string): CoreMonster {
  const monster = records.get(id);
  if (!monster) throw new Error("モンスターが見つかりません。");
  return monster;
}
function present(monster: CoreMonster, image = "", composed = true): Monster {
  records.set(monster.id, monster);
  return {
    id: monster.id,
    name: names[monster.id] ?? monster.name,
    image,
    phenotype: composed ? monster.phenotype : undefined,
    generation: monster.generation,
    stats: monster.stats,
    tags: describeMonster(monster),
    genes: {
      element: labelFor("element", monster.phenotype.element),
      body: labelFor("bodyShape", monster.phenotype.bodyShape),
      potential: `進化ランク ${monster.tier} / 隠れ遺伝子あり`,
    },
    traits: describeTraits(monster).map((tag) => ({
      id: tag.trait,
      name: tag.label,
      description: tag.label,
    })),
    parentIds: [monster.parentAId, monster.parentBId].filter(
      (id): id is string => id !== null,
    ),
  };
}
export const initialMonsters = createStarterMonsters(context).map((monster) => {
  const spec = findStarterSpec(monster.id)!;
  return present(monster, starterArt[spec.art]);
});
session = createGameSession(initialMonsters.map(m => getCoreMonster(m.id)));

export function restartGame(seed = 12345) {
  arenaRun = null;
  arenaId = '';
  context.rng = createSeededRandom(seed);
  records.clear();
  loadouts.clear();
  const starters = createStarterMonsters(context);
  starters.forEach(presentSessionMonster);
  applySession(createGameSession(starters));
}

export function registerUploadedMonster(name: string, image: string): Monster {
  // Uploaded art has not been analysed. Creation and stat consistency belong to core.
  return present(
    createMonsterFromAnalysis(
      { confidence: 0, notes: "Uploaded image; visual analysis pending" },
      context,
      { name },
    ),
    image,
    false,
  );
}
function presentBattle(
  coreState: CoreBattleState,
  player: Monster,
  enemy: Monster,
): BattleState {
  const outcome = coreState.outcome;
  return {
    player,
    enemy,
    coreState,
    playerHp: coreState.combatants.find((c) => c.side === 0)!.hp,
    enemyHp: coreState.combatants.find((c) => c.side === 1)!.hp,
    turn: coreState.turn + 1,
    logs: coreState.log.map((entry) => battleLogLabel(entry, coreState, { [player.id]: player.name, [enemy.id]: enemy.name })),
    status:
      outcome.status === "ongoing"
        ? "active"
        : outcome.status === "draw"
          ? "draw"
          : outcome.winningSide === 0
            ? "won"
            : "lost",
  };
}
export function createBattle(player: Monster, enemy: Monster): BattleState {
  if (isGameOver(session) || !ownedMonster(session, player.id)) throw new Error('出場できる仲間がいません。');
  const battle = createDuelWithLoadouts(getCoreMonster(player.id), getCoreMonster(enemy.id), [getMoveLoadout(player.id), getMoveLoadout(enemy.id)]);
  duelIds.set(battle, crypto.randomUUID());
  // Both sides, because in a practice duel the opponent is the player's own
  // monster too and was being left fusable while it fought.
  applySession(deployMonsters(session, [player.id, enemy.id]));
  return presentBattle(battle, player, enemy);
}
export const gameAdapter: GameAdapter = {
  async fuseMonsters(a, b, partId, name) {
    const outcome = fuseOwnedMonsters(session, a.id, b.id, context, crypto.randomUUID(), partId, name);
    const result = outcome.result;
    if (!result.ok || !result.child || !result.fusion) throw new Error(result.message);
    applySession(outcome.session);
    return { child: present(result.child), parents: [a, b], spentPart: result.spent ?? undefined,
      summary: describeFusion(result.child, result.fusion.evolution.willEvolve) };
  },
  async calculateBattleTurn(state, action) {
    if (state.status !== "active") return state;
    const coreState = state.coreState;
    if (!coreState) throw new Error("バトル状態がありません。");
    if (state.arenaRun) {
      if (arenaRun !== state.arenaRun) throw new Error("最新のアリーナ状態で操作してください。");
      const target = coreState.combatants.find(c => c.side === 1)!;
      arenaRun = advanceArenaTurn(state.arenaRun, typeof action === "object" ? { ...action, targetId: target.id } : action === "defend" ? { kind: "defend" } : { kind: "attack", targetId: target.id }, context);
      settle(arenaRun.battle, arenaId + ":" + arenaRun.encounter.index, true);
      return presentArena(arenaRun);
    }
    const enemyPolicy = createBasicPolicy(context.rng);
    const next = stepTurn(
      coreState,
      (actor) =>
        actor.side === 0
          ? {
              chooseAction(current, battle) {
                const target = battle.combatants.find(
                  (c) => c.side !== current.side && c.hp > 0,
                );
                if (action === "defend" || !target) return { kind: "defend" };
                const skill = typeof action === "object"
                  ? current.skills.find((s) => s.id === action.skillId)
                  : undefined;
                if (typeof action === "object" && (!skill || skill.cost > current.mp))
                  throw new Error("この技は使用できません。");
                if (skill)
                  return {
                    kind: "skill",
                    skillId: skill.id,
                    targetId: target.id,
                  };
                return { kind: "attack", targetId: target.id };
              },
            }
          : enemyPolicy,
      context.rng,
    );
    const battleId = duelIds.get(coreState) ?? crypto.randomUUID();
    duelIds.set(next, battleId);
    settle(next, battleId);
    return presentBattle(next, state.player, state.enemy);
  },
};
