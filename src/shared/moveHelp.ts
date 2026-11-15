import { getMoveHealing, getMoveBehavior, STATUS_LABELS, STATUS_POLARITY, DEFAULT_BATTLE_CONFIG } from '@core/core/index.ts';
import type { Skill, LearnableMove, Monster, MonsterPhenotype } from '@core/core/index.ts';
import { partUrls } from '../mocks/assets/parts-detailed/manifest';

/**
 * A chance as the player should read it.
 *
 * Every probability in this file is printed, never softened into 「確率で」:
 * a 60% bind, a 30% flinch and a 40% miss were all being described with the
 * same four characters, which is how a move ends up feeling different from
 * what it said.
 */
function percent(chance: number): string {
  const value = chance * 100;
  // A rounded 0% or 100% would be a lie in the one direction that matters.
  const shown = value < 1 ? value.toFixed(1) : String(Math.round(value));
  return `${shown}%`;
}

export const partNames: Record<string, string> = { tail:'尻尾', horns:'角', wings:'翼', jaw:'口・顎', eyes:'目', crest:'頭飾り', bodyShape:'体型', size:'体の大きさ' };
export function moveHelp(skill: Skill, caster?: Monster) {
  const b = getMoveBehavior(skill.id);
  const lines: string[] = [];
  if (b.attacks) lines.push(b.hits > 1 ? `相手を${b.hits}回攻撃する。` : '相手にダメージを与える。');
  else lines.push('攻撃しない補助技。');
  if (b.heal) lines.push(`${b.target === 'self' ? '自分' : b.target === 'both' ? '双方' : '相手'}のHPを${caster ? getMoveHealing(skill.id, caster) : "魔力に応じて"}回復する。${caster ? "（この個体の魔力での回復量・最大HPまで）" : ""}`);
  if (b.piercesDefense) lines.push('相手の「守る」を無視して攻撃する。');
  if (b.shattersDefense) lines.push('相手の防御力を無視する。「守る」の効果は受ける。');
  const conditions = {targetDefending:'相手が守っているとき',targetNotDefending:'相手が守っていないとき',targetBound:'相手が拘束されているとき',selfPoisoned:'自分が毒のとき',targetSeeded:'相手に種が付いているとき'};
  for (const c of b.conditions) lines.push(`${conditions[c.when]}、ダメージが${c.factor}倍になる。`);
  // Grouped by status, because a move that can bind for one turn and
  // sometimes for two carries that as two entries, and printing them as two
  // lines reads like two different binds.
  const byStatus = new Map<string, typeof b.applies[number][]>();
  for (const a of b.applies) {
    const key = `${a.target}:${a.status}`;
    byStatus.set(key, [...(byStatus.get(key) ?? []), a]);
  }
  for (const group of byStatus.values()) {
    const entries = [...group].sort((x, y) => y.chance - x.chance);
    const a = entries[0] as typeof group[number];
    const who = a.target === 'self' ? '自分' : '相手';
    const effect: Record<string,string> = {
      recoil:'反動で動けなくなる', bind:'拘束されて動けなくなる', flinch:'ひるんで動けなくなる',
      blind:`暗闇になり、物理攻撃を${Math.round(DEFAULT_BATTLE_CONFIG.blindEvasion * 100)}%の確率でかわされる`, poison:'毒になり、毎ターンHPが減る',
      attackUp:`攻撃力が${a.magnitude ?? 2}倍になる`, doubleStrike:'2回行動できる',
      reflect:'受けた攻撃を跳ね返す', evasion:'攻撃をかわしやすくなる',
      seed:'種が付く。付けた本人が炎で追撃すると威力アップ、水で追撃すると拘束できる',
    };
    // The number, not 「確率で」. A 60% bind and a 30% flinch are not the same
    // promise, and the player was being told the same thing about both.
    const odds = a.chance < 1 ? `${percent(a.chance)}・` : '';
    const longer = entries[1];
    const extra = longer
      // Conditional: of the ones that land, this share holds for longer.
      ? `。そのうち${percent(longer.chance / a.chance)}は${longer.turns}ターン続く`
      : '';
    lines.push(`${who}：${effect[a.status] ?? STATUS_LABELS[a.status]}（${odds}${a.turns}ターン${extra}）。`);
  }
  if (b.applies.some(a => STATUS_POLARITY[a.status] === 'debuff')) lines.push('すでに同じ弱体効果が付いている間は、重ねがけや残りターンの延長はできない。');
  if (b.restoreMp) lines.push(`自分のMPを${b.restoreMp}回復する。`);
  if (b.transfersDebuffs) lines.push('自分に付いた弱体効果を相手に移す。');
  for (const c of b.cleanse) lines.push(`${c.target === 'self' ? '自分' : '相手'}の${c.polarity === 'buff' ? '強化' : '弱体'}効果を解除する。`);
  for (const c of b.cure) lines.push(`${c.target === 'self' ? '自分' : '相手'}の${c.statuses.map(s => STATUS_LABELS[s]).join('・')}を解除する。`);
  if (b.instantDeathChance) lines.push(`${percent(b.instantDeathChance)}の確率で相手を一撃で倒す。`);
  if (b.successChance < 1) lines.push(`${percent(1 - b.successChance)}の確率で外れる。`);
  if (b.repeatSuccessChance !== undefined) lines.push(`2ターン続けて使うと、成功率が${percent(b.repeatSuccessChance)}まで落ちる。`);
  if (b.noConsecutiveUse) lines.push('2ターン続けては使えない。');
  if (b.usableWhileBound) lines.push('拘束されていても使える。');
  return { attacks:b.attacks, lines, summary:lines[1] ?? lines[0] };
}
export function highlightPart(move?: LearnableMove) {
  return move?.source === 'bodyShape' || move?.source === 'size' ? 'body' : move?.source ?? undefined;
}

/**
 * The pixel art of the body part a move came from.
 *
 * A move's name says nothing about where it came from, and the slot list is
 * where that matters most: three names in a column look interchangeable, while
 * a tail, a horn and a pair of wings do not. Empty string when there is no art
 * for that part, so callers can fall back to a mark.
 */
export function movePartArt(source: string | null | undefined, phenotype?: MonsterPhenotype): string {
  if (!source || !phenotype) return '';
  const look = phenotype as unknown as Record<string, unknown>;
  const key = source === 'size' || source === 'bodyShape'
    ? `body/${String(look.bodyShape)}`
    : `${source}/${String(look[source])}`;
  return partUrls[key] ?? '';
}
