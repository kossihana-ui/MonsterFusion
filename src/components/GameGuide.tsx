import { useEffect, useRef, useState } from "react";
import "../styles/guide.css";

const seenKey = "monsterfusion-guide-v1";
export function GameGuide() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(seenKey) !== "seen"; } catch { return true; }
  });
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    if (!open && ref.current?.open) ref.current.close();
  }, [open]);
  function close() {
    try { localStorage.setItem(seenKey, "seen"); } catch { /* Guide still works without storage. */ }
    setOpen(false);
    trigger.current?.focus();
  }
  return <>
    <button ref={trigger} type="button" className="guide-trigger" onClick={() => setOpen(true)}>ⓘ 遊び方・説明書</button>
    <dialog ref={ref} className="game-guide" aria-labelledby="guide-title" onCancel={e => { e.preventDefault(); close(); }}>
      <div className="guide-heading"><div><small>MONSTERFUSION GUIDE</small><h2 id="guide-title">はじめての遊び方</h2></div><button type="button" onClick={close} aria-label="説明書を閉じる">×</button></div>
      <p>出会ったモンスターを融合して、体の特徴と技の組み合わせを楽しもう。</p>
      <ol className="guide-steps">
        <li><h3>図鑑で仲間を見る</h3><p>モンスターを押すと、能力・特徴・覚えられる技が見られます。</p></li>
        <li><h3>2体を融合する</h3><p>「融合のアトリエ」で親を2体選んで融合。親2体はいなくなり、子1体を図鑑に迎えます。子の体によって使える技も変わります。</p></li>
        <li><h3>部位から覚えた技を3枠にセット</h3><p>図鑑の個体画面で、技を枠へドラッグ。スマホでは「技を選ぶ → 枠を押す」。最後に「この技でセット」を押します。×で取り外し、ⓘで技の説明を開けます。</p></li>
        <li><h3>アリーナでパーツを集める</h3><p>出場する仲間を選んで入場。通常戦を5勝すると大型ボスが登場します。勝ったら報酬を受け取り、全回復して次の戦いへ。緑はHP、青はMP。「守る」でMPをためて大技を使おう。</p></li>
      </ol>
      <details><summary>技のマークと色</summary><p>⚔は物理、✦は魔法。色は技の属性です。「よく効く」と出た技は、その相手に有利。難しい計算を覚える必要はありません。</p></details>
      <details><summary>自分の絵を登録するには？</summary><p>仲間の数を管理する新ルールに合わせ、画像からの無料追加は現在休止しています。</p><p>登録画面にはソウルメイクへの案内を表示しています。</p></details>
      <details><summary>仲間を失うとどうなる？</summary><p>敗北すると出場した仲間を失い、所持数が0体になるとゲームオーバーです。引き分けでは仲間を失いません。ソウルメイクでは体と目のパーツを必ずセットし、ほかの部位も追加できます。配置した素材を各1個使い、新しい仲間が誕生します。</p></details>
      <details><summary>保存について</summary><p>現在はデモ版です。モンスターや技セットはページの再読み込みで戻ります。この初回案内を読んだことだけ、このブラウザに記録します。</p></details>
      <details><summary>パーツを融合に使うには？</summary><p>敵が落とした素材を報酬画面で受け取り、融合画面の「パーツを混ぜる」で選びます。表示された部位が子に発現し、成功時に1個消費します。素材・アリーナ進行も再読み込みで戻ります。</p></details>
      <details><summary>動きを控えめにするには？</summary><p>端末の「視差効果を減らす」「アニメーションを減らす」設定に対応しています。設定すると派手なバトル演出は省略します。</p></details>
      <button type="button" className="guide-start" onClick={close}>わかった、遊んでみる</button>
    </dialog>
  </>;
}
