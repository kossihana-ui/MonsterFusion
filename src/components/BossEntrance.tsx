import { useEffect, useState } from "react";
import "../styles/boss-entrance.css";

/**
 * The boss arriving.
 *
 * The sixth fight is the first thing in the ladder that is not another
 * opponent, and the hundredth is the top of the whole game. Both of them used
 * to open exactly like the fight before: the same screen, with a different
 * creature standing in it and an orange border round the edge.
 *
 * So they get a moment. It is short, it plays once per encounter, and it
 * never takes the controls - `pointer-events: none` throughout, gone on its
 * own in a couple of seconds - because a player who has just won five fights
 * should not have to wait for an animation to let them play the sixth.
 */
export function BossEntrance({
  name,
  fight,
  final: isFinal,
  onSound,
}: {
  name: string;
  /** Which fight this is, counting from 1. */
  fight: number;
  final: boolean;
  /** Called once, when the arrival lands. The caller decides about muting. */
  onSound?: () => void;
}) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // The thud belongs on the impact, not on the fade-in.
    const hit = window.setTimeout(() => onSound?.(), 420);
    const end = window.setTimeout(() => setGone(true), 2300);
    return () => {
      window.clearTimeout(hit);
      window.clearTimeout(end);
    };
  }, [onSound]);

  if (gone) return null;

  return (
    <div className={`boss-entrance ${isFinal ? "is-final" : ""}`} aria-hidden="true">
      <div className="boss-veil" />
      <div className="boss-bar boss-bar-top" />
      <div className="boss-bar boss-bar-bottom" />
      <div className="boss-ring" />
      <div className="boss-words">
        <p className="boss-kicker">{isFinal ? `${fight}戦目 — 頂上` : `第${fight}戦 — ボス`}</p>
        <p className="boss-name">{name}</p>
      </div>
    </div>
  );
}
