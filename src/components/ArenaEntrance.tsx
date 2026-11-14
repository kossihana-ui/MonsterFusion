import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Monster } from "../shared/ui";
import { Portrait } from "./MonsterView";
import { MoveLoadoutEditor } from "./MoveLoadoutEditor";
import { arenaRules, MAX_MOVE_SLOTS } from "@core/core/index.ts";
import { getMoveLoadout, arenaSeasons } from "../mocks/game";
import { getRecord, setPlayerName, bestBySeason } from "../shared/record";
import type { RunRecord } from "../shared/record";
import "../styles/arena-entrance.css";

/** A record's monster, drawn from the look that was kept with it. */
function RecordFace({ run }: { run: RunRecord }) {
  if (!run.look) return <span className="arena-board-face is-empty" aria-hidden="true">?</span>;
  const monster = {
    id: `record-${run.at}`, name: run.monster, image: '',
    phenotype: run.look as unknown as Monster['phenotype'],
    generation: 0, stats: { hp: 0, attack: 0, defense: 0, magic: 0, speed: 0 },
    tags: [], genes: { element: '', body: '', potential: '' }, traits: [],
  } as unknown as Monster;
  return <span className="arena-board-face"><Portrait monster={monster} /></span>;
}

export function ArenaEntrance({ monsters, onEnter }: { monsters: Monster[]; onEnter: (id: string, seasonId: string) => void }) {
  const [selected, setSelected] = useState(monsters[0].id);
  const [opening, setOpening] = useState(false);
  // The gate asks for the three moves before it opens. A set nobody chose is
  // the game choosing, and this is the decision worth the most in the whole
  // game - 39 points of win rate - so it is not made silently any more.
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [record, setRecord] = useState(getRecord);
  const [allSeasons] = useState(arenaSeasons);
  // A first-timer is pointed at the practice ladder, because the measured
  // alternative is three monsters and a game over inside ten minutes.
  // Anyone with a ranked run behind them gets the real one.
  const [seasonId, setSeasonId] = useState(() => {
    const practice = allSeasons.find(s => s.practice);
    const ranked = allSeasons.find(s => s.kind === 'weekly');
    return ((record.best ? ranked : practice) ?? allSeasons[0]).id;
  });
  // One step open at a time. All three used to stand open together, which
  // put the button that actually opens the gate below the fold: the player
  // had to scroll to do the one thing the screen is for.
  const [step, setStep] = useState(1);
  const season = allSeasons.find(s => s.id === seasonId) ?? allSeasons[0];
  const board = bestBySeason();
  const pending = useRef(false);
  const chosen = monsters.find(m => m.id === selected) ?? monsters[0];
  const ready = confirmed === chosen.id;
  const slots = getMoveLoadout(chosen.id).skillIds;

  useEffect(() => {
    if (!opening) return;
    const timer = window.setTimeout(() => onEnter(chosen.id, season.id), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1250);
    return () => window.clearTimeout(timer);
  }, [opening, chosen.id, season.id, onEnter]);

  /** A step, collapsed to its heading and its answer unless it is the open one. */
  function stepCard(n: number, title: string, answer: string, done: boolean, body: ReactNode) {
    const active = step === n;
    return <li key={n} className={`${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
      <button type="button" className="arena-step-head" aria-expanded={active} disabled={opening}
        onClick={() => setStep(active ? 0 : n)}>
        <b aria-hidden="true">{done ? '✓' : n}</b>
        <span>{title}</span>
        <em>{answer}</em>
      </button>
      {active && <div className="arena-step-body">{body}</div>}
    </li>;
  }

  return <>
    <div className="hero arena-hero">
      <div><div className="eyebrow">ARENA GATE</div><h1>バトルアリーナ</h1></div>
      <p className="arena-hero-note">
        {season.practice
          ? <>これは<strong>練習</strong>です。相手は弱く、<strong>負けても仲間を失いません。</strong>そのかわり素材は手に入らず、順位にも加わりません。</>
          : <>評価は<strong>何連勝できたか</strong>だけ。敗北すると出場した仲間を失い、最後の1体を失うとゲームオーバーです。</>}
      </p>
    </div>
    <div className="arena-entry-layout">
      <section className="panel arena-steps-panel">
        <ol className="arena-steps">
          {stepCard(1, '出場モンスター', chosen.name, true,
            <div className="arena-roster">{monsters.map(m => <button key={m.id} type="button" aria-pressed={chosen.id === m.id} disabled={opening}
              onClick={() => { setSelected(m.id); setConfirmed(null); setStep(2); }}>
              <strong>{m.name}</strong><span>{m.genes.element} · 第{m.generation}世代</span>
            </button>)}</div>)}

          {stepCard(2, '挑むラダー', season.label, true,
            <div className="arena-seasons">
              {allSeasons.map(s => <button key={s.id} type="button" aria-pressed={s.id === season.id}
                disabled={opening} onClick={() => { setSeasonId(s.id); setStep(3); }}>
                <strong>{s.label}{s.practice && <em className="arena-season-tag">おすすめ・初回</em>}</strong><span>{s.detail}</span>
                {s.endsAt && <small>{new Date(s.endsAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}まで</small>}
              </button>)}
            </div>)}

          {stepCard(3, `持っていく技（${MAX_MOVE_SLOTS}枠）`, ready ? `${slots.length}枠ぶん決定済み` : '未決定', ready,
            /* Keyed, so switching monster rebuilds the slots from that monster's
               own set rather than carrying the last one's across. */
            <MoveLoadoutEditor key={chosen.id} monsterId={chosen.id} onSaved={() => setConfirmed(chosen.id)}>
              <p className="battle-help">
                入場前に技を決めてください。<strong>「この技でセット」を押すと扉が開きます。</strong>
                戦いの合間には変更できません。
              </p>
            </MoveLoadoutEditor>)}
        </ol>

        <div className="arena-entry-foot">
          <button type="button" className="arena-enter" disabled={opening || !ready}
            onClick={() => { if (!pending.current) { pending.current = true; setOpening(true); } }}>
            {opening ? "扉を開いています…" : ready ? `${chosen.name}で入場する` : "③で技を決めると入場できます"}
          </button>
          <details className="arena-rules">
            <summary>アリーナのルール</summary>
            <ul>{arenaRules().map(rule => <li key={rule}>{rule}</li>)}</ul>
            <p>進行・パーツ・技セットはこのブラウザに自動保存されます。再読み込みしても続きから遊べます。</p>
            <p>連打ツール（オートクリッカー等）の使用は禁止です。</p>
          </details>
        </div>
      </section>

      <aside className="arena-side">
        <section className={`arena-gate ${opening ? "is-opening" : ""}`} aria-label="アリーナの扉">
          <div className="arena-gate-inner"><Portrait monster={chosen} large /><strong>{chosen.name}</strong></div>
          <div className="arena-door arena-door-left" aria-hidden="true"><span>MF</span></div>
          <div className="arena-door arena-door-right" aria-hidden="true"><span>ARENA</span></div>
          <p className="arena-gate-status" role="status">{opening ? "GATE OPEN · 出撃" : ready ? "READY · 技セット完了" : "STANDBY · 技を選んでください"}</p>
        </section>

        <section className="arena-record" aria-label="連勝記録">
          <h3>連勝記録</h3>
          <p className="arena-record-best">
            {record.best
              ? <><strong>{record.best.wins}</strong>連勝<small>（{record.best.monster}・{record.best.ending === 'retired' ? 'リタイア' : record.best.ending === 'cleared' ? '完全制覇' : '敗北'}）</small></>
              : <small>まだ記録がありません。</small>}
          </p>
          {board.length > 0 && <ol className="arena-board">
            {board.slice(0, 2).map(run => <li key={run.at}>
              <RecordFace run={run} />
              <span className="arena-board-who">
                <strong>{run.monster}</strong>
                <small>{run.player || '名もなき挑戦者'}・{run.seasonLabel ?? 'ラダー不明'}</small>
              </span>
              <span className="arena-board-wins">{run.wins}<small>連勝</small></span>
            </li>)}
          </ol>}
          <label>プレイヤー名
            <input value={record.name} maxLength={20} placeholder="名前を入力"
              onChange={e => setRecord(setPlayerName(e.target.value))} />
          </label>
          {record.best?.suspect && <p className="arena-record-suspect">
            この記録は連打ツールの疑いありとして記録されています。ランキングには載りません。
          </p>}
          <p className="battle-help">記録はこのブラウザに保存されます。世界ランキングは準備中です。</p>
        </section>
      </aside>
    </div>
  </>;
}
