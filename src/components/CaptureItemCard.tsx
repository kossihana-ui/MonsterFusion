import '../styles/capture-item.css';
export function CaptureItemCard() {
  return <section className="capture-item" aria-label="ドクロゲソ">
    <img src={`${import.meta.env.BASE_URL}items/dokuro-geso.png`} alt="赤いドクロ模様のゲソ" />
    <div><h3>ドクロゲソ</h3><p>相手モンスターを仲間にするアイテム。ボスにも使えます。</p>
      <small>予定：ボスが10％の確率で落とします。</small>
      <p className="battle-help">捕獲・ドロップ機能は準備中です。</p>
      <button disabled>使用する（準備中）</button>
    </div>
  </section>;
}
