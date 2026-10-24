import type { CSSProperties } from "react";
import "../styles/fusion-machine.css";

const ease = (x: number) => { x = Math.min(1, Math.max(0, x)); return x*x*(3-2*x); };
// Seconds relative to the beginning of the door closing.
// Audio starts at .6; latch/impact/vent within the WAV are 1.89/2.08/2.17.
export const machineTiming = { close: .6, latch: 2.49, impact: 2.68, vent: 2.77, open: 3.42, end: 4.2 };
export function FusionMachine({ time }: { time: number }) {
  const opening = ease((time-machineTiming.vent)/.65);
  const separation = time < .6 ? 1-ease(time/.6) : opening;
  const spinTime = Math.max(0, Math.min(1.86, time-.6));
  const turns = .3*spinTime + 1.7*spinTime*spinTime;
  const light = time >= .6 && time < machineTiming.vent;
  const style = { "--door-gap": `${separation*94}%`, "--spin": `${turns*360}deg` } as CSSProperties;
  const status = time < .6 ? "CHAMBER SEALING" : time < machineTiming.latch ? "FUSION / PROCESSING" : time < machineTiming.vent ? "LOCK RELEASE" : "CHAMBER OPEN";
  return <div data-phase={time < .6 ? "closing" : time < machineTiming.vent ? "closed" : time < machineTiming.open ? "opening" : "open"}
    className={`fusion-machine ${time >= machineTiming.impact && time < machineTiming.vent ? "machine-unlock" : ""}`} style={style} aria-hidden="true">
    <div className="machine-rail rail-left" /><div className="machine-rail rail-right" />
    {["top","bottom"].map(side => <div key={side} className={`machine-door door-${side}`}>
      <div className="door-plate"><span className="door-code">{side === "top" ? "MF / FUSION CHAMBER" : status}</span><i /><i /></div>
      <div className="half-ring"><div className="ring-disc">
        <div className="ring-groove" />
        <div className="ring-rotor" style={{opacity: light ? 1 : .25}}><b /><b /></div>
        <div className="ring-hub"><span>MF</span><small>{time < machineTiming.vent ? "SEALED" : "OPEN"}</small></div>
      </div></div>
      <div className="door-seam" />
    </div>)}
    {time >= machineTiming.vent && time < machineTiming.end && <div className="machine-steam"><i /><i /><i /><i /></div>}
    <div className="chamber-corner corner-tl" /><div className="chamber-corner corner-br" />
  </div>;
}
