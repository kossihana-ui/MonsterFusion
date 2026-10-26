import { useEffect, useState } from "react";
import "../styles/battle-hp.css";

export function BattleHpBar({ hp, max, label }: { hp: number; max: number; label: string }) {
  const [trail, setTrail] = useState(hp);
  const percent = (value: number) => max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0;
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setTrail(hp); return; }
    const timer = window.setTimeout(() => setTrail(hp), 220);
    return () => window.clearTimeout(timer);
  }, [hp]);
  return <div className="battle-hp-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={hp}>
    <div className="battle-hp-trail" style={{ width: `${percent(Math.max(hp, trail))}%` }} />
    <div className="battle-hp-current" style={{ width: `${percent(hp)}%` }} />
  </div>;
}
