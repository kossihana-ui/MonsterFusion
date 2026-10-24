import type { Monster } from "../shared/ui";
import "../styles/fusion.css";

const kinds = { dominant: "優性", recessive: "劣性", hidden: "隠し遺伝子", mutation: "突然変異" };
export function FeatureTags({ monster, compact = false }: { monster: Monster; compact?: boolean }) {
  const all = monster.tags ?? [];
  const tags = compact ? all.filter(t => t.expressed && t.kind !== "hidden").slice(0, 3) : all;
  return <div className="feature-tags">
    {!compact && <p className="tag-legend">赤：優性 · 青：劣性 · 紫枠：隠し遺伝子 · 紫：突然変異</p>}
    <div className="tag-list">{tags.map((tag, i) =>
      <span className={`gene-tag tag-${tag.kind}`} key={`${tag.locus}-${i}`}
        title={`${kinds[tag.kind]} / ${tag.expressed ? "発現中" : "未発現"}${tag.codominant ? " / 共優性" : ""}`}>
        {!compact && <small>{kinds[tag.kind]} · </small>}
        {tag.locusLabel}：{tag.label}{tag.expressed && !compact ? " ●" : ""}
      </span>)}</div>
  </div>;
}
