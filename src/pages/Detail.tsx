import { useState } from "react";
import type { LearnableMove } from "@core/core/index.ts";
import { highlightPart, partNames } from "../shared/moveHelp";
import type { Monster } from "../shared/ui";
import { Portrait, Stats } from "../components/MonsterView";
import { FeatureTags } from "../components/FeatureTags";
import { MoveLoadoutEditor } from "../components/MoveLoadoutEditor";
import "../styles/battle.css";
export function Detail({
  monster,
  monsters,
  onBack,
}: {
  monster: Monster;
  monsters: Monster[];
  onBack: () => void;
}) {
  const [inspected, setInspected] = useState<LearnableMove | undefined>();
  return (
    <>
      <button className="text-button" onClick={onBack}>
        ← 図鑑へ戻る
      </button>
      <div className="hero">
        <div>
          <div className="eyebrow">MONSTER PROFILE</div>
          <h1>{monster.name}</h1>
          <p>
            GEN. {monster.generation} · {monster.genes.element}属性
          </p>
        </div>
      </div>
      <div className="detail-grid move-detail-grid">
        <MoveLoadoutEditor key={monster.id} monsterId={monster.id} onInspect={setInspected}>
          <Portrait monster={monster} large highlight={highlightPart(inspected)} />
          {inspected && <p className="part-focus-label">{inspected.skill.name} ← {inspected.source ? partNames[inspected.source] : "共通技"}</p>}
          <Stats monster={monster} />
        </MoveLoadoutEditor>
        <section className="panel details">
          <h2>特徴</h2>
          {monster.traits.length ? (
            monster.traits.map((t) => (
              <p key={t.id}>
                <strong>{t.name}</strong>
              </p>
            ))
          ) : (
            <p>まだ特徴は登録されていません。</p>
          )}
          <h2>受け継ぐ特徴</h2>
          <FeatureTags monster={monster} />
          <h2>親モンスター</h2>
          <p>
            {monster.parentIds
              .map((id) => monsters.find((m) => m.id === id)?.name ?? id)
              .join(" × ") || "始祖個体（親情報なし）"}
          </p>
          <h2>個体ID</h2>
          <code>{monster.id}</code>
        </section>
      </div>
    </>
  );
}
