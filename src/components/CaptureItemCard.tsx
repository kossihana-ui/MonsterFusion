import { getItems, previewEnemyCapture } from "../mocks/game";
import '../styles/capture-item.css';

/**
 * The item box's entry for ドクロゲソ.
 *
 * Whether it can be used, and on whom, is core's answer: this asks and shows
 * the sentence it gets back rather than deciding anything itself.
 */
export function CaptureItemCard({ onCapture, busy }: { onCapture?: () => void; busy?: boolean }) {
  const held = getItems().find(item => item.id === 'dokuro-geso')?.count ?? 0;
  const preview = onCapture ? previewEnemyCapture() : null;
  return <section className="capture-item" aria-label="ドクロゲソ">
    <img src={`${import.meta.env.BASE_URL}items/dokuro-geso.png`} alt="赤いドクロ模様のゲソ" />
    <div>
      <h3>ドクロゲソ ×{held}</h3>
      <p>戦っている相手を仲間にする。ボスにも使えます。</p>
      <small>ボスが10％の確率で落とします。</small>
      {onCapture
        ? <>
            <button disabled={!preview?.ok || !!busy} onClick={onCapture}>
              {preview?.target ? `${preview.target.name}を仲間にする` : '使用する'}
            </button>
            <p className="battle-help">{preview?.message}</p>
          </>
        : <p className="battle-help">
            {held
              ? '戦闘中にアイテムボックスから使えます。'
              : 'まだ持っていません。ボスを倒すと手に入ることがあります。'}
          </p>}
    </div>
  </section>;
}
