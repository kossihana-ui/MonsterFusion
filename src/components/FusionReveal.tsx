import { useEffect, useRef, useState } from "react";
import type { FusionResult } from "../shared/ui";
import { Portrait } from "./MonsterView";
import { FeatureTags } from "./FeatureTags";
import { FusionMachine, machineTiming } from "./FusionMachine";
import { useFusionPlayback } from "./useFusionPlayback";
import "../styles/fusion.css";

export function FusionReveal({ result, onFinished, soundContext, muted, onMute }: {
  result: FusionResult; onFinished: () => void; soundContext: AudioContext | null;
  muted: boolean; onMute: () => void;
}) {
  const [skip, setSkip] = useState(false);
  const [finished, setFinished] = useState(false);
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const { elapsed, loading, soundUnavailable } = useFusionPlayback(soundContext, muted, skip || reduced || finished);
  const section = useRef<HTMLElement | null>(null);
  const steps = result.summary?.steps ?? [];
  const gap = steps.length > 10 ? 160 : 280;
  let cursor = machineTiming.open * 1000;
  const times = steps.map(step => {
    cursor += step.kind === "evolution" ? 750 : step.kind === "mutation" ? 400 : step.kind === "atavism" ? 350 : gap;
    return cursor;
  });
  const complete = skip || reduced || finished || elapsed >= cursor + 700;
  const count = complete ? steps.length : times.filter(t => elapsed >= t).length;
  const current = steps[count - 1];
  useEffect(() => { section.current?.scrollIntoView({ block: "start", behavior: "instant" }); }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (complete) { setFinished(true); onFinished(); }
  }, [complete, onFinished]);
  return <section ref={section} className="panel fusion-reveal" aria-label="融合結果">
    <div className="reveal-toolbar">
      <span className="eyebrow">NEW LIFE / 第 {result.child.generation} 世代</span>
      <div>
        <button onClick={onMute} aria-pressed={!muted}>{muted ? "音：オフ" : "音：オン"}</button>
        {!complete && <button onClick={() => setSkip(true)}>演出をスキップ</button>}
      </div>
    </div>
    {soundUnavailable && !muted && <p role="status">音声を再生できないため、映像のみで続けます。</p>}
    <div className="reveal-stage machine-stage" aria-hidden="true">
      {!complete && elapsed < machineTiming.close * 1000 ? <div className="converging-parents">
        <div><Portrait monster={result.parents[0]} facingRight /></div>
        <div><Portrait monster={result.parents[1]} /></div>
      </div> : <div className={"reveal-child " + (!complete ? "fx-" + (current?.kind ?? "inherited") : "")}>
        <Portrait monster={result.child} large />
        {current?.kind === "evolution" && !complete && <div className="evolution-pillar" />}
      </div>}
      <FusionMachine time={complete ? machineTiming.end : elapsed / 1000} />
    </div>
    <div className="reveal-heading" role="status">
      <h2>{complete || current?.kind === "evolution" ? result.child.name : "新しい命が、目を覚ます…"}</h2>
      <p>{complete ? "融合完了 · 図鑑に登録しました" : loading ? "装置を準備しています…" : current?.note ?? (elapsed < machineTiming.vent*1000 ? "融合装置が稼働しています" : "圧力を解放しています")}</p>
    </div>
    <div className="reveal-tags" aria-label="受け継いだ特徴">
      {steps.slice(0, count).map((step, i) => <span key={i} className={"reveal-tag fx-" + step.kind}>
        <strong>{step.locusLabel ? step.locusLabel + "：" : ""}{step.label}</strong>
        <small>{result.spentPart && step.locus === result.spentPart.locus ? "投入した素材から発現" : step.note}</small>
      </span>)}
    </div>
    {complete && <>
      <p>親：{result.parents.map(p => p.name).join(" × ")}</p>
      {result.spentPart && <p>使用した素材：{result.spentPart.name} ×1（発現保証）</p>}
      {result.summary && <p>突然変異 {result.summary.mutationCount} · 先祖返り {result.summary.atavismCount}{result.summary.evolved ? " · 進化しました" : ""}</p>}
      <FeatureTags monster={result.child} compact />
    </>}
  </section>;
}
