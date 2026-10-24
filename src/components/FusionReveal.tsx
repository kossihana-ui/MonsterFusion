import { useEffect, useRef, useState } from "react";
import type { FusionResult } from "../shared/ui";
import { Portrait } from "./MonsterView";
import { FeatureTags } from "./FeatureTags";
import "../styles/fusion.css";

export function FusionReveal({ result, onFinished }: { result: FusionResult; onFinished: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  const [skip, setSkip] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const audio = useRef<AudioContext | null>(null);
  const section = useRef<HTMLElement | null>(null);
  const sounded = useRef(-1);
  const steps = result.summary?.steps ?? [];
  const gap = steps.length > 10 ? 160 : 280;
  let cursor = 1500;
  const times = steps.map(step => {
    cursor += step.kind === "evolution" ? 750 : step.kind === "mutation" ? 400 : step.kind === "atavism" ? 350 : gap;
    return cursor;
  });
  const complete = skip || reduced || elapsed >= cursor + 700;
  const count = complete ? steps.length : times.filter(t => elapsed >= t).length;
  const current = steps[count - 1];
  const phase = complete ? "complete" : elapsed < 950 ? "converge" : elapsed < 1000 ? "flash" : elapsed < 1500 ? "silhouette" : "reveal";

  useEffect(() => {
    section.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (complete) { onFinished(); return; }
    const start = performance.now();
    const timer = window.setInterval(() => setElapsed(performance.now() - start), 25);
    return () => window.clearInterval(timer);
  }, [complete, onFinished]);
  useEffect(() => () => { void audio.current?.close(); }, []);
  useEffect(() => {
    if (count <= sounded.current) return;
    sounded.current = count;
    const ctx = audio.current;
    if (!ctx || muted || complete || !current || ctx.state !== "running") return;
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = "triangle";
    const frequency = { inherited: 440, atavism: 587, mutation: 784, evolution: 1047 }[current.kind];
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.5, ctx.currentTime + .16);
    gain.gain.setValueAtTime(current.kind === "inherited" ? .025 : .055, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .22);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .23);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }, [count, current, muted, complete]);
  async function toggleSound() {
    if (!muted) {
      setMuted(true);
      await audio.current?.suspend().catch(() => {});
      return;
    }
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setMuted(false);
    } catch { setMuted(true); }
  }
  return <section ref={section} className="panel fusion-reveal" aria-label="融合結果">
    <div className="reveal-toolbar">
      <span className="eyebrow">NEW LIFE / 第 {result.child.generation} 世代</span>
      <div>
        <button onClick={() => void toggleSound()} aria-pressed={!muted}>{muted ? "音：オフ" : "音：オン"}</button>
        {!complete && <button onClick={() => setSkip(true)}>演出をスキップ</button>}
      </div>
    </div>
    <div className={`reveal-stage phase-${phase}`} aria-hidden="true">
      {phase === "converge" && <div className="converging-parents">
        <div><Portrait monster={result.parents[0]} facingRight /></div>
        <div><Portrait monster={result.parents[1]} /></div>
        <span className="fusion-particles">✧ · ✦ · ✧</span>
      </div>}
      {phase !== "converge" && <div className={`reveal-child ${!complete ? `fx-${current?.kind ?? "inherited"}` : ""}`}>
        <Portrait monster={result.child} large />
        {current?.kind === "evolution" && !complete && <div className="evolution-pillar" />}
      </div>}
      {phase === "flash" && <div className="fusion-flash" />}
    </div>
    <div className="reveal-heading" role="status">
      <h2>{complete || current?.kind === "evolution" ? result.child.name : "新しい命が、目を覚ます…"}</h2>
      <p>{complete ? "融合完了 · 図鑑に登録しました" : current?.note ?? "ふたつの系譜が重なっています"}</p>
    </div>
    <div className="reveal-tags" aria-label="受け継いだ特徴">
      {steps.slice(0, count).map((step, i) => <span key={i} className={`reveal-tag fx-${step.kind}`}>
        <strong>{step.locusLabel ? `${step.locusLabel}：` : ""}{step.label}</strong>
        <small>{step.note}</small>
      </span>)}
    </div>
    {complete && <>
      <p>親：{result.parents.map(p => p.name).join(" × ")}</p>
      {result.summary && <p>突然変異 {result.summary.mutationCount} · 先祖返り {result.summary.atavismCount}{result.summary.evolved ? " · 進化しました" : ""}</p>}
      <FeatureTags monster={result.child} compact />
    </>}
  </section>;
}
