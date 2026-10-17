import type { Monster } from "../shared/ui";
import { Portrait, Stats } from "../components/MonsterView";
export function Detail({
  monster,
  monsters,
  onBack,
}: {
  monster: Monster;
  monsters: Monster[];
  onBack: () => void;
}) {
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
      <div className="detail-grid">
        <section className="panel">
          <Portrait monster={monster} large />
          <Stats monster={monster} />
        </section>
        <section className="panel details">
          <h2>特徴</h2>
          {monster.traits.length ? (
            monster.traits.map((t) => (
              <p key={t.id}>
                <strong>{t.name}</strong>
                <br />
                {t.description}
              </p>
            ))
          ) : (
            <p>まだ特徴は登録されていません。</p>
          )}
          <h2>遺伝情報</h2>
          <dl>
            {Object.entries(monster.genes).map(([k, v]) => (
              <div key={k}>
                <dt>
                  {{ element: "属性", body: "系統", potential: "潜在性" }[k]}
                </dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
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
