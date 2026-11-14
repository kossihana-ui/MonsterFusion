import { useEffect, useRef, useState } from "react";
import { arenaRules } from "@core/core/index.ts";
import "../styles/guide.css";

const art = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/**
 * The ladder, drawn.
 *
 * Which fight is the boss, and how far away the dragon is, were facts the
 * game only told you by letting you walk into them. A hundred fights is
 * hard to picture from a sentence, so the manual shows the shape instead.
 */
function LadderFigure() {
  const normal = [1, 2, 3, 4, 5];
  return <svg className="guide-ladder" viewBox="0 0 600 136" role="img"
    aria-label="1戦目から5戦目までが通常戦、6戦目がボス戦、その先も戦いは続き、100戦目が冥蒼竜ヴェルグラント">
    <line x1="34" y1="54" x2="566" y2="54" stroke="#3c504a" strokeWidth="2" />
    {normal.map((n, i) => <g key={n}>
      <circle cx={40 + i * 62} cy="54" r="17" fill="#1d2a22" stroke="#6f8a74" strokeWidth="2" />
      <text x={40 + i * 62} y="59" textAnchor="middle" fill="#cfdad3" fontSize="14">{n}</text>
    </g>)}
    <circle cx="390" cy="54" r="24" fill="#3a2a1b" stroke="#ffd9a8" strokeWidth="2" />
    <text x="390" y="60" textAnchor="middle" fill="#ffd9a8" fontSize="16">★</text>
    <text x="462" y="60" textAnchor="middle" fill="#7f8d85" fontSize="18">…</text>
    <circle cx="534" cy="54" r="24" fill="#1b2435" stroke="#8fb3ff" strokeWidth="2" />
    <text x="534" y="61" textAnchor="middle" fill="#bcd2ff" fontSize="15">竜</text>
    <text x="164" y="100" textAnchor="middle" fill="#9fb3a6" fontSize="13">通常戦（1〜5戦目）</text>
    <text x="390" y="100" textAnchor="middle" fill="#ffd9a8" fontSize="13">6戦目：ボス</text>
    <text x="534" y="100" textAnchor="middle" fill="#bcd2ff" fontSize="13">100戦目</text>
    <text x="164" y="120" textAnchor="middle" fill="#7f8d85" fontSize="11">勝つほど相手が強くなります</text>
    <text x="390" y="120" textAnchor="middle" fill="#7f8d85" fontSize="11">パーツとドクロゲソ</text>
    <text x="534" y="120" textAnchor="middle" fill="#7f8d85" fontSize="11">冥蒼竜</text>
  </svg>;
}

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
      <div className="guide-heading"><div><small>MONSTERFUSION GUIDE</small><h2 id="guide-title">遊び方・説明書</h2></div><button type="button" onClick={close} aria-label="説明書を閉じる">×</button></div>
      <p>出会ったモンスターを融合して、体の特徴と技の組み合わせを楽しもう。</p>
      <ol className="guide-steps">
        <li><h3>図鑑で仲間を見る</h3><p>モンスターを押すと、能力・特徴・覚えられる技が見られます。</p></li>
        <li><h3>2体を融合する</h3><p>「融合のアトリエ」で親を2体選んで融合。親2体はいなくなり、子1体を図鑑に迎えます。子の体によって使える技も変わります。名前は必ず付けてください。</p></li>
        <li><h3>部位から覚えた技を3枠にセット</h3><p>図鑑の個体画面で、技を枠へドラッグ。スマホでは「技を選ぶ → 枠を押す」。最後に「この技でセット」を押します。×で取り外し、ⓘで技の説明を開けます。</p></li>
        <li><h3>アリーナに挑む</h3><p>出場する仲間・挑むラダー・持っていく技を決めると、扉が開きます。緑はHP、青はMP。「守る」でMPをためて大技を使おう。</p></li>
      </ol>

      <section className="guide-figure">
        <h3>アリーナの評価は「何連勝できたか」だけ</h3>
        <p>
          アリーナは<strong>勝ち続けるほど相手が強くなる一本道</strong>です。点数も時間も関係なく、
          <strong>負ける（または引き分ける）までに何連勝できたか</strong>が、そのまま記録になります。
          各戦のあいだには全回復します。
        </p>
        <LadderFigure />
        <p className="guide-note">
          負けると<strong>出場した仲間を失います。</strong>最後の1体を失うとゲームオーバーです。
          危ないと思ったら、戦闘中に<strong>「リタイア」</strong>を選べます。そこまでの連勝が記録に残り、
          仲間も失いません。
        </p>
      </section>

      <section className="guide-figure">
        <h3>6戦目はボス戦（通常戦に5回勝つと登場）</h3>
        <p>
          通常戦に<strong>5回勝つと、6戦目に大型のボス</strong>が現れます。ボスはひとまわり大きく、
          能力も通常戦より高めです。勝つと報酬画面になり、
          <strong>倒した相手が持っていた特徴だけ</strong>がパーツとして手に入ります。
        </p>
        <p>
          ボスが出るのはこの1回だけです。7戦目からはふたたび通常戦ですが、相手は勝つたびに少しずつ強くなり、
          <strong>100戦目に冥蒼竜ヴェルグラント</strong>が待っています。ここに勝つと完全制覇です。
        </p>
        <figure className="guide-shot">
          <img src={art('monsters/bosses/arena-100-dragon-thumb.jpg')} alt="100戦目に現れる冥蒼竜ヴェルグラント" width={180} height={180} loading="lazy" />
          <figcaption>100戦目・冥蒼竜ヴェルグラント</figcaption>
        </figure>
      </section>

      <section className="guide-figure">
        <h3>ドクロゲソ：戦っている相手を仲間にする</h3>
        <figure className="guide-shot is-left">
          <img src={art('items/dokuro-geso.png')} alt="赤いドクロ模様のゲソ" width={96} height={96} loading="lazy" />
          <figcaption>ドクロゲソ</figcaption>
        </figure>
        <p>
          <strong>ボスを倒したとき、10％の確率で落とす</strong>アイテムです。戦闘中にアイテムボックスから使うと、
          いま戦っている相手が<strong>そのまま仲間になります</strong>。見た目も能力も、戦っていた個体のままです。
        </p>
        <p className="guide-note">
          ボスにも使えます。めったに手に入らないので、使いどころは慎重に。
        </p>
      </section>

      <section className="guide-figure">
        <h3>ラダーは3種類。チャンピオンを競うのは2つ</h3>
        <dl className="guide-ladders">
          <dt>今週のチャンピオン</dt>
          <dd>今週は世界中が<strong>同じ敵・同じ順番</strong>で戦います。いちばん長く勝ち抜いた人が今週のチャンピオンです。月曜に敵が入れ替わります。</dd>
          <dt>総合チャンピオン</dt>
          <dd>いつ挑んでも<strong>敵の順番が変わらない</strong>ラダーです。条件がいつも同じなので、歴代でいちばん長い連勝を競えます。</dd>
          <dt>腕試し（順位なし）</dt>
          <dd>毎回ちがう敵の順番になります。新しい仲間を試すためのもので、順位には加わりません。</dd>
        </dl>
        <p className="guide-note">世界ランキングは準備中です。いまの記録はこのブラウザの中にだけ残ります。</p>
      </section>

      <details><summary>アリーナのルールまとめ</summary><ul className="guide-rules">{arenaRules().map(rule => <li key={rule}>{rule}</li>)}</ul></details>
      <details><summary>技のマークと色</summary><p>⚔は物理、✦は魔法。色は技の属性です。「よく効く」と出た技は、その相手に有利。難しい計算を覚える必要はありません。</p></details>
      <details><summary>自分の絵を登録するには？</summary><p>仲間の数を管理する新ルールに合わせ、画像からの無料追加は現在休止しています。</p><p>登録画面にはソウルメイクへの案内を表示しています。</p></details>
      <details><summary>仲間を失うとどうなる？</summary><p>敗北すると出場した仲間を失い、所持数が0体になるとゲームオーバーです。引き分けでは仲間を失いません。ソウルメイクでは体と目のパーツを必ずセットし、ほかの部位も追加できます。配置した素材を各1個使い、新しい仲間が誕生します。</p></details>
      <details><summary>保存について</summary><p>モンスター・パーツ・技セット・アリーナの進行は、このブラウザに自動保存されます。再読み込みしても続きから遊べます。別の端末やブラウザには引き継がれません。</p></details>
      <details><summary>パーツを融合に使うには？</summary><p>敵が落とした素材を報酬画面で受け取り、融合画面の「パーツを混ぜる」で選びます。表示された部位が子に発現し、成功時に1個消費します。素材もアリーナ進行も自動保存されます。</p></details>
      <details><summary>動きを控えめにするには？</summary><p>端末の「視差効果を減らす」「アニメーションを減らす」設定に対応しています。設定すると派手なバトル演出は省略します。</p></details>
      <details><summary>連打ツールについて</summary><p>連打する技（ファイナルテールなど）は<strong>毎秒15回</strong>までしか効果がありません。オートクリッカーなどの連打ツールの使用は禁止です。不自然な連打は記録に印が付き、ランキングには載りません。</p></details>
      <button type="button" className="guide-start" onClick={close}>わかった、遊んでみる</button>
    </dialog>
  </>;
}
