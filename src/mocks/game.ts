import {
  createStarterMonsters,
  createSeededRandom,
  findStarterSpec,
  createMonsterFromAnalysis,
  canFuse,
  fuseDetailed,
  describeMonster,
  describeTraits,
  describeFusion,
  labelFor,
  createDuelWithLoadouts,
  defaultLoadout,
  reconcileLoadout,
  validateMoveLoadout,
  stepTurn,
  createBasicPolicy,
  startArena, advanceArenaTurn, claimArenaReward, nextArenaEncounter,
  createPartInventory, previewPartFusion, fuseWithPart,
} from "@core/core/index.ts";
import type {
  Monster as CoreMonster,
  BattleState as CoreBattleState,
  MoveLoadout,
  ArenaRun,
} from "@core/core/index.ts";
import type { Monster, BattleState, GameAdapter } from "../shared/ui";
import { battleLogLabel } from "../shared/battlePresentation";

// UI presentation adapter. Core objects are kept intact and never edited here.
const context = { rng: createSeededRandom(12345) };
const records = new Map<string, CoreMonster>();
let arenaRun: ArenaRun | null = null;
let inventory = createPartInventory();
export const getPartInventory = () => inventory;
export function previewMaterial(a: Monster, b: Monster, partId: string) {
  const part = inventory.stacks.find(s => s.part.id === partId)?.part;
  if (!part) return { ok: false, message: "素材を所持していません。", guaranteedExpression: false };
  return previewPartFusion(getCoreMonster(a.id), getCoreMonster(b.id), part, inventory);
}
function presentArena(run: ArenaRun): BattleState {
  const spec = findStarterSpec(run.player.id);
  return { ...presentBattle(run.battle, present(run.player, spec ? starterArt[spec.art] : ""), present(run.encounter.enemy)), arenaRun: run };
}
export function resumeArena(): BattleState | null { return arenaRun ? presentArena(arenaRun) : null; }
export function enterArena(id: string): BattleState {
  arenaRun = startArena(getCoreMonster(id), getMoveLoadout(id), context);
  return presentArena(arenaRun);
}
export function receiveArenaReward() {
  if (!arenaRun) throw new Error("挑戦がありません。");
  const result = claimArenaReward(arenaRun, inventory, context);
  arenaRun = result.run; inventory = result.inventory;
  return result;
}
export function continueArena(): BattleState {
  if (!arenaRun) throw new Error("挑戦がありません。");
  arenaRun = nextArenaEncounter(arenaRun, context);
  return presentArena(arenaRun);
}
export function leaveArena() { arenaRun = null; }
// Session preferences, separate from canonical monsters, like the demo collection.
const loadouts = new Map<string, MoveLoadout>();
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
  return presentBattle(
    createDuelWithLoadouts(getCoreMonster(player.id), getCoreMonster(enemy.id), [getMoveLoadout(player.id), getMoveLoadout(enemy.id)]),
    player,
    enemy,
  );
}
export const gameAdapter: GameAdapter = {
  async fuseMonsters(a, b, partId) {
    const parentA = getCoreMonster(a.id),
      parentB = getCoreMonster(b.id);
    const check = canFuse(parentA, parentB);
    if (!check.ok) throw new Error(check.message);
    if (partId) {
      const part = inventory.stacks.find(s => s.part.id === partId)?.part;
      if (!part) throw new Error("素材を所持していません。");
      const result = fuseWithPart(parentA, parentB, part, inventory, context, crypto.randomUUID());
      if (!result.ok || !result.child || !result.fusion) throw new Error(result.message);
      inventory = result.inventory;
      return { child: present(result.child), parents: [a, b], spentPart: result.spent ?? undefined, summary: describeFusion(result.child, result.fusion.evolution.willEvolve) };
    }
    const result = fuseDetailed(parentA, parentB, context);
    return { child: present(result.child), parents: [a, b],
      summary: describeFusion(result.child, result.evolution.willEvolve) };
  },
  async calculateBattleTurn(state, action) {
    if (state.status !== "active") return state;
    const coreState = state.coreState;
    if (!coreState) throw new Error("バトル状態がありません。");
    if (state.arenaRun) {
      if (arenaRun !== state.arenaRun) throw new Error("最新のアリーナ状態で操作してください。");
      const target = coreState.combatants.find(c => c.side === 1)!;
      arenaRun = advanceArenaTurn(state.arenaRun, typeof action === "object" ? { ...action, targetId: target.id } : action === "defend" ? { kind: "defend" } : { kind: "attack", targetId: target.id }, context);
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
    return presentBattle(next, state.player, state.enemy);
  },
};
