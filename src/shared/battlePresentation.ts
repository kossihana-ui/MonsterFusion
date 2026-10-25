import type { BattleLogEntry, BattleState, Skill } from "@core/core/index.ts";

export function skillLabel(skill: Skill): string {
  const names: Record<string, string> = {
    "sig-neutral": "インパクト", "sig-fire": "フレイムバースト",
    "sig-water": "タイドランス", "sig-earth": "ストーンクラッシュ",
    "sig-wind": "ゲイルエッジ", "sig-light": "レイディアンス", "sig-dark": "アンブラファング",
  };
  return names[skill.id] ?? (skill.id === "strike"
    ? skill.scaling === "magic" ? "マナボルト" : "ヘビーストライク"
    : skill.name);
}

export function battleLogLabel(entry: BattleLogEntry, state: BattleState, names: Record<string, string>): string {
  const actor = state.combatants.find(c => c.id === entry.actorId);
  const target = state.combatants.find(c => c.id === entry.targetId);
  const actorName = actor ? names[actor.monsterId] ?? actor.name : "モンスター";
  const targetName = target ? names[target.monsterId] ?? target.name : "相手";
  if (entry.kind === "start") return "バトル開始！ 行動を選んでください。";
  if (entry.kind === "end") return state.outcome.status === "draw" ? "引き分け。" : state.outcome.status === "win" && state.outcome.winningSide === 0 ? "あなたの勝利！" : "あなたの敗北。";
  if (entry.kind === "faint") return `${actorName}は倒れた。`;
  if (entry.kind === "defend") return `${actorName}は守りを固めた。${(entry.mpSpent ?? 0) < 0 ? ` MP回復 +${-entry.mpSpent!}（上限99）` : ""}`;
  const skill = actor?.skills.find(s => s.id === entry.skillId);
  return `${actorName}の${entry.kind === "skill" ? skill ? skillLabel(skill) : "技" : "攻撃"}！ ${targetName}に${entry.damage ?? 0}ダメージ。`
    + (entry.critical ? " 会心！" : "")
    + (entry.elementMultiplier !== undefined ? ` 相性 ×${entry.elementMultiplier}` : "")
    + ((entry.mitigated ?? 0) > 0 ? ` 守りで${entry.mitigated}軽減。` : "")
    + ((entry.mpSpent ?? 0) > 0 ? ` MP消費 ${entry.mpSpent}` : "");
}
