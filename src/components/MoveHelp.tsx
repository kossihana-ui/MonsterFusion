import type { LearnableMove, Skill, MonsterPhenotype } from '@core/core/index.ts';
import { partUrls } from '../mocks/assets/parts-detailed/manifest';
import { moveHelp, partNames } from '../shared/moveHelp';
import { skillLabel } from '../shared/battlePresentation';
import '../styles/move-help.css';
export function MoveHelp({skill,move,phenotype}: {skill:Skill;move?:LearnableMove;phenotype?:MonsterPhenotype}) {
  const help=moveHelp(skill);
  const source=move?.source;
  const key = source && phenotype ? source === 'size' || source === 'bodyShape' ? `body/${phenotype.bodyShape}` : `${source}/${phenotype[source]}` : '';
  const icon=partUrls[key];
  return <div className="move-help">
    <strong>{skillLabel(skill)} · {help.attacks ? '攻撃技' : '補助技'} · MP {skill.cost}</strong>
    <ul>{help.lines.map((line,i)=><li key={i}>{line}</li>)}</ul>
    <p className="move-source">{icon && <img src={icon} alt={`${source ? partNames[source] : ''}の形の見本`} />}{move?.source ? `◆ 習得元：${partNames[move.source] ?? move.source}` : '◆ 共通技（特定の部位に依存しません）'}{move && <small>{move.reason}</small>}</p>
  </div>;
}
