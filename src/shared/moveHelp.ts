import { getMoveBehavior, STATUS_LABELS } from '@core/core/index.ts';
import type { Skill, LearnableMove } from '@core/core/index.ts';

export const partNames: Record<string, string> = { tail:'尻尾', horns:'角', wings:'翼', jaw:'口・顎', eyes:'目', crest:'頭飾り', bodyShape:'体型', size:'体の大きさ' };
export function moveHelp(skill: Skill) {
  const b = getMoveBehavior(skill.id);
  const lines: string[] = [];
  if (b.attacks) lines.push(b.hits > 1 ? `相手を${b.hits}回攻撃する。` : '相手にダメージを与える。');
  else lines.push('攻撃しない補助技。');
  if (b.heal) lines.push(`${b.target === 'self' ? '自分' : b.target === 'both' ? '双方' : '相手'}のHPを${b.heal}回復する。`);
  if (b.piercesDefense) lines.push('相手の「守る」を無視して攻撃する。');
  if (b.shattersDefense) lines.push('相手の防御力を無視する。「守る」の効果は受ける。');
  const conditions = {targetDefending:'相手が守っているとき',targetNotDefending:'相手が守っていないとき',targetBound:'相手が拘束されているとき',selfPoisoned:'自分が毒のとき',targetSeeded:'相手に種が付いているとき'};
  for (const c of b.conditions) lines.push(`${conditions[c.when]}、ダメージが${c.factor}倍になる。`);
  for (const a of b.applies) {
    const who = a.target === 'self' ? '自分' : '相手';
    const effect: Record<string,string> = {
      recoil:'反動で動けなくなる', bind:'拘束されて動けなくなる', flinch:'ひるんで動けなくなる',
      blind:'暗闇になり、物理攻撃が当たりにくくなる', poison:'毒になり、毎ターンHPが減る',
      attackUp:`攻撃力が${a.magnitude ?? 2}倍になる`, doubleStrike:'2回行動できる',
      reflect:'受けた攻撃を跳ね返す', evasion:'攻撃をかわしやすくなる',
      seed:'種が付く。付けた本人が炎で追撃すると威力アップ、水で追撃すると拘束できる',
    };
    lines.push(`${who}：${effect[a.status] ?? STATUS_LABELS[a.status]}（${a.turns}ターン${a.chance < 1 ? '・確率で発動' : ''}）。`);
  }
  if (b.restoreMp) lines.push(`自分のMPを${b.restoreMp}回復する。`);
  if (b.transfersDebuffs) lines.push('自分に付いた弱体効果を相手に移す。');
  for (const c of b.cleanse) lines.push(`${c.target === 'self' ? '自分' : '相手'}の${c.polarity === 'buff' ? '強化' : '弱体'}効果を解除する。`);
  for (const c of b.cure) lines.push(`${c.target === 'self' ? '自分' : '相手'}の${c.statuses.map(s => STATUS_LABELS[s]).join('・')}を解除する。`);
  if (b.instantDeathChance) lines.push('確率で相手を一撃で倒す。');
  if (b.successChance < 1) lines.push('外れることがある。');
  if (b.repeatSuccessChance !== undefined) lines.push('連続で使うと成功しにくくなる。');
  if (b.noConsecutiveUse) lines.push('2ターン続けては使えない。');
  if (b.usableWhileBound) lines.push('拘束されていても使える。');
  return { attacks:b.attacks, lines, summary:lines[1] ?? lines[0] };
}
export function highlightPart(move?: LearnableMove) {
  return move?.source === 'bodyShape' || move?.source === 'size' ? 'body' : move?.source ?? undefined;
}
