import { useCallback, useState, useSyncExternalStore } from "react";
import { GameOverScreen } from "./components/GameOverScreen";
import { SoulMake } from "./pages/SoulMake";
import { Collection } from "./pages/Collection";
import { Detail } from "./pages/Detail";
import { Fusion } from "./pages/Fusion";
import { Battle } from "./pages/Battle";
import { SoundLab } from "./pages/SoundLab";
import { MoveWorkshop } from "./pages/MoveWorkshop";
import { SaveTransfer } from "./pages/SaveTransfer";
import { gameAdapter, getGameSession, subscribeSession, presentSessionMonster, restartGame } from "./mocks/game";
import { playUiSound } from "./components/uiSound";
import { GameGuide } from "./components/GameGuide";
import { workshopHere } from "./shared/workshop";
import type { GameAdapter, Monster } from "./shared/ui";
type Page = "collection" | "fusion" | "battle" | "register" | "detail" | "sound" | "moves" | "soul" | "transfer";
// `workshop` marks a room that belongs to whoever is building the game, not
// to the people playing it. Those doors are only drawn for them - see
// shared/workshop.ts for how one says so.
const tabs: { id: Page; label: string; icon: string; english: string; workshop?: true }[] = [
  {
    id: "collection",
    label: "モンスター図鑑",
    icon: "▦",
    english: "COLLECTION",
  },
  { id: "fusion", label: "融合のアトリエ", icon: "✧", english: "FUSION" },
  { id: "soul", label: "ソウルメイク", icon: "◇", english: "SOUL MAKE" },
  { id: "battle", label: "バトルアリーナ", icon: "⚔", english: "BATTLE" },
  { id: "register", label: "モンスター登録", icon: "＋", english: "REGISTER" },
  { id: "transfer", label: "セーブの引き継ぎ", icon: "⇄", english: "SAVE TRANSFER" },
  { id: "sound", label: "音の試聴室", icon: "♪", english: "SOUND WORKSHOP", workshop: true },
  { id: "moves", label: "技の編集室", icon: "✎", english: "MOVE WORKSHOP", workshop: true },
];
export default function App({
  adapter = gameAdapter,
}: {
  adapter?: GameAdapter;
}) {
  const [page, setPage] = useState<Page>("collection");
  // Read once, at the door: the sidebar should not rearrange itself halfway
  // through a session because the address changed.
  const [workshop] = useState(workshopHere);
  const doors = tabs.filter((tab) => !tab.workshop || workshop);
  const session = useSyncExternalStore(subscribeSession, getGameSession);
  const monsters = session.owned.map(presentSessionMonster);
  const [selected, setSelected] = useState<Monster | null>(null);
  const gameOver = session.status === 'gameOver';
  // Someone is standing in the ring. Core keeps this list, and it is the same
  // thing that stops a fighting monster being fused, so the screen and the
  // rule cannot disagree.
  const inBattle = session.deployed.length > 0;
  const [battleReplaying, setBattleReplaying] = useState(false);
  const [gameOverMuted, setGameOverMuted] = useState(false);
  const onReplay = useCallback((playing: boolean, muted?: boolean) => {
    setBattleReplaying(playing);
    if (muted !== undefined) setGameOverMuted(muted);
  }, []);
  return (
    <div className="app" onClickCapture={(event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-custom-sound]') || page === "sound") return;
      const button = target.closest('button');
      if (button && !button.disabled) playUiSound();
    }} onChangeCapture={(event) => {
      if (event.target instanceof HTMLSelectElement) playUiSound();
    }}>
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!gameOver && !inBattle) setPage("collection");
          }}
        >
          <span className="brand-mark">
            M<span>✦</span>
          </span>
          <span>
            MONSTER<small>FUSION</small>
          </span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav aria-label="メインナビゲーション">
          {doors.map((tab) => (
            <button
              key={tab.id}
              disabled={gameOver || (inBattle && tab.id !== "battle")}
              title={inBattle && tab.id !== "battle" ? "戦闘中は移動できません" : undefined}
              aria-current={
                page === tab.id ||
                (page === "detail" && tab.id === "collection")
                  ? "page"
                  : undefined
              }
              onClick={() => setPage(tab.id)}
            >
              <span className="nav-icon">{tab.icon}</span>
              <span>
                {tab.label}
                <small>{tab.english}</small>
              </span>
              {tab.id === "collection" && <b>{monsters.length}</b>}
            </button>
          ))}
        </nav>
        {inBattle && !gameOver && <p className="sidebar-locked" role="status">
          ⚔ 戦闘中<small>決着がつくまで、ほかの画面には移動できません。</small>
        </p>}
        <div className="sidebar-bottom">
          <span className="live-dot" /> LOCAL DEMO
          <div>小さな出会い。無限の系譜。</div>
          <small>MonsterFusion / v0.1</small>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <GameGuide />
          <span>
            WORKSPACE <span>/</span>{" "}
            {page === "detail"
              ? "個体詳細"
              : tabs.find((t) => t.id === page)?.label}
          </span>
          <span className="demo-pill">
            <span className="live-dot" /> デモデータで探索中
          </span>
        </header>
        <main>
          {page === "collection" && (
            <Collection
              monsters={monsters}
              onSelect={(m) => {
                setSelected(m);
                setPage("detail");
              }}
              onRegister={() => setPage("register")}
            />
          )}
          {page === "detail" && selected && (
            <Detail
              monster={selected}
              monsters={session.history.map(presentSessionMonster)}
              onBack={() => setPage("collection")}
            />
          )}
          {page === "fusion" && (
            <Fusion monsters={monsters} adapter={adapter} onCreated={() => {}} />
          )}
          {page === "battle" && (
            <Battle monsters={monsters} adapter={adapter} onReplay={onReplay} />
          )}
          {page === "register" && <section className="panel"><h1>モンスター登録</h1><p>仲間の数を管理するルールに合わせ、画像からの無料追加は休止しています。</p><button onClick={() => setPage("soul")}>ソウルメイクへ</button></section>}
          {page === "soul" && <SoulMake />}
          {/* Guarded as well as hidden, so no stray link can open a room the
              player was never meant to find. */}
          {page === "transfer" && <SaveTransfer />}
          {page === "sound" && workshop && <SoundLab />}
          {page === "moves" && workshop && <MoveWorkshop />}

          {gameOver && !battleReplaying && <GameOverScreen muted={gameOverMuted} onRestart={() => { restartGame(); setSelected(null); setPage('collection'); }} />}
          <footer>
            <span>MONSTERFUSION</span>
            <span>ひとつの融合から、無限の物語へ。</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
