import { useEffect, useRef, useState } from "react";
import { battleSound } from "./battleSound";
import { flagAutomation } from "../shared/record";
import "../styles/charge-mash.css";

/**
 * The five seconds ファイナルテール asks the player to earn.
 *
 * Core decides what a press is worth and refuses to guess the count, so this
 * is the only thing that knows how many there were. It counts the space bar,
 * and it counts a tap on the big button too - a move that only works with a
 * keyboard is a move half the players cannot use.
 *
 * Auto-clickers are against the rules and the screen says so. It cannot stop
 * one, and does not pretend to: the ceiling in core is what makes a tool
 * pointless, and this only notices the obvious ones so the run can be marked.
 */
export function ChargeMash({
  skillName, seconds, perPress, cap, muted, onDone,
}: {
  skillName: string;
  seconds: number;
  perPress: number;
  /** Presses past this buy nothing. Core enforces it; this shows it. */
  cap: number;
  muted: boolean;
  onDone: (count: number) => void;
}) {
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState(seconds);
  const [pressed, setPressed] = useState(false);
  const done = useRef(false);
  const total = useRef(0);
  const gaps = useRef<number[]>([]);
  const last = useRef(0);
  const finish = useRef(onDone);
  finish.current = onDone;
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stop = battleSound('final-tail', muted);
    const started = performance.now();
    const tick = window.setInterval(() => {
      const left = seconds - (performance.now() - started) / 1000;
      setRemaining(Math.max(0, left));
      if (left <= 0 && !done.current) {
        done.current = true;
        window.clearInterval(tick);
        stop();
        if (looksAutomated(gaps.current, total.current, seconds, cap)) flagAutomation();
        finish.current(total.current);
      }
    }, 50);

    const hit = () => {
      if (done.current) return;
      const now = performance.now();
      if (last.current) gaps.current.push(now - last.current);
      last.current = now;
      total.current += 1;
      setCount(total.current);
      setPressed(true);
      window.setTimeout(() => setPressed(false), 60);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      event.preventDefault(); // the page would scroll under the overlay
      if (event.repeat) return; // held down is one press, not a thousand
      hit();
    };
    window.addEventListener('keydown', onKey, { passive: false });
    const el = buttonRef.current;
    el?.addEventListener('pointerdown', hit);
    return () => {
      done.current = true;
      window.clearInterval(tick);
      stop();
      window.removeEventListener('keydown', onKey);
      el?.removeEventListener('pointerdown', hit);
    };
  }, [muted, seconds, cap]);

  const share = Math.max(0, Math.min(1, remaining / seconds));
  const counted = Math.min(count, cap);
  const maxed = count >= cap;

  return (
    <div className="charge-mash" role="dialog" aria-label={`${skillName}の連打`}>
      <div className="charge-mash-card">
        <h2>{skillName}</h2>
        <p className="charge-mash-call">スペースキーを連打！</p>
        <button ref={buttonRef} type="button" data-custom-sound
          className={`charge-mash-key ${pressed ? 'is-down' : ''}`}
          aria-label="連打する（スペースキーでも可）">
          <span>SPACE</span>
        </button>
        <p className={`charge-mash-count ${maxed ? 'is-maxed' : ''}`} aria-live="off">
          <strong>{counted}</strong> 回 <small>／ {cap}回まで</small>
        </p>
        <div className="charge-mash-bar" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </div>
        <p className="charge-mash-left">のこり {remaining.toFixed(1)} 秒</p>
        <p className="charge-mash-help">
          {maxed
            ? `上限に達しました。${cap}回 × ${perPress} = ${cap * perPress} ダメージです。`
            : `連打した回数 × ${perPress} がそのままダメージになります。`}
        </p>
        <p className="charge-mash-rule">
          連打ツール（オートクリッカー等）の使用は禁止です。1秒あたり{Math.round(cap / seconds)}回までしか数えません。
        </p>
      </div>
    </div>
  );
}

/**
 * Whether these presses came from a machine.
 *
 * Deliberately blunt and deliberately shy: a person's rhythm wanders by
 * tens of milliseconds even when they are trying to be even, while a tool
 * repeats to the millisecond. Only a long, almost perfectly regular run
 * counts, so a fast human is never accused.
 */
export function looksAutomated(
  gaps: readonly number[],
  total: number,
  seconds: number,
  cap: number,
): boolean {
  // Faster than the ceiling allows, by a margin no hand reaches.
  if (total > cap * 1.5) return true;
  if (gaps.length < 25) return false;
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  if (mean <= 0) return true;
  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  const spread = Math.sqrt(variance) / mean;
  // Under 6% wobble over 25+ presses is a timer, not a thumb.
  return spread < 0.06 && total / seconds > cap / seconds * 0.6;
}
