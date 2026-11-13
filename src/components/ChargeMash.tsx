import { useEffect, useRef, useState } from "react";
import { battleSound } from "./battleSound";
import "../styles/charge-mash.css";

/**
 * The five seconds ファイナルテール asks the player to earn.
 *
 * Core decides what a press is worth and refuses to guess the count, so this
 * is the only thing that knows how many there were. It counts the space bar,
 * and it counts a tap on the big button too - a move that only works with a
 * keyboard is a move half the players cannot use.
 */
export function ChargeMash({
  skillName, seconds, perPress, muted, onDone,
}: {
  skillName: string;
  seconds: number;
  perPress: number;
  muted: boolean;
  onDone: (count: number) => void;
}) {
  const [count, setCount] = useState(0);
  const [remaining, setRemaining] = useState(seconds);
  const [pressed, setPressed] = useState(false);
  const done = useRef(false);
  const total = useRef(0);
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
        finish.current(total.current);
      }
    }, 50);

    const hit = () => {
      if (done.current) return;
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
  }, [muted, seconds]);

  const share = Math.max(0, Math.min(1, remaining / seconds));

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
        <p className="charge-mash-count" aria-live="off">
          <strong>{count}</strong> 回
        </p>
        <div className="charge-mash-bar" aria-hidden="true">
          <span style={{ width: `${share * 100}%` }} />
        </div>
        <p className="charge-mash-left">のこり {remaining.toFixed(1)} 秒</p>
        <p className="charge-mash-help">連打した回数 × {perPress} がそのままダメージになります。</p>
      </div>
    </div>
  );
}
