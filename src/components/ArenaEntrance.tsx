import { useEffect, useRef, useState } from "react";
import type { Monster } from "../shared/ui";
import { Portrait } from "./MonsterView";
import "../styles/arena-entrance.css";

export function ArenaEntrance({ monsters, onEnter }: { monsters: Monster[]; onEnter: (id: string) => void }) {
  const [selected, setSelected] = useState(monsters[0].id);
  const [opening, setOpening] = useState(false);
  const pending = useRef(false);
  const chosen = monsters.find(m => m.id === selected) ?? monsters[0];
  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => onEnter(chosen.id), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1250);
    return () => window.clearTimeout(timer);
  }, [opening, chosen.id, onEnter]);
  return <>
    <div className="hero"><div><div className="eyebrow">ARENA GATE</div><h1>バトルアリーナ</h1><p>出場する仲間を選んで、扉の向こうへ。</p></div></div>
    <div className="arena-entry-layout">
      <section className="panel"><h2>出場モンスター</h2>
        <div className="arena-roster">{monsters.map(m => <button key={m.id} type="button" aria-pressed={chosen.id === m.id} disabled={opening} onClick={() => setSelected(m.id)}><strong>{m.name}</strong><span>{m.genes.element} · 第{m.generation}世代</span></button>)}</div>
        <p className="battle-help">技は図鑑の「技セット」で変更できます。</p>
        <p className="battle-help">現在は所有モンスター同士の模擬戦です。ランダム敵・5連勝後のボス・パーツ報酬は準備中です。</p>
        <button type="button" className="arena-enter" disabled={opening} onClick={() => { if (!pending.current) { pending.current = true; setOpening(true); } }}> {opening ? "扉を開いています…" : `${chosen.name}で入場する`} </button>
      </section>
      <section className={`arena-gate ${opening ? "is-opening" : ""}`} aria-label="アリーナの扉">
        <div className="arena-gate-inner"><Portrait monster={chosen} large /><strong>{chosen.name}</strong></div>
        <div className="arena-door arena-door-left" aria-hidden="true"><span>MF</span></div>
        <div className="arena-door arena-door-right" aria-hidden="true"><span>ARENA</span></div>
        <p className="arena-gate-status" role="status">{opening ? "GATE OPEN · 出撃" : "STANDBY · 出場待ち"}</p>
      </section>
    </div>
  </>;
}
