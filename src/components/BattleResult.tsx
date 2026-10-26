import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import type { BattleState } from "../shared/ui";
import { Portrait } from "./MonsterView";
import "../styles/battle-result.css";

export function BattleResult({ state, onRetry }: { state: BattleState; onRetry?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const won = state.status === "won";
  const draw = state.status === "draw";
  const winner = won ? state.player : state.enemy;
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: "instant" });
    ref.current?.focus({ preventScroll: true });
  }, []);
  return <section ref={ref} tabIndex={-1} className={`battle-result result-${state.status}`} aria-labelledby="battle-result-title">
    {won && <div className="result-sparks" aria-hidden="true">{Array.from({ length: 16 }, (_, i) => <i key={i} style={{ "--angle": `${i * 22.5}deg`, "--delay": `${(i % 4) * .08}s` } as CSSProperties} />)}</div>}
    <div className="result-content">
      <div className="result-eyebrow">{won ? "VICTORY" : draw ? "DRAW" : "DEFEAT"}</div>
      <h2 id="battle-result-title">{won ? "勝利！" : draw ? "引き分け！" : "敗北…"}</h2>
      <p className="result-message">{won ? `${state.player.name}、よくやった！` : draw ? "互いに一歩も譲らない戦いだった。" : "技の組み合わせを変えて、もう一度挑もう。"}</p>
      {draw ? <div className="result-pair"><Portrait monster={state.player} facingRight /><Portrait monster={state.enemy} /></div> : <><div className="result-winner"><Portrait monster={winner} large /></div><p>{won ? "WINNER" : "相手の勝者"} · {winner.name}</p></>}
      <p className="result-turns">{state.coreState?.turn ?? Math.max(0, state.turn - 1)}ターンの戦い</p>
      {onRetry && <button type="button" onClick={onRetry}>↻ もう一度バトル</button>}
      <p className="battle-help">下の戦闘ログで振り返れます。</p>
    </div>
  </section>;
}
