import { useState } from "react";
import type { Monster } from "../shared/types";
import { MonsterCard } from "../components/MonsterView";
export function Collection({
  monsters,
  onSelect,
  onRegister,
}: {
  monsters: Monster[];
  onSelect: (m: Monster) => void;
  onRegister: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("default");
  const filtered = monsters
    .filter((m) => m.name.includes(query))
    .sort((a, b) => (sort === "generation" ? b.generation - a.generation : 0));
  return (
    <>
      <div className="hero">
        <div>
          <div className="eyebrow">YOUR LITTLE WORLD</div>
          <h1>
            モンスター図鑑<span>Collection</span>
          </h1>
          <p>出会い、育て、つなぐ。あなただけの系譜をここから。</p>
        </div>
        <button className="primary" onClick={onRegister}>
          ＋ モンスターを登録
        </button>
      </div>
      <div className="overview">
        <div>
          <span className="overview-icon">▦</span>
          <div>
            <small>所有モンスター</small>
            <strong>
              {monsters.length}
              <em>体</em>
            </strong>
          </div>
        </div>
        <div>
          <span className="overview-icon purple">✧</span>
          <div>
            <small>最高到達世代</small>
            <strong>
              {Math.max(...monsters.map((m) => m.generation), 0)}
              <em>世代</em>
            </strong>
          </div>
        </div>
        <div className="overview-note">
          <span>✦</span> 可能性は、世代を超えて。
          <small>2体のモンスターから新しい命を生み出そう。</small>
        </div>
      </div>
      <div className="collection-toolbar">
        <h2>
          所有モンスター <span>{monsters.length}</span>
        </h2>
        <div className="filters">
          <input
            aria-label="モンスターを検索"
            placeholder="⌕ 名前で検索…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            aria-label="並び順"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="default">登録順</option>
            <option value="generation">世代が高い順</option>
          </select>
        </div>
      </div>
      <div className="monster-grid">
        {filtered.map((m) => (
          <MonsterCard key={m.id} monster={m} onSelect={() => onSelect(m)} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="empty">
          {monsters.length === 0
            ? "まだモンスターがいません。32×32のPNGを登録して始めましょう。"
            : "該当するモンスターが見つかりません。"}
        </div>
      )}
      <div className="tip">
        ✧ <span>小さなヒント</span>{" "}
        融合を重ねると世代が上がり、新しい可能性が広がります。
      </div>
    </>
  );
}
