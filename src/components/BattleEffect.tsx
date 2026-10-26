import type { Element } from "@core/core/index.ts";
import "../styles/battle-effects.css";

export interface BattleCue {
  sequence: number; name: string; skillId: string; element: Element;
  target: number; finisher: boolean; damage: number;
}
export function effectShape(id: string, element: Element) {
  if (/tail|lash|whip|sweep|coil/.test(id)) return "sweep";
  if (/bite|beak|gore|tusk/.test(id)) return "bite";
  if (/charge|horn|thrust|ram|slam|press|break|crush/.test(id) && !id.startsWith("sig-")) return "impact";
  if (/eye|gaze|ray|pulse|order/.test(id)) return "beam";
  if (/wing|cutter|slash/.test(id)) return "slash";
  if (/pollen|shard/.test(id)) return "burst";
  return ({ fire: "flame", water: "wave", wind: "slash", earth: "impact", light: "beam", dark: "vortex", neutral: "burst" } as const)[element];
}
export function BattleEffect({ cue }: { cue: BattleCue }) {
  const shape = effectShape(cue.skillId, cue.element);
  return <div className={`battle-fx ${cue.finisher ? "battle-fx-major" : ""}`} data-element={cue.element} aria-hidden="true">
    <div className="fx-title">{cue.finisher && <small>大技</small>}{cue.name}</div>
    <div className="fx-hit" style={{ left: cue.target === 0 ? "25%" : "75%" }}>
      <svg className={`fx-art fx-${shape}`} viewBox="0 0 200 200">
        {shape === "sweep" && <><path d="M15 150 Q170 180 175 35 Q120 130 15 150Z"/><path d="M25 175 Q170 190 190 55" fill="none"/></>}
        {shape === "bite" && <><path d="M30 25 L55 90 L80 45 L100 95 L125 45 L150 90 L175 25Z"/><path d="M30 175 L55 110 L80 155 L100 105 L125 155 L150 110 L175 175Z"/></>}
        {shape === "impact" && <path d="M100 10 L118 65 L174 35 L140 88 L195 105 L140 120 L165 175 L110 140 L80 195 L75 135 L15 155 L55 105 L10 70 L70 70Z"/>}
        {shape === "beam" && <><path d="M0 85 L200 95 L200 110 L0 125Z"/><circle cx="125" cy="100" r="52" fill="none"/><path d="M125 15 V185 M40 100 H195" fill="none"/></>}
        {shape === "slash" && <><path d="M20 160 L150 20 L80 130Z"/><path d="M65 185 L195 45 L125 155Z"/></>}
        {shape === "flame" && <path d="M100 185 C0 165 35 95 65 60 L70 115 Q110 80 105 10 Q175 65 145 110 L170 75 Q210 175 100 185Z"/>}
        {shape === "wave" && <><path d="M10 140 Q50 30 105 70 Q145 115 190 60 L190 145 Q130 190 100 130 Q50 85 10 170Z"/><circle cx="110" cy="100" r="75" fill="none"/></>}
        {shape === "vortex" && <><ellipse cx="100" cy="100" rx="85" ry="40" fill="none"/><ellipse cx="100" cy="100" rx="40" ry="85" fill="none"/><circle cx="100" cy="100" r="30"/></>}
        {shape === "burst" && Array.from({length: 8}, (_, i) => <path key={i} transform={`rotate(${i * 45} 100 100)`} d="M94 25 L100 5 L108 25 L100 60Z"/>)}
      </svg>
      <div className="fx-ring" />
      <b className="fx-damage">−{cue.damage}</b>
    </div>
  </div>;
}
