import { CaptureItemCard } from "../components/CaptureItemCard";
import { HealEffect } from "../components/HealEffect";
import { MoveHelp } from "../components/MoveHelp";
import { moveHelp, highlightPart, partNames } from "../shared/moveHelp";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArenaEntrance } from "../components/ArenaEntrance";
import { STATUS_LABELS, animationDuration, DEFAULT_ARENA_CONFIG, DEFAULT_BATTLE_CONFIG, elementMultiplier, getLearnableMoves } from "@core/core/index.ts";
import { matchupLabel, skillLabel } from "../shared/battlePresentation";
import { MoveBadges } from "../components/MoveBadges";
import "../styles/battle.css";
import type { SpriteMotion } from "../components/MonsterSprite";
import type { BattleAction, BattleState, GameAdapter, Monster } from "../shared/ui";
import { createBattle, getCoreMonster, enterArena, resumeArena, receiveArenaReward, continueArena, leaveArena, getPartInventory, getGameSession, captureEnemy, getItems, retireArena, recordArenaEnding, arenaWins } from "../mocks/game";
import { Portrait } from "../components/MonsterView";
import { BattleEffect } from "../components/BattleEffect";
import { MultiplierEffect, multiplierPresentation, orchestraHit } from "../components/MultiplierEffect";
import type { MultiplierPresentation } from "../components/MultiplierEffect";
import { BattleResult } from "../components/BattleResult";
import { BattleHpBar } from "../components/BattleHpBar";
import { battleSound } from "../components/battleSound";
import { LootReveal, PartIcon, TreasureChestIcon } from "../components/LootReveal";
import type { GenePart } from "@core/core/index.ts";
import { blockingStatus, getMoveBehavior } from "@core/core/index.ts";
import { StatusChips } from "../components/StatusChips";
import { ChargeMash } from "../components/ChargeMash";
import type { BattleCue } from "../components/BattleEffect";
type ReplayListener = (playing: boolean, muted?: boolean) => void;
export function Battle(props: { monsters: Monster[]; adapter: GameAdapter; onReplay?: ReplayListener }) {
  const [initial, setInitial] = useState<BattleState | null>(() => resumeArena());
  const [session, setSession] = useState(0);
  const enter = useCallback((id: string) => { setInitial(enterArena(id)); setSession(n => n + 1); }, []);
  if (!props.monsters.length && !initial) return <section className="panel"><h1>バトルアリーナ</h1><p>まずモンスターを登録してください。</p></section>;
  if (!initial) return <ArenaEntrance monsters={props.monsters} onEnter={enter} />;
  return <BattleSession key={session} {...props} initial={initial} onLeave={() => { leaveArena(); setInitial(null); }} />;
}

