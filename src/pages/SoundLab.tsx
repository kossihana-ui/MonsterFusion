import { useEffect, useRef, useState } from "react";
import "../styles/sound-lab.css";

const sounds = [
  { id: "fusion-motor-door", title: "05 / 遠心融合", text: "回転が止まり、重いロックがガチャコン。圧力が抜けるプシューーで装置が開きます。3.6秒。", word: "ガチャコン → プシュー", tags: "融合音の候補 · 解錠と排気" },
  { id: "clear-layered", title: "04 / 重ねたフォーン", text: "②に少し高い音を控えめに重ね、余韻を長くした新しい案。0.84秒。", word: "フォーン", tags: "新しい案 · 重なりと余韻" },
  { id: "round", title: "01 / 丸いフォーン", text: "低い音程で柔らかく始まり、静かになめらかに消える音。", word: "フォーン", tags: "柔らかい · 落ち着き" },
  { id: "clear", title: "02 / 透明なフォーン", text: "低めの澄んだ響き。ノイズを加えず、余韻を短く整えた音。", word: "フォーン", tags: "透明感 · 浮遊感" },
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
    const audio = new Audio(import.meta.env.BASE_URL + "audio/selection/" + id + ".wav?v=3");
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
      <h1>音の試聴室</h1><p>⑤は遠心分離機のような回転をイメージした融合音です。②は決定音、④は警告音の候補として残しています。</p></div></div>
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
    <p className="sound-note">①〜③は0.48秒、④は0.84秒、⑤は3.6秒のオリジナル音です。ゲーム本編への融合音の適用は、試聴後に行います。</p>
  </>;
}
