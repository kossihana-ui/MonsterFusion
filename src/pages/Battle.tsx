import { useState } from "react";
import type { BattleAction, GameAdapter, Monster } from "../shared/ui";
import { createBattle } from "../mocks/game";
import { Portrait } from "../components/MonsterView";
export function Battle(props: { monsters: Monster[]; adapter: GameAdapter }) {
  if (props.monsters.length < 2) {
    return <section className="panel"><h1>バトルアリーナ</h1><p>バトルにはモンスターが2体必要です。「モンスター登録」から32×32のPNGを登録してください。</p></section>;
  }
  return <BattleSession {...props} />;
}
function BattleSession({
  monsters,
  adapter,
}: {
  monsters: Monster[];
  adapter: GameAdapter;
}) {
  const [state, setState] = useState(() =>
    createBattle(monsters[0], monsters[1] ?? monsters[0]),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function act(action: BattleAction) {
    setBusy(true);
    setError("");
    try {
      setState(await adapter.calculateBattleTurn(state, action));
    } catch {
      setError("行動を処理できませんでした。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">TRAINING GROUNDS</div>
          <h1>バトルアリーナ</h1>
          <p>1対1の模擬戦で、モンスターの力を試そう。</p>
        </div>
        <span className="badge">模擬バトル</span>
      </div>
      <label className="battle-select">
        出場モンスター
        <select
          disabled={busy}
          value={state.player.id}
          onChange={(e) =>
            setState(
              createBattle(
                monsters.find((m) => m.id === e.target.value)!,
                monsters.find((m) => m.id !== e.target.value)!,
              ),
            )
          }
        >
          {monsters.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      <div className="battle-field">
        {[
          { monster: state.player, hp: state.playerHp, label: "PLAYER" },
          { monster: state.enemy, hp: state.enemyHp, label: "ENEMY" },
        ].map((side, i) => (
          <section key={i}>
            <div className="eyebrow">{side.label}</div>
            <Portrait monster={side.monster} large />
            <h2>{side.monster.name}</h2>
            <div className="hp-label">
              <span>HP</span>
              <span>
                {side.hp} / {side.monster.stats.hp}
              </span>
            </div>
            <progress
              aria-label={`${side.label} HP`}
              max={side.monster.stats.hp}
              value={side.hp}
            />
          </section>
        ))}
        <span className="versus">VS</span>
      </div>
      <div className="battle-actions">
        {(["attack", "defend", "skill"] as const).map((a, i) => (
          <button
            key={a}
            disabled={busy || state.status !== "active"}
            onClick={() => act(a)}
          >
            {["⚔ 攻撃", "◇ 防御", "✧ スキル"][i]}
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <section className="panel battle-log">
        <h2>
          {state.status === "active"
            ? `TURN ${state.turn}`
            : state.status === "won"
              ? "VICTORY — 勝利！"
              : state.status === "draw" ? "DRAW — 引き分け" : "DEFEAT — 敗北"}
        </h2>
        <div role="log">
          {state.logs.map((log, i) => (
            <p key={i}>{log}</p>
          ))}
        </div>
      </section>
      <button
        className="text-button"
        disabled={busy}
        onClick={() => setState(createBattle(state.player, state.enemy))}
      >
        ↻ バトルをリセット
      </button>
    </>
  );
}
