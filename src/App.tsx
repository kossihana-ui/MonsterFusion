import { useState } from "react";
import { Collection } from "./pages/Collection";
import { Detail } from "./pages/Detail";
import { Fusion } from "./pages/Fusion";
import { Battle } from "./pages/Battle";
import { Register } from "./pages/Register";
import { SoundLab } from "./pages/SoundLab";
import { initialMonsters, gameAdapter } from "./mocks/game";
import { playUiSound } from "./components/uiSound";
import type { GameAdapter, Monster } from "./shared/ui";
type Page = "collection" | "fusion" | "battle" | "register" | "detail" | "sound";
const tabs: { id: Page; label: string; icon: string; english: string }[] = [
  {
    id: "collection",
    label: "モンスター図鑑",
    icon: "▦",
    english: "COLLECTION",
  },
  { id: "fusion", label: "融合のアトリエ", icon: "✧", english: "FUSION" },
  { id: "battle", label: "バトルアリーナ", icon: "⚔", english: "BATTLE" },
  { id: "register", label: "モンスター登録", icon: "＋", english: "REGISTER" },
  { id: "sound", label: "音の試聴室", icon: "♪", english: "SOUND WORKSHOP" },
];
export default function App({
  adapter = gameAdapter,
}: {
  adapter?: GameAdapter;
}) {
  const [page, setPage] = useState<Page>("collection");
  const [monsters, setMonsters] = useState(initialMonsters);
  const [selected, setSelected] = useState<Monster | null>(null);
  const add = (m: Monster) => setMonsters((prev) => [...prev, m]);
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
              monsters={monsters}
              onBack={() => setPage("collection")}
            />
          )}
          {page === "fusion" && (
            <Fusion monsters={monsters} adapter={adapter} onCreated={add} />
          )}
          {page === "battle" && (
            <Battle monsters={monsters} adapter={adapter} />
          )}
          {page === "register" && <Register onRegister={add} />}
          {page === "sound" && <SoundLab />}
          <footer>
            <span>MONSTERFUSION</span>
            <span>ひとつの融合から、無限の物語へ。</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
