// UI display models only. Canonical game types are exported by core/index.ts.
export interface MonsterStats {
  hp: number;
  attack: number;
  defense: number;
  magic: number;
  speed: number;
}
export interface MonsterGenes {
  element: string;
  body: string;
  potential: string;
}
export interface MonsterTrait {
  id: string;
  name: string;
  description: string;
}
export interface Monster {
  tags?: import("@core/core/index.ts").MonsterTag[];
  phenotype?: import("@core/core/index.ts").MonsterPhenotype;
  id: string;
  name: string;
  image: string;
  generation: number;
  stats: MonsterStats;
  genes: MonsterGenes;
  traits: MonsterTrait[];
  parentIds: string[];
}
export interface FusionResult {
  spentPart?: import("@core/core/index.ts").GenePart;
  summary?: import("@core/core/index.ts").FusionSummary;
  child: Monster;
  parents: [Monster, Monster];
}
export type BattleAction = "attack" | "defend" | { kind: "skill"; skillId: string };
export interface BattleState {
  arenaRun?: import("@core/core/index.ts").ArenaRun;
  coreState?: import("@core/core/index.ts").BattleState;
  player: Monster;
  enemy: Monster;
  playerHp: number;
  enemyHp: number;
  turn: number;
  logs: string[];
  status: "active" | "won" | "lost" | "draw";
}
export interface GameAdapter {
  fuseMonsters(a: Monster, b: Monster, partId?: string, name?: string): Promise<FusionResult>;
  calculateBattleTurn(
    state: BattleState,
    action: BattleAction,
  ): Promise<BattleState>;
}
export const statLabels: Record<keyof MonsterStats, string> = {
  hp: "HP",
  attack: "攻撃",
  defense: "防御",
  magic: "魔力",
  speed: "素早さ",
};
