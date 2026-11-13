import { useEffect, useRef, useState } from "react";
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
  const [seasonId, setSeasonId] = useState(allSeasons[0].id);
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

  return <>
    <div className="hero"><div><div className="eyebrow">ARENA GATE</div><h1>バトルアリーナ</h1><p>出場する仲間と、持っていく技を決めて。</p></div></div>
    <div className="arena-entry-layout">
      <section className="panel"><h2>① 出場モンスター</h2>
        <div className="arena-roster">{monsters.map(m => <button key={m.id} type="button" aria-pressed={chosen.id === m.id} disabled={opening} onClick={() => { setSelected(m.id); setConfirmed(null); }}><strong>{m.name}</strong><span>{m.genes.element} · 第{m.generation}世代</span></button>)}</div>

        <h2>② 挑むラダー</h2>
        <div className="arena-seasons">
          {allSeasons.map(s => <button key={s.id} type="button" aria-pressed={s.id === season.id}
            disabled={opening} onClick={() => setSeasonId(s.id)}>
            <strong>{s.label}</strong><span>{s.detail}</span>
            {s.endsAt && <small>{new Date(s.endsAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}まで</small>}
          </button>)}
        </div>

        <section className="arena-record" aria-label="連勝記録">
          <h3>連勝記録</h3>
          <p className="arena-record-best">
            {record.best
              ? <><strong>{record.best.wins}</strong>連勝<small>（{record.best.monster}・{record.best.ending === 'retired' ? 'リタイア' : record.best.ending === 'cleared' ? '完全制覇' : '敗北'}）</small></>
              : <small>まだ記録がありません。</small>}
          </p>
          {board.length > 0 && <ol className="arena-board">
            {board.slice(0, 5).map(run => <li key={run.at}>
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
          <p className="battle-help">連打ツール（オートクリッカー等）の使用は禁止です。</p>
        </section>

        <h2>③ 持っていく技（{MAX_MOVE_SLOTS}枠）</h2>
        {/* Keyed, so switching monster rebuilds the slots from that monster's
            own set rather than carrying the last one's across. */}
        <MoveLoadoutEditor key={chosen.id} monsterId={chosen.id} onSaved={() => setConfirmed(chosen.id)}>
          <p className="battle-help">
            入場前に技を決めてください。<strong>「この技でセット」を押すと扉が開きます。</strong>
            戦いの合間には変更できません。
          </p>
        </MoveLoadoutEditor>

        <p>敗北すると出場した仲間を失います。最後の1体を失うとゲームオーバーです。</p>
        <ul className="battle-help">{arenaRules().map(rule => <li key={rule}>{rule}</li>)}</ul>
        <p className="battle-help">進行・パーツはプレイ中のみ保持されます。再読み込みすると戻ります。</p>
        <button type="button" className="arena-enter" disabled={opening || !ready}
          onClick={() => { if (!pending.current) { pending.current = true; setOpening(true); } }}>
          {opening ? "扉を開いています…" : ready ? `${chosen.name}で入場する` : "技を決めると入場できます"}
        </button>
        {ready && !opening && <p className="battle-help">持っていく技：{slots.length}枠ぶん決定済み。</p>}
      </section>
      <section className={`arena-gate ${opening ? "is-opening" : ""}`} aria-label="アリーナの扉">
        <div className="arena-gate-inner"><Portrait monster={chosen} large /><strong>{chosen.name}</strong></div>
        <div className="arena-door arena-door-left" aria-hidden="true"><span>MF</span></div>
        <div className="arena-door arena-door-right" aria-hidden="true"><span>ARENA</span></div>
        <p className="arena-gate-status" role="status">{opening ? "GATE OPEN · 出撃" : ready ? "READY · 技セット完了" : "STANDBY · 技を選んでください"}</p>
      </section>
    </div>
  </>;
}
