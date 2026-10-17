import { useState } from "react";
import type { FusionResult, GameAdapter, Monster } from "../shared/types";
import { Portrait } from "../components/MonsterView";
export function Fusion({
  monsters,
  adapter,
  onCreated,
}: {
  monsters: Monster[];
  adapter: GameAdapter;
  onCreated: (m: Monster) => void;
}) {
  const [a, setA] = useState(monsters[0]?.id ?? "");
  const [b, setB] = useState(monsters[1]?.id ?? "");
  const [result, setResult] = useState<FusionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const parentA = monsters.find((m) => m.id === a);
  const parentB = monsters.find((m) => m.id === b);
  async function fuse() {
    if (!parentA || !parentB || a === b || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await adapter.fuseMonsters(parentA, parentB);
      onCreated(r.child);
      setResult(r);
    } catch {
      setError("融合に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">FUSION ATELIER</div>
          <h1>融合のアトリエ</h1>
          <p>ふたつの命から、まだ見ぬ可能性へ。</p>
        </div>
        <span className="badge">デモ融合</span>
      </div>
      <div className={`fusion-grid ${busy ? "is-fusing" : ""}`}>
        {[
          { label: "親 A", id: a, set: setA, monster: parentA },
          { label: "親 B", id: b, set: setB, monster: parentB },
        ].map((p) => (
          <section className="panel parent" key={p.label}>
            <h2>{p.label}</h2>
            <select
              aria-label={p.label}
              value={p.id}
              disabled={busy}
              onChange={(e) => {
                p.set(e.target.value);
                setResult(null);
              }}
            >
              {monsters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · 第{m.generation}世代
                </option>
              ))}
            </select>
            {p.monster && (
              <>
                <Portrait monster={p.monster} large />
                <h3>{p.monster.name}</h3>
                <span className="generation">
                  第 {p.monster.generation} 世代
                </span>
              </>
            )}
          </section>
        ))}
      </div>
      <div className="fusion-action">
        <span>✧</span>
        <button
          className="primary"
          disabled={!parentA || !parentB || a === b || busy}
          onClick={fuse}
        >
          {busy ? "融合中…" : "✦ 融合する"}
        </button>
        <p>
          {monsters.length < 2
            ? "融合には2体必要です。32×32のPNGを登録してください。"
            : a === b
            ? "異なる2体を選んでください。"
            : "デモでは親を残したまま、新しい個体が図鑑に加わります。"}
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="panel result" aria-live="polite">
        <div className="eyebrow">FUSION RESULT</div>
        {result ? (
          <>
            <Portrait monster={result.child} />
            <h2>{result.child.name}</h2>
            <p>第 {result.child.generation} 世代</p>
            <p>親：{result.parents.map((p) => p.name).join(" × ")}</p>
            <span className="badge">図鑑に登録しました</span>
          </>
        ) : (
          <>
            <h2>新しい出会いを待っています</h2>
            <p>親となる2体を選んで融合しましょう。</p>
          </>
        )}
      </section>
    </>
  );
}
