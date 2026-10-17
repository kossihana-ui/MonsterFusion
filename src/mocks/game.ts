import type { BattleState, GameAdapter, Monster } from "../shared/types";
// The demo starts empty; uploaded monsters are kept only for this session.
export const initialMonsters: Monster[] = [];
export function createBattle(player: Monster, enemy: Monster): BattleState {
  return {
    player,
    enemy,
    playerHp: player.stats.hp,
    enemyHp: enemy.stats.hp,
    turn: 1,
    logs: ["模擬バトル開始。行動を選んでください。"],
    status: "active",
  };
}
// Demonstration only. Replace this adapter with the real core integration.
export const mockAdapter: GameAdapter = {
  async fuseMonsters(a, b) {
    const child: Monster = {
      ...a,
      id: crypto.randomUUID(),
      name: `${a.genes.element}${b.genes.element}の幼獣`,
      generation: Math.max(a.generation, b.generation) + 1,
      image: a.image, // Demo only: reuse the uploaded parent image until core rendering is connected.
      parentIds: [a.id, b.id],
      genes: {
        ...a.genes,
        potential: `${a.genes.element} × ${b.genes.element}`,
      },
      stats: { ...a.stats },
      traits: [...a.traits],
    };
    return { child, parents: [a, b] };
  },
  async calculateBattleTurn(s, action) {
    if (s.status !== "active") return s;
    const damage = action === "skill" ? 38 : action === "attack" ? 24 : 0;
    const hit = action === "defend" ? 6 : 16;
    const enemyHp = Math.max(0, s.enemyHp - damage);
    const playerHp = enemyHp === 0 ? s.playerHp : Math.max(0, s.playerHp - hit);
    return {
      ...s,
      enemyHp,
      playerHp,
      turn: s.turn + 1,
      status: enemyHp === 0 ? "won" : playerHp === 0 ? "lost" : "active",
      logs: [
        ...s.logs,
        `TURN ${s.turn} · ${action === "defend" ? "防御を固めた" : action === "skill" ? `星のスキル！ ${damage}ダメージ` : `攻撃！ ${damage}ダメージ`}`,
        ...(enemyHp > 0
          ? [`敵の反撃。${hit}ダメージを受けた。`]
          : ["敵を倒した！"]),
      ],
    };
  },
};
