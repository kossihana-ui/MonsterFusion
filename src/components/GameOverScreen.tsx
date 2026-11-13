import { useEffect, useRef, useState } from 'react';
import '../styles/game-over.css';
export function GameOverScreen({ muted, onRestart }: { muted: boolean; onRestart: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [silent, setSilent] = useState(muted);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (silent) return;
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/music/game-over.wav`);
    audio.volume = .38;
    const timer = window.setTimeout(() => { void audio.play().catch(() => {}); }, 1200);
    return () => { clearTimeout(timer); audio.pause(); audio.src = ''; };
  }, [silent]);
  return <dialog ref={dialog} className="game-over-screen" aria-labelledby="game-over-title" onCancel={event => event.preventDefault()}>
    <div className="game-over-black" aria-hidden="true" />
    <div className="game-over-content">
      <h1 id="game-over-title">GAME OVER</h1>
      <p className="game-over-message">手持ちのモンスターがいなくなった…</p>
      <button className="primary" onClick={onRestart}>もう一度はじめる</button>
      <p>最初から始めると、今回集めたパーツもリセットされます。</p>
      <button className="text-button" data-custom-sound aria-pressed={!silent} onClick={() => setSilent(value => !value)}>音楽：{silent ? 'オフ' : 'オン'}</button>
    </div>
  </dialog>;
}
