import { useEffect, useRef, useState } from "react";
import "../styles/sound-lab.css";

const sounds = [
  { id: "round", title: "01 / 丸いフォーン", text: "息のように柔らかく始まり、一定の音程で伸びる音。", word: "フォーン", tags: "柔らかい · 落ち着き" },
  { id: "clear", title: "02 / 透明なフォーン", text: "少し高い響きと、薄い余韻。軽く浮かぶような感触。", word: "フォーン", tags: "透明感 · 浮遊感" },
  { id: "machine", title: "03 / 機械的なフォーン", text: "低めの芯に電子的な響き。跳ねずになめらかに伸びる音。", word: "フォーン", tags: "電子的 · くっきり" },
];
export function SoundLab() {
  const player = useRef<HTMLAudioElement | null>(null);
  const [volume, setVolume] = useState(.5);
  const [playing, setPlaying] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => {
    const audio = player.current;
    if (audio) { audio.pause(); audio.onended = null; audio.onerror = null; }
    player.current = null;
  }, []);
  async function play(id: string) {
    player.current?.pause();
    const audio = new Audio(import.meta.env.BASE_URL + "audio/selection/" + id + ".wav?v=2");
    player.current = audio; audio.volume = volume;
    setError(""); setPlaying(id);
    audio.onended = () => { if (player.current === audio) setPlaying(""); };
    audio.onerror = () => { if (player.current === audio) { setPlaying(""); setError("音声を読み込めませんでした。もう一度お試しください。"); } };
    try { await audio.play(); } catch {
      if (player.current === audio) { setPlaying(""); setError("再生できませんでした。もう一度再生ボタンを押してください。"); }
    }
  }
  return <>
    <div className="hero"><div><div className="eyebrow">SOUND WORKSHOP</div>
      <h1>「フォーン」を探す</h1><p>同じ短い選択音を、3つの質感で。気になる音を押して聴き比べてください。</p></div></div>
    <section className="panel sound-settings">
      <label htmlFor="sound-volume">試聴音量 <strong>{Math.round(volume*100)}%</strong></label>
      <input id="sound-volume" type="range" min="0" max="1" step=".05" value={volume}
        onChange={e => { const value=Number(e.target.value); setVolume(value); if(player.current) player.current.volume=value; }} />
      <button className="text-button" onClick={() => { player.current?.pause(); setPlaying(""); }}>停止</button>
      <p>初期音量は50%。再生ボタンを押すまで音は鳴りません。</p>
    </section>
    <div className="sound-grid">{sounds.map(sound => <section className="panel sound-card" key={sound.id}>
      <div className="eyebrow">{sound.tags}</div><h2>{sound.title}</h2>
      <div className="sound-word" aria-hidden="true">{sound.word}</div><p>{sound.text}</p>
      <button className="primary" onClick={() => void play(sound.id)} aria-label={sound.title+"を再生"}>
        {playing === sound.id ? "♪ 再生中 · もう一度" : "▶ 聴いてみる"}
      </button>
      <a download href={import.meta.env.BASE_URL+"audio/selection/"+sound.id+".wav"}>WAVを保存 ↓</a>
    </section>)}</div>
    {error && <p role="alert">{error}</p>}
    <p className="sound-note">各0.64秒のオリジナル音です。連続で押して、操作を繰り返したときの感触も試せます。</p>
  </>;
}
