import { useState, useSyncExternalStore } from "react";
import { SoulMake } from "./pages/SoulMake";
import { Collection } from "./pages/Collection";
import { Detail } from "./pages/Detail";
import { Fusion } from "./pages/Fusion";
import { Battle } from "./pages/Battle";
import { SoundLab } from "./pages/SoundLab";
import { MoveWorkshop } from "./pages/MoveWorkshop";
import { gameAdapter, getGameSession, subscribeSession, presentSessionMonster, restartGame } from "./mocks/game";
import { playUiSound } from "./components/uiSound";
import { GameGuide } from "./components/GameGuide";
import type { GameAdapter, Monster } from "./shared/ui";
type Page = "collection" | "fusion" | "battle" | "register" | "detail" | "sound" | "moves" | "soul";
const tabs: { id: Page; label: string; icon: string; english: string }[] = [
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
  { id: "sound", label: "音の試聴室", icon: "♪", english: "SOUND WORKSHOP" },
  { id: "moves", label: "技の編集室", icon: "✎", english: "MOVE WORKSHOP" },
];
export default function App({
  adapter = gameAdapter,
}: {
  adapter?: GameAdapter;
}) {
  const [page, setPage] = useState<Page>("collection");
  const session = useSyncExternalStore(subscribeSession, getGameSession);
  const monsters = session.owned.map(presentSessionMonster);
  const [selected, setSelected] = useState<Monster | null>(null);
  const gameOver = session.status === 'gameOver';
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
            setPage("collection");
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
          {tabs.map((tab) => (
            <button
              key={tab.id}
              disabled={gameOver}
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
          {gameOver ? <section className="panel game-over" role="alert">
            <div className="eyebrow">GAME OVER</div><h1>仲間がいなくなりました</h1>
            <p>所有モンスターが0体になり、今回の冒険は終了です。</p>
            <p>融合は親2体を使って子1体を生みます。敗北すると出場した仲間を失います。</p>
            <button className="primary" onClick={() => { restartGame(); setSelected(null); setPage('collection'); }}>最初の3体からやり直す</button>
            <p>最初から始めると、今回集めたパーツもリセットされます。</p>
          </section> : <>
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
            <Battle monsters={monsters} adapter={adapter} />
          )}
          {page === "register" && <section className="panel"><h1>モンスター登録</h1><p>仲間の数を管理するルールに合わせ、画像からの無料追加は休止しています。</p><button onClick={() => setPage("soul")}>ソウルメイクへ</button></section>}
          {page === "soul" && <SoulMake />}
          {page === "sound" && <SoundLab />}
          {page === "moves" && <MoveWorkshop />}
          </>}
          <footer>
            <span>MONSTERFUSION</span>
            <span>ひとつの融合から、無限の物語へ。</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
