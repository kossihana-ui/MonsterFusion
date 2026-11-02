import { STATUS_LABELS } from "@core/core/index.ts";
import type { BattleLogEntry, BattleState, Skill } from "@core/core/index.ts";

export function matchupLabel(multiplier: number): string {
  return multiplier > 1 ? "よく効く" : multiplier < 1 ? "効きにくい" : "ふつう";
}

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
  if (entry.effects?.length) {
    const subject = (id: string) => { const c = state.combatants.find(c => c.id === id); return c ? names[c.monsterId] ?? c.name : 'モンスター'; };
    const effects = entry.effects.map(e => {
      switch (e.type) {
        case 'damage': return `${subject(e.targetId)}に${e.amount}ダメージ。${e.critical ? ' 会心！' : ''}${e.mitigated > 0 ? ' 守りでダメージを軽減。' : ''}`;
        case 'mp': return `${subject(e.targetId)}のMPが${e.amount}回復。`;
        case 'heal': return `${subject(e.targetId)}のHPが${e.amount}回復。`;
        case 'cleanse': return `${subject(e.targetId)}の${e.removed.length ? e.removed.map(k => STATUS_LABELS[k]).join('・') : '解除できる効果'}を解除。`;
        case 'status': return `${subject(e.targetId)}に${STATUS_LABELS[e.status]}。`;
        case 'noEffect': return `${subject(e.targetId)}はすでに${STATUS_LABELS[e.status]}。効果は延長されなかった。`;
        case 'miss': return '攻撃は当たらなかった。';
        case 'skip': return `${STATUS_LABELS[e.reason]}で動けない。`;
        case 'blocked': return e.reason === 'mp' ? 'MPが足りない。' : '連続では使えない。';
      }
    }).join(' ');
    return `${actorName}${skill ? 'の' + skillLabel(skill) + '！' : '：'} ${effects}` + ((entry.mpSpent ?? 0) > 0 ? ` MP消費 ${entry.mpSpent}` : '');
  }

  return `${actorName}の${entry.kind === "skill" ? skill ? skillLabel(skill) : "技" : "攻撃"}！ ${targetName}に${entry.damage ?? 0}ダメージ。`
    + (entry.critical ? " 会心！" : "")
    + (entry.elementMultiplier !== undefined && entry.elementMultiplier !== 1 ? ` ${matchupLabel(entry.elementMultiplier)}！` : "")
    + ((entry.mitigated ?? 0) > 0 ? " 守りでダメージを軽減。" : "")
    + ((entry.mpSpent ?? 0) > 0 ? ` MP消費 ${entry.mpSpent}` : "");
}
