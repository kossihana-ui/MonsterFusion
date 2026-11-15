import { useEffect, useRef, useState } from 'react';
import { getRecord } from '../shared/record';
import { ShareStreak } from './ShareStreak';
import '../styles/game-over.css';
export function GameOverScreen({ muted, onRestart }: { muted: boolean; onRestart: () => void }) {
  // Read once: restarting clears the session, and this screen should keep
  // showing the streak the player just finished.
  const [best] = useState(() => getRecord().best);
  const dialog = useRef<HTMLDialogElement>(null);
  const [silent, setSilent] = useState(muted);
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { dialog.current?.showModal(); }, []);
  // The black is fixed, so it stops at the scrollbar and leaves a lit strip
  // down the side of an otherwise black screen. Take the scrollbar away and
  // pay back its width, so nothing behind shifts while the fade is still see-through.
  useEffect(() => {
    const { body } = document;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const overflow = body.style.overflow;
    const padding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => { body.style.overflow = overflow; body.style.paddingRight = padding; };
  }, []);
  useEffect(() => {
    if (silent) return;
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/music/game-over.wav`);
    audio.volume = .38;
    // Starts as the screen finishes going black, not over the last hit.
    const timer = window.setTimeout(() => {
      void audio.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
    }, attempt === 0 ? 1200 : 0);
    return () => { clearTimeout(timer); audio.pause(); audio.src = ''; };
  }, [silent, attempt]);
  return <dialog ref={dialog} className="game-over-screen" aria-labelledby="game-over-title" onCancel={event => event.preventDefault()}>
    <div className="game-over-black" aria-hidden="true" />
    <div className="game-over-content">
      <h1 id="game-over-title">GAME OVER</h1>
      <p className="game-over-message">手持ちのモンスターがいなくなった…</p>
      <button className="primary" onClick={onRestart}>もう一度はじめる</button>
      <p>最初から始めると、今回集めたパーツもリセットされます。</p>
      {/* The monsters are gone, but the streak happened. It is the only
          thing on this screen worth handing to somebody else. */}
      {best && <>
        <p className="game-over-best">自己ベスト：{best.wins}連勝（{best.monster}）</p>
        <ShareStreak run={best} label="自己ベストを共有" />
      </>}
      {/* Browsers refuse sound a page has not earned. The toggle is the way
          back in, so when that happens it says so rather than staying quiet. */}
      <button className="text-button" data-custom-sound aria-pressed={!silent}
        onClick={() => {
          if (blocked && !silent) { setBlocked(false); setAttempt(n => n + 1); return; }
          setSilent(value => !value);
        }}>
        {blocked && !silent ? '♪ 音楽を鳴らす' : `音楽：${silent ? 'オフ' : 'オン'}`}
      </button>
    </div>
  </dialog>;
}
