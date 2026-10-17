import type { BattleState, GameAdapter, Monster } from "../shared/types";
// Small original pixel sprites, generated locally without image dependencies.
function sprite(color: string, variant = 0) {
  const grid = [
    "      xxxx      ",
    "    xxxxxxxx    ",
    "   xxxxxxxxxx   ",
    "  xxxxxxxxxxxx  ",
    "  xx  xxxx  xx  ",
    "  xx  xxxx  xx  ",
    " xxxxxxxxxxxxxx ",
    " xxxxxxxxxxxxxx ",
    " xxxxx xx xxxxx ",
    "  xxxxxxxxxxxx  ",
    "   xxxxxxxxxx   ",
    "  xxx xxxx xxx  ",
    " xxx  xxxx  xxx ",
  ];
  const pixels = grid.flatMap((row, y) =>
    [...row].flatMap((c, x) =>
      c === "x"
        ? [
            `<rect x="${x}" y="${y + 2}" width="1" height="1" fill="${(x + y + variant) % 7 === 0 ? "#ffffff55" : color}"/>`,
          ]
        : [],
    ),
  );
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 18" shape-rendering="crispEdges">${pixels.join("")}<path d="M7 9h2v1H7z" fill="#13202b"/></svg>`)}`;
}
export const initialMonsters: Monster[] = [
  ["moss", "モススライム", "#8fd7a0", "森", 1],
  ["ember", "エンバーファング", "#f4ad77", "炎", 2],
  ["luna", "ルナウィスプ", "#b6a0ee", "月", 3],
  ["aqua", "アクアホーン", "#7cc8e5", "水", 1],
  ["gold", "アンバーゴーレム", "#dfc476", "地", 2],
  ["rose", "ブルームバット", "#e997b8", "花", 1],
].map((data, i) => ({
  id: String(data[0]),
  name: String(data[1]),
  image: sprite(String(data[2]), i),
  generation: Number(data[4]),
  stats: {
    hp: 100 + i * 24,
    attack: 24 + i * 7,
    defense: 18 + i * 6,
    magic: 30 + i * 9,
    speed: 22 + i * 4,
  },
  genes: {
    element: String(data[3]),
    body: ["軟体", "獣", "精霊"][i % 3],
    potential: "安定",
  },
  traits: [
    {
      id: "resilient",
      name: "生命のきらめき",
      description: "小さな体に、未知の可能性を秘めている。",
    },
  ],
  parentIds: [],
}));
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
      image: sprite("#a5d6bd"),
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