function BattleSession({
  monsters,
  adapter, initial, onLeave, onReplay,
}: {
  monsters: Monster[];
  adapter: GameAdapter;
  initial: BattleState;
  onLeave: () => void;
  onReplay?: ReplayListener;
}) {
  const [state, setState] = useState(initial);
  const [captured, setCaptured] = useState<Monster | null>(null);
  /** A move that wants five seconds of the player's thumbs before it lands. */
  const [charging, setCharging] = useState<{ id: string; name: string; seconds: number; perPress: number } | null>(null);
  const [retiring, setRetiring] = useState(false);
  const [rewardMessage, setRewardMessage] = useState("");
  const [loot, setLoot] = useState<readonly GenePart[]>([]);
  const [muted, setMuted] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const stopSound = useRef<() => void>(() => {});
  const mutedRef = useRef(muted); mutedRef.current = muted;
  const enemyStage = useRef<HTMLDivElement>(null);
  const inventoryDock = useRef<HTMLButtonElement>(null);
  const rewardChest = useRef<HTMLDivElement>(null);
  const run = state.arenaRun;
  const claimed = !!run?.claimed.includes(run.encounter.index);
  const [inspectedSkill, setInspectedSkill] = useState<string | null>(null);
  const [helpSkill, setHelpSkill] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [effectNotice, setEffectNotice] = useState("");
  const [multiplier, setMultiplier] = useState<MultiplierPresentation | null>(null);
  const [healing, setHealing] = useState<{ sequence: number; target: number; amount: number } | null>(null);
  const [damageNumber, setDamageNumber] = useState<{ sequence: number; target: number; amount: number } | null>(null);
  const skip = useRef(false);
  const finishWait = useRef<() => void>(() => {});
  const [cue, setCue] = useState<BattleCue | null>(null);
  const [displayHp, setDisplayHp] = useState<Record<number, number> | null>(null);
  const [motions, setMotions] = useState<Record<number, SpriteMotion>>({});
  const active = useRef<AbortController | null>(null);
  const arena = useRef<HTMLDivElement>(null);
  const serial = useRef(0);
  const player = state.coreState?.combatants.find((c) => c.side === 0);
  const enemy = state.coreState?.combatants.find((c) => c.side === 1);
  const availableMp = Math.min(99, (player?.mp ?? 0) + DEFAULT_BATTLE_CONFIG.mpRegenPerTurn);
  const learnable = getLearnableMoves(getCoreMonster(state.player.id));
  const inspectedMove = learnable.find(m => m.skill.id === inspectedSkill);
  const helpMove = learnable.find(m => m.skill.id === helpSkill);
  const describedSkill = player?.skills.find(s => s.id === helpSkill);
  const locked = busy || state.status !== "active";
  // Core decides what stops a monster acting, and which moves get through
  // anyway, so the screen asks it rather than keeping its own list.
  const blocked = blockingStatus(player?.statuses);
  const stillUsable = blocked
    ? (player?.skills ?? []).filter(s => getMoveBehavior(s.id).usableWhileBound).map(s => skillLabel(s))
    : [];
  const finishers = new Set(getLearnableMoves(getCoreMonster(state.player.id)).filter(m => m.category === "finisher").map(m => m.skill.id));
  useEffect(() => () => { active.current?.abort(); stopSound.current(); onReplay?.(false); }, [onReplay]);
  async function wait(ms: number, signal: AbortSignal) {
    if (signal.aborted || skip.current) return;
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
      const timer = window.setTimeout(finish, ms);
      finishWait.current = finish;
      signal.addEventListener('abort', finish, { once: true });
    });
  }
  function skipReplay() { skip.current = true; finishWait.current(); stopSound.current(); setMultiplier(null); }
  function useCaptureItem() {
    try {
      // A fresh id per press: core spends one item per id, so a double tap
      // cannot cost two.
      const result = captureEnemy(crypto.randomUUID());
      if (!result.ok || !result.captured) { setError(result.message); return; }
      stopSound.current();
      setError("");
      setShowInventory(false);
      setCaptured(result.captured);
      setRewardMessage(result.message);
      setState(resumeArena() ?? state);
    } catch { setError("ドクロゲソを使えませんでした。もう一度お試しください。"); }
  }
  async function play(
    side: number,
    animation: "attack" | "hurt",
    signal: AbortSignal,
    duration?: number,
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
    await wait(duration ?? animationDuration(animation), signal);
  }
  async function act(action: BattleAction) {
    if (active.current || state.status !== "active") return;
    const controller = new AbortController();
    active.current = controller;
    skip.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    onReplay?.(true, mutedRef.current);
    setBusy(true);
    setError("");
    arena.current?.scrollIntoView({ block: "center", behavior: "instant" });
    try {
      const next = await adapter.calculateBattleTurn(state, action);
      // Replay the authoritative log for display only; never modify core state.
      const replayHp: Record<number, number> = { 0: state.playerHp, 1: state.enemyHp };
      for (const entry of next.coreState?.log.slice(
        state.coreState?.log.length ?? 0,
      ) ?? []) {
        if (controller.signal.aborted) break;
        const actor = next.coreState?.combatants.find(
          (c) => c.id === entry.actorId,
        );
        if (!actor) continue;
        const skill = actor.skills.find(s => s.id === entry.skillId);
        const blocked = entry.effects?.some(event => event.type === "blocked" || event.type === "skip");
        if ((entry.kind === "attack" || entry.kind === "skill" || entry.skillId) && !blocked && !skip.current) {
          stopSound.current();
          stopSound.current = battleSound(entry.skillId ?? 'attack', mutedRef.current, skill?.element ?? actor.element);
          if (entry.kind === "attack" || entry.kind === "skill") await play(actor.side, "attack", controller.signal);
        }
        // Events identify the true target, including reflected damage and healing.
        for (const event of entry.effects ?? []) {
          if (controller.signal.aborted) break;
          if (event.type === 'blocked' || event.type === 'skip') {
            if (!skip.current) {
              setEffectNotice(event.type === 'skip' ? STATUS_LABELS[event.reason] + 'で動けません。' : event.reason === 'consecutive' ? 'この技は連続で使えません。' : 'MPが足りません。');
              await wait(1000, controller.signal);
              setEffectNotice('');
            }
            continue;
          }
          if (event.type === 'mp') {
            const recipient = next.coreState?.combatants.find(c => c.id === event.targetId);
            const name = recipient?.side === 0 ? state.player.name : state.enemy.name;
            if (!skip.current) {
              setEffectNotice(name + (event.amount > 0 ? '：MP ＋' + event.amount : '：MP満タン'));
              await wait(900, controller.signal);
              setEffectNotice('');
            }
            continue;
          }
          if (event.type === 'noEffect') {
            const affected = next.coreState?.combatants.find(c => c.id === event.targetId);
            const name = affected?.side === 0 ? state.player.name : state.enemy.name;
            if (!skip.current) {
              setEffectNotice(name + 'はすでに' + STATUS_LABELS[event.status] + '。効果は延長されません。');
              await wait(1000, controller.signal);
              setEffectNotice('');
            }
            continue;
          }
          if (event.type !== 'damage' && event.type !== 'heal') continue;
          const target = next.coreState?.combatants.find(c => c.id === event.targetId);
          if (!target) continue;
          if (event.type === 'heal') {
            // amount is the actual recovery after the core's HP cap. Do not recalculate it.
            replayHp[target.side] += event.amount;
            setDisplayHp({ ...replayHp });
            if (!skip.current) {
              setHealing({ sequence: ++serial.current, target: target.side, amount: event.amount });
              await wait(1250, controller.signal);
              setHealing(null);
            }
            continue;
          }
          const boost = multiplierPresentation(event);
          if (!skip.current && event.amount > 0) {
            const major = getLearnableMoves(getCoreMonster(actor.monsterId)).some(m => m.skill.id === entry.skillId && m.category === 'finisher');
            setCue({ sequence: ++serial.current, name: skill ? skillLabel(skill) : '攻撃', skillId: skill?.id ?? 'attack', element: skill?.element ?? actor.element, target: target.side, finisher: major, damage: event.amount });
            await play(target.side, 'hurt', controller.signal, event.hits > 1 ? 350 : major ? 1250 : 1100);
            setCue(null);
            if (boost && !skip.current && !controller.signal.aborted) {
              stopSound.current();
              await wait(120, controller.signal);
              if (!skip.current && !controller.signal.aborted) {
                setMultiplier(boost);
                stopSound.current = orchestraHit(boost.factor, mutedRef.current);
                await wait(500, controller.signal);
              }
            }
          }
          if (controller.signal.aborted) break;
          replayHp[target.side] = Math.max(0, replayHp[target.side] - event.amount);
          setDisplayHp({ ...replayHp });
          if (!skip.current && event.amount > 0) {
            setDamageNumber({ sequence: ++serial.current, target: target.side, amount: event.amount });
            await wait(200, controller.signal);
            setMultiplier(null);
            await wait(650, controller.signal);
          }
          setDamageNumber(null);
        }
      }
      if (!controller.signal.aborted) {
        if (next.status === 'lost') recordArenaEnding('defeated');
        else if (next.arenaRun?.phase === 'cleared') recordArenaEnding('cleared');
        setState(next);
        if (next.status === 'lost' && getGameSession().status === 'gameOver') {
          // Let zero HP and the delayed red trail paint before beginning the fade.
          await new Promise<void>(resolve => {
            const finish = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', finish); resolve(); };
            const timer = window.setTimeout(finish, 1100);
            controller.signal.addEventListener('abort', finish, { once: true });
          });
        }
        if (next.status === 'won') {
          stopSound.current();
          stopSound.current = battleSound('victory', mutedRef.current);
        }
      }
    } catch {
      if (!controller.signal.aborted)
        setError("行動を処理できませんでした。もう一度お試しください。");
    } finally {
      onReplay?.(false, mutedRef.current);
      active.current = null;
      if (!controller.signal.aborted) {
        setBusy(false);
        setMotions({});
        setHealing(null);
        setEffectNotice("");
        setCue(null);
        setMultiplier(null);
        setDamageNumber(null);
        setDisplayHp(null);
      }
    }
  }
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">TRAINING GROUNDS</div>
          <h1>バトルアリーナ</h1>
          <p>{run?.encounter.isFinalBoss
            ? `${DEFAULT_ARENA_CONFIG.finalBossFight}戦目 — 冥蒼竜ヴェルグラント。ここが頂上です。`
            : run?.encounter.isBoss
              ? "大型ボス出現！ この先も戦いは続きます。"
              : `第${(run?.encounter.index ?? 0) + 1}戦 / ${DEFAULT_ARENA_CONFIG.finalBossFight} · ${run?.wins ?? 0}勝`}</p>
        </div>
        <span className="badge">{run?.encounter.isBoss ? "BOSS" : "勝ち抜きアリーナ"}</span>
      </div>
      <button className="text-button" aria-pressed={!muted} disabled={loot.length > 0} onClick={() => { stopSound.current(); setMuted(!muted); }}>戦闘音：{muted ? "オフ" : "オン"}</button>
      <button ref={inventoryDock} className={`inventory-dock ${loot.length ? 'is-receiving' : ''}`} onClick={() => setShowInventory(v => !v)} aria-expanded={showInventory} aria-label="アイテムボックス">
        <span aria-hidden="true">▣</span> アイテムボックス · {getPartInventory().stacks.reduce((n,s)=>n+s.count,0) + getItems().reduce((n,i)=>n+i.count,0)}
      </button>
      {showInventory && <section className="inventory-popover panel" aria-label="所持パーツ一覧"><h2>アイテムボックス</h2><button onClick={() => setShowInventory(false)}>閉じる</button>{getPartInventory().stacks.length ? getPartInventory().stacks.map(s => <p key={s.part.id}><PartIcon part={s.part} /> {s.part.name} ×{s.count}</p>) : <p>まだ素材を持っていません。</p>}<CaptureItemCard onCapture={useCaptureItem} busy={busy} /></section>}
      {loot.length > 0 && <LootReveal parts={loot} source={rewardChest} destination={inventoryDock} muted={muted} onDone={() => setLoot([])} />}
      {!run && <><label className="battle-select">
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
      </>}
      <div className={`battle-field ${run?.encounter.isBoss ? "arena-boss-field" : ""}`} ref={arena} onClick={busy ? skipReplay : undefined}>
        {effectNotice && <div className="battle-effect-notice" role="status">{effectNotice}</div>}
        {multiplier && <MultiplierEffect value={multiplier} />}
        {cue && <BattleEffect key={cue.sequence} cue={cue} />}
        {[
          { monster: state.player, hp: displayHp?.[0] ?? state.playerHp, label: "PLAYER" },
          { monster: state.enemy, hp: displayHp?.[1] ?? state.enemyHp, label: "ENEMY" },
        ].map((side, i) => (
          <section key={i}>
            <div className="eyebrow">{side.label}</div>
            <div className={`battle-portrait-stage ${healing?.target === i ? "is-healing" : ""}`} ref={i === 1 ? enemyStage : undefined}>
            <Portrait
              monster={side.monster}
              large
              facingRight={i === 0}
              motion={motions[i]}
              highlight={i === 0 && !busy ? highlightPart(inspectedMove) : undefined}
            />
            {healing?.target === i && <HealEffect key={healing.sequence} amount={healing.amount} />}
            {damageNumber?.target === i && <span key={damageNumber.sequence} className="battle-damage-number" aria-hidden="true">−{damageNumber.amount}</span>}
            </div>
            <h2>{side.monster.name}</h2>
            {i === 0 && inspectedMove && !busy && <p className="part-focus-label">{skillLabel(inspectedMove.skill)} ← {inspectedMove.source ? partNames[inspectedMove.source] : "共通技"}</p>}
            <p className="battle-resources">
              {side.monster.genes.element}属性
            </p>
            <div className="hp-label">
              <span>HP</span>
              <span>
                {side.hp} / {side.monster.stats.hp}
              </span>
            </div>
            <BattleHpBar
              key={side.monster.id}
              label={`${side.label} HP`}
              max={side.monster.stats.hp}
              hp={side.hp}
            />
            <div className="hp-label mp-label"><span>MP</span><span>{state.coreState?.combatants.find(c => c.side === i)?.mp ?? 0} / 99</span></div>
            <progress className="mp-bar" aria-label={`${side.label} MP`} max={99} value={state.coreState?.combatants.find(c => c.side === i)?.mp ?? 0} />
            <StatusChips statuses={state.coreState?.combatants.find(c => c.side === i)?.statuses} label={side.label} />
          </section>
        ))}
        <span className="versus">VS</span>
      </div>
      {charging && <ChargeMash
        skillName={charging.name}
        seconds={charging.seconds}
        perPress={charging.perPress}
        cap={Math.round(charging.seconds * DEFAULT_BATTLE_CONFIG.maxChargePressesPerSecond)}
        muted={muted}
        onDone={(count) => {
          const skillId = charging.id;
          setCharging(null);
          void act({ kind: "skill", skillId, charge: count });
        }}
      />}
      {busy && <button data-custom-sound onClick={skipReplay}>演出をスキップ</button>}
      {run && state.status === "active" && !captured && !charging && <div className="arena-retire">
        {retiring
          ? <section className="panel" role="alertdialog" aria-label="リタイアの確認">
              <h2>{arenaWins()}連勝でリタイアしますか？</h2>
              <p>ここまでの{arenaWins()}連勝が記録に残ります。{state.player.name}は無事に戻ります。</p>
              <p className="battle-help">この挑戦は終わります。報酬の受け取りは続けられません。</p>
              <button className="primary" disabled={busy} onClick={() => {
                try {
                  const result = retireArena();
                  setRetiring(false);
                  onLeave();
                  if (result.isBest) setRewardMessage(`自己ベスト更新：${result.wins}連勝`);
                } catch { setError("リタイアできませんでした。"); setRetiring(false); }
              }}>{arenaWins()}連勝で終える</button>
              <button className="text-button" onClick={() => setRetiring(false)}>やめる（戦いを続ける）</button>
            </section>
          : <button className="text-button" disabled={busy} onClick={() => setRetiring(true)}>
              リタイアする（現在 {arenaWins()}連勝）
            </button>}
      </div>}
      {state.status !== "active" && getGameSession().status !== "gameOver" && <BattleResult state={state}>
        <div className="victory-reward" aria-label="アリーナ報酬">
          {state.status === "won" && run && <>
            {run.phase === "cleared" && <h3>アリーナ制覇！</h3>}
            <div ref={rewardChest} className="victory-chest-anchor">
              <button type="button" className={`victory-chest ${claimed ? 'is-open' : ''} ${loot.length ? 'is-revealing' : ''}`}
                disabled={claimed || loot.length > 0} aria-label={claimed ? "宝箱は開封済みです" : "宝箱を開けて報酬を受け取る"}
                onClick={() => {
                  if (claimed || loot.length > 0) return;
                  try {
                    const reward = receiveArenaReward();
                    stopSound.current(); setError("");
                    const won = [...reward.parts.map(p => p.name), ...reward.items.map(i => i.name)];
                    setRewardMessage(won.length ? `獲得：${won.join("、")}` : reward.message);
                    setState(resumeArena()!);
                    if (reward.parts.length) setLoot(reward.parts);
                    else stopSound.current = battleSound('chest', muted);
                  } catch { setError("宝箱を開けませんでした。もう一度お試しください。"); }
                }}>
                <TreasureChestIcon />
                <strong>{loot.length ? "報酬を受け取り中…" : claimed ? "開封済み" : "宝箱を開ける"}</strong>
                {!claimed && <small>押して勝利報酬を受け取ろう！</small>}
              </button>
            </div>
            <p role="status">{rewardMessage || (claimed ? "この戦いの報酬は確認済みです。" : "まだ宝箱を開けていません。")}</p>
            {claimed && <p className="battle-help">獲得したパーツはアイテムボックスへ。融合画面で使えます。</p>}
            {run.phase === "reward" && <button disabled={!claimed || loot.length > 0} onClick={() => {
              setRewardMessage(""); setError(""); setState(continueArena()); arena.current?.scrollIntoView({ block: "center" });
            }}>{run.wins === DEFAULT_ARENA_CONFIG.normalWins
              ? "ボスの待つ第6戦へ"
              : run.wins === DEFAULT_ARENA_CONFIG.finalBossFight - 1
                ? "頂上へ — 冥蒼竜が待つ100戦目"
                : "全回復して次の戦いへ"}</button>}
          </>}
          {(claimed || state.status !== "won") && <button disabled={loot.length > 0} className="text-button" onClick={onLeave}>入口へ戻る（今回の挑戦を終了）</button>}
        </div>
      </BattleResult>}
      {captured && <section className="panel capture-result" aria-label="捕獲">
        <h2>{captured.name}が仲間になった！</h2>
        <p>ドクロゲソを使ったので、この挑戦はここで終わりです。{captured.name}は図鑑に加わりました。</p>
        <button className="primary" onClick={onLeave}>入口へ戻る</button>
      </section>}
      {state.status === "active" && !captured && <section className="panel battle-command-panel" aria-label="バトルコマンド">
        <h2>行動を選ぶ</h2>
        {blocked
          ? <p className="status-blocked" role="status">
              ⚠ {STATUS_LABELS[blocked]}で行動できません。
              <small>{stillUsable.length
                ? `${stillUsable.join('、')}だけは使えます。ほかを選ぶとこのターンは何も起きません。`
                : 'どれを選んでもこのターンは何も起きません。相手の番は進みます。'}</small>
            </p>
          : <p>技で攻める。MPが減ったら、守って回復。</p>}
        <div className="battle-command-grid">
          <button data-element={player?.element} className={blocked ? "is-unusable" : ""} disabled={locked} onClick={() => act("attack")}>
            <strong>攻撃</strong>
            <span className={blocked ? "unusable-note" : ""}>{blocked ? `${STATUS_LABELS[blocked]}中は出せない` : "攻撃力・魔力の高い方を使う"}</span>
            <span>MP 0 {player && enemy ? ` · ${matchupLabel(elementMultiplier(player.element, enemy.element))}` : ""}</span>
          </button>
          <button className={blocked ? "is-unusable" : ""} disabled={locked} onClick={() => { stopSound.current(); stopSound.current = battleSound('defend',muted); void act("defend"); }}>
            <strong>◇ 守る</strong><span className={blocked ? "unusable-note" : ""}>{blocked ? `${STATUS_LABELS[blocked]}中は守れない` : "受けるダメージを減らす"}</span>
            <span>MP回復 +{DEFAULT_BATTLE_CONFIG.defendMpBonus}</span>
          </button>
          {player?.skills.map((skill) => (
            <div key={skill.id} className={`battle-move-option ${inspectedSkill === skill.id ? "is-inspected" : ""}`} onMouseEnter={() => setInspectedSkill(skill.id)} onFocus={() => setInspectedSkill(skill.id)}>
            <button data-element={skill.element} key={skill.id} className={blocked && !getMoveBehavior(skill.id).usableWhileBound ? "is-unusable" : ""} disabled={locked || availableMp < skill.cost} onClick={() => {
              const move = getMoveBehavior(skill.id);
              if (move.chargeSeconds > 0) {
                setCharging({ id: skill.id, name: skillLabel(skill), seconds: move.chargeSeconds, perPress: move.chargeDamage });
                return;
              }
              void act({ kind: "skill", skillId: skill.id });
            }}>
              <strong>{skillLabel(skill)} {finishers.has(skill.id) && <span className="finisher-badge">大技</span>}</strong>
              <MoveBadges element={skill.element} scaling={skill.scaling} />
              <span>{moveHelp(skill,getCoreMonster(state.player.id)).summary}</span>
              <span className={blocked && !getMoveBehavior(skill.id).usableWhileBound ? "unusable-note" : ""}>MP {skill.cost} · {moveHelp(skill,getCoreMonster(state.player.id)).attacks && enemy ? matchupLabel(elementMultiplier(skill.element, enemy.element)) : "補助"}{availableMp < skill.cost ? " · MP不足" : ""}{blocked ? (getMoveBehavior(skill.id).usableWhileBound ? ` · ${STATUS_LABELS[blocked]}中でも使える` : ` · ${STATUS_LABELS[blocked]}中は出せない`) : ""}</span>
            </button>
            <button className="move-info" aria-label={`${skillLabel(skill)}の効果を確認`} aria-expanded={helpSkill === skill.id} aria-controls="battle-move-help" onClick={() => { setInspectedSkill(skill.id); setHelpSkill(helpSkill === skill.id ? null : skill.id); }}>ⓘ 効果・使う部位</button>
            </div>
          ))}
        </div>
        {describedSkill && <div id="battle-move-help" className="battle-move-help"><MoveHelp caster={getCoreMonster(state.player.id)} skill={describedSkill} move={helpMove} phenotype={getCoreMonster(state.player.id).phenotype} /><button className="text-button" onClick={() => { setHelpSkill(null); setInspectedSkill(null); }}>説明を閉じる</button></div>}
        <p className="battle-help">MPは毎ターン +{DEFAULT_BATTLE_CONFIG.mpRegenPerTurn}。守ると、さらに回復します。</p>
      </section>
      }
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
      {!run && <button
        className="text-button"
        disabled={busy}
        onClick={() => setState(createBattle(state.player, state.enemy))}
      >
        ↻ バトルをリセット
      </button>}
    </>
  );
}
