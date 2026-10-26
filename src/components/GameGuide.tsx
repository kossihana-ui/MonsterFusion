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
        <li><h3>2体を融合する</h3><p>「融合のアトリエ」で親を2体選んで融合。生まれた子は図鑑に加わります。子の体によって使える技も変わります。</p></li>
        <li><h3>好きな技を4枠にセット</h3><p>図鑑の個体画面で、技を枠へドラッグ。スマホでは「技を選ぶ → 枠を押す」。最後に「この技でセット」を押します。×で取り外し、ⓘで技の説明を開けます。</p></li>
        <li><h3>バトルで試す</h3><p>緑のHPがなくなると負け。青のMPを使って技を出します。MPが減ったら「守る」でダメージを減らしながら回復。大技はMPをためて使おう。</p></li>
      </ol>
      <details><summary>技のマークと色</summary><p>⚔は物理、✦は魔法。色は技の属性です。「よく効く」と出た技は、その相手に有利。難しい計算を覚える必要はありません。</p></details>
      <details><summary>自分の絵を登録するには？</summary><p>「モンスター登録」から32×32のPNGを選びます。透過PNGも使えます。現在は画像の形から特徴を読み取る機能がないため、絵と能力・習得技が一致するとは限りません。</p></details>
      <details><summary>保存について</summary><p>現在はデモ版です。モンスターや技セットはページの再読み込みで戻ります。この初回案内を読んだことだけ、このブラウザに記録します。</p></details>
      <details><summary>動きを控えめにするには？</summary><p>端末の「視差効果を減らす」「アニメーションを減らす」設定に対応しています。設定すると派手なバトル演出は省略します。</p></details>
      <button type="button" className="guide-start" onClick={close}>わかった、遊んでみる</button>
    </dialog>
  </>;
}
