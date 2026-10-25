import { useEffect, useRef, useState } from "react";
import { animationDuration, DEFAULT_BATTLE_CONFIG, elementMultiplier, getLearnableMoves } from "@core/core/index.ts";
import { matchupLabel, skillLabel } from "../shared/battlePresentation";
import { MoveBadges } from "../components/MoveBadges";
import "../styles/battle.css";
import type { SpriteMotion } from "../components/MonsterSprite";
import type { BattleAction, GameAdapter, Monster } from "../shared/ui";
import { createBattle, getCoreMonster } from "../mocks/game";
import { Portrait } from "../components/MonsterView";
export function Battle(props: { monsters: Monster[]; adapter: GameAdapter }) {
  if (props.monsters.length < 2) {
    return (
      <section className="panel">
        <h1>バトルアリーナ</h1>
        <p>
          バトルにはモンスターが2体必要です。「モンスター登録」から32×32のPNGを登録してください。
        </p>
      </section>
    );
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
  const [motions, setMotions] = useState<Record<number, SpriteMotion>>({});
  const active = useRef<AbortController | null>(null);
  const serial = useRef(0);
  const player = state.coreState?.combatants.find((c) => c.side === 0);
  const enemy = state.coreState?.combatants.find((c) => c.side === 1);
  const availableMp = Math.min(99, (player?.mp ?? 0) + DEFAULT_BATTLE_CONFIG.mpRegenPerTurn);
  const locked = busy || state.status !== "active";
  const finishers = new Set(getLearnableMoves(getCoreMonster(state.player.id)).filter(m => m.category === "finisher").map(m => m.skill.id));
  useEffect(() => () => active.current?.abort(), []);
  async function play(
    side: number,
    animation: "attack" | "hurt",
    signal: AbortSignal,
  ) {
    if (
      signal.aborted ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    setMotions((previous) => ({
      ...previous,
      [side]: { animation, sequence: ++serial.current },
    }));
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timer = window.setTimeout(finish, animationDuration(animation));
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  async function act(action: BattleAction) {
    if (active.current || state.status !== "active") return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      const next = await adapter.calculateBattleTurn(state, action);
      for (const entry of next.coreState?.log.slice(
        state.coreState?.log.length ?? 0,
      ) ?? []) {
        if (controller.signal.aborted) break;
        const actor = next.coreState?.combatants.find(
          (c) => c.id === entry.actorId,
        );
        if (actor && (entry.kind === "attack" || entry.kind === "skill")) {
          await play(actor.side, "attack", controller.signal);
          const target = next.coreState?.combatants.find(
            (c) => c.id === entry.targetId,
          );
          if (target && (entry.damage ?? 0) > 0)
            await play(target.side, "hurt", controller.signal);
        }
      }
      if (!controller.signal.aborted) setState(next);
    } catch {
      if (!controller.signal.aborted)
        setError("行動を処理できませんでした。もう一度お試しください。");
    } finally {
      active.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        setMotions({});
      }
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
      <label className="battle-select">
        対戦相手
        <select disabled={busy} value={state.enemy.id} onChange={(e) => {
          setError("");
          setState(createBattle(state.player, monsters.find((m) => m.id === e.target.value)!));
        }}>
          {monsters.filter((m) => m.id !== state.player.id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      <div className="battle-field">
        {[
          { monster: state.player, hp: state.playerHp, label: "PLAYER" },
          { monster: state.enemy, hp: state.enemyHp, label: "ENEMY" },
        ].map((side, i) => (
          <section key={i}>
            <div className="eyebrow">{side.label}</div>
            <Portrait
              monster={side.monster}
              large
              facingRight={i === 0}
              motion={motions[i]}
            />
            <h2>{side.monster.name}</h2>
            <p className="battle-resources">
              {side.monster.genes.element}属性
            </p>
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
            <div className="hp-label mp-label"><span>MP</span><span>{state.coreState?.combatants.find(c => c.side === i)?.mp ?? 0} / 99</span></div>
            <progress className="mp-bar" aria-label={`${side.label} MP`} max={99} value={state.coreState?.combatants.find(c => c.side === i)?.mp ?? 0} />
          </section>
        ))}
        <span className="versus">VS</span>
      </div>
      <section className="panel battle-command-panel" aria-label="バトルコマンド">
        <h2>行動を選ぶ</h2>
        <p>技で攻める。MPが減ったら、守って回復。</p>
        <div className="battle-command-grid">
          <button data-element={player?.element} disabled={locked} onClick={() => act("attack")}>
            <strong>攻撃</strong>
            {player && <MoveBadges element={player.element} scaling="attack" />}
            <span>MP 0 {player && enemy ? ` · ${matchupLabel(elementMultiplier(player.element, enemy.element))}` : ""}</span>
          </button>
          <button disabled={locked} onClick={() => act("defend")}>
            <strong>◇ 守る</strong><span>受けるダメージを減らす</span>
            <span>MP回復 +{DEFAULT_BATTLE_CONFIG.defendMpBonus}</span>
          </button>
          {player?.skills.map((skill) => (
            <button data-element={skill.element} key={skill.id} disabled={locked || availableMp < skill.cost} onClick={() => act({ kind: "skill", skillId: skill.id })}>
              <strong>{skillLabel(skill)} {finishers.has(skill.id) && <span className="finisher-badge">大技</span>}</strong>
              <MoveBadges element={skill.element} scaling={skill.scaling} />
              <span>MP {skill.cost} · {enemy ? matchupLabel(elementMultiplier(skill.element, enemy.element)) : ""}{availableMp < skill.cost ? " · MP不足" : ""}</span>
            </button>
          ))}
        </div>
        <p className="battle-help">MPは毎ターン +{DEFAULT_BATTLE_CONFIG.mpRegenPerTurn}。守ると、さらに回復します。</p>
      </section>
      {error && <p role="alert">{error}</p>}
      <section className="panel battle-log">
        <h2>
          {state.status === "active"
            ? `TURN ${state.turn}`
            : state.status === "won"
              ? "VICTORY — 勝利！"
              : state.status === "draw"
                ? "DRAW — 引き分け"
                : "DEFEAT — 敗北"}
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
