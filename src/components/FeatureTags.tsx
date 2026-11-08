import type { MonsterTag } from "@core/core/index.ts";
import type { Monster } from "../shared/ui";
import { partUrls } from "../mocks/assets/parts-detailed/manifest";
import "../styles/fusion.css";
import "../styles/gene-features.css";

const colors: Record<string, string> = { red: '#e5776d', blue: '#78b6ec', green: '#8cbb75', yellow: '#edcd70', purple: '#ba8ad3', white: '#e8ece5', black: '#505661' };
const elements: Record<string, string> = { fire: '炎', water: '水', earth: '土', wind: '風', light: '光', dark: '闇', neutral: '無' };
function GeneCard({ tag }: { tag: MonsterTag }) {
  // Use this allele's art, never the current phenotype for a hidden feature.
  const icon = partUrls[`${tag.locus === 'bodyShape' ? 'body' : tag.locus}/${tag.value}`];
  const color = tag.locus === 'bodyColor' ? colors[String(tag.value)] : undefined;
  return <li className="gene-feature">
    <span className="gene-feature-art" aria-hidden="true">
      {icon ? <img src={icon} alt="" /> : color ? <span className="gene-color" style={{ background: color }} /> : <span>{tag.value === 'none' ? '―' : tag.locus === 'element' ? elements[String(tag.value)] ?? '◇' : tag.locus === 'size' ? '↕' : '◇'}</span>}
    </span>
    <span className="gene-feature-copy"><small>{tag.locusLabel}</small><strong>{tag.label}</strong>
      {tag.kind === 'mutation' && <span className="gene-mutation">突然変異</span>}
    </span>
  </li>;
}
function GeneList({ tags }: { tags: MonsterTag[] }) {
  return <ul className="gene-feature-grid">{tags.map((tag, i) => <GeneCard key={`${tag.locus}-${tag.kind}-${i}`} tag={tag} />)}</ul>;
}
export function FeatureTags({ monster, compact = false }: { monster: Monster; compact?: boolean }) {
  const all = monster.tags ?? [];
  const visible = all.filter(tag => tag.expressed && tag.kind !== 'hidden');
  const recessive = all.filter(tag => !tag.expressed && tag.kind !== 'hidden');
  const hidden = all.filter(tag => tag.kind === 'hidden');
  if (compact) return <div className="feature-tags"><div className="tag-list">{visible.slice(0, 3).map((tag, i) =>
    <span className={`gene-tag tag-${tag.kind}`} key={`${tag.locus}-${i}`}>{tag.locusLabel}：{tag.label}</span>)}</div></div>;
  if (!all.length) return <p>このモンスターの遺伝情報はまだありません。</p>;
  return <div className="gene-features">
    <section className="gene-visible" aria-label="今、現れている特徴">
      <h3>今、現れている特徴 <small>優性など</small></h3>
      <p className="gene-explanation">今の見た目や属性をつくる特徴です。</p>
      <GeneList tags={visible} />
    </section>
    <details className="gene-hidden" key={monster.id}>
      <summary>隠れている特徴を見る <span>{recessive.length + hidden.length}件</span></summary>
      <p className="gene-explanation">今の姿には出ていませんが、子孫に受け継がれることがあります。</p>
      {recessive.length > 0 && <section aria-label="劣性の特徴"><h4>表に出ていない特徴 <small>劣性など</small></h4><GeneList tags={recessive} /></section>}
      {hidden.length > 0 && <section aria-label="隠し遺伝子"><h4>奥に眠る特徴 <small>隠し遺伝子</small></h4><p className="gene-explanation">世代をこえて、子孫の姿に現れることがあります。</p><GeneList tags={hidden} /></section>}
      {recessive.length + hidden.length === 0 && <p>隠れている特徴はありません。</p>}
    </details>
    <p className="gene-footnote">優性・劣性は強さの順位ではありません。絵はパーツの形の見本です。</p>
  </div>;
}
