import type { LearnableMove } from "@core/core/index.ts";
import { MoveHelp } from "./MoveHelp";
import { movePartArt } from "../shared/moveHelp";
import { useState } from "react";
import type { ReactNode } from "react";
import { MAX_MOVE_SLOTS } from "@core/core/index.ts";
import { getFeatureMoves, recommendedFeatureLoadout } from "../mocks/game";
import { getCoreMonster, getMoveLoadout, setMoveLoadout } from "../mocks/game";
import { skillLabel } from "../shared/battlePresentation";
import { MoveBadges } from "./MoveBadges";
import { playUiSound } from "./uiSound";

export function MoveLoadoutEditor({ monsterId, children, onInspect, onSaved }: { monsterId: string; children: ReactNode; onInspect?: (move: LearnableMove | undefined) => void; onSaved?: (skillIds: readonly string[]) => void }) {
  const monster = getCoreMonster(monsterId);
  const moves = getFeatureMoves(monsterId);
  const pad = (ids: readonly string[]) => Array.from({ length: MAX_MOVE_SLOTS }, (_, i) => ids[i] ?? "");
  const [slots, setSlots] = useState(() => pad(getMoveLoadout(monsterId).skillIds));
  const [inspected, setInspected] = useState("");
  function inspect(id: string) { setInspected(id); onInspect?.(moves.find(m => m.skill.id === id)); }
  const [picked, setPicked] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  // The slot whose numbers are open. One at a time: the slots are a short list
  // read top to bottom, and three help panels standing open at once is the
  // tall screen this row layout exists to get rid of.
  const [openSlot, setOpenSlot] = useState(-1);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function change(next: string[], sound: "equip" | "remove") {
    setSlots(next); setError(""); setOpenSlot(-1);
    setMessage("変更中です。「この技でセット」で反映します。");
    playUiSound(sound);
  }
  function equip(id: string, index: number) {
    if (!moves.some(m => m.skill.id === id)) return;
    const from = slots.indexOf(id);
    if (from === index) { setPicked(""); return; }
    const next = [...slots];
    if (from >= 0) next[from] = next[index];
    next[index] = id;
    change(next, "equip"); setPicked("");
  }
  function save() {
    const result = setMoveLoadout(monsterId, slots.filter(Boolean));
    if (!result.ok) { setError(result.message); setMessage(""); return; }
    playUiSound(); setError("");
    setMessage("技をセットしました。次のバトルから使えます。");
    onSaved?.(result.loadout.skillIds);
  }
  /**
   * The part a move came from, drawn beside its name. Three move names in a
   * column look interchangeable; a tail, a horn and a pair of wings do not.
   */
  function partArt(move: LearnableMove | undefined, empty: string) {
    const art = move ? movePartArt(move.source, monster.phenotype) : "";
    return <span className="move-art" aria-hidden="true">
      {art ? <img src={art} alt="" /> : <span>{move ? "✦" : empty}</span>}
    </span>;
  }
  return <>
    <section className="panel" data-custom-sound>
      {children}
      <h2>技セット <small>{slots.filter(Boolean).length} / {MAX_MOVE_SLOTS}</small></h2>
      <p className="battle-help">技を枠へドラッグ。技を選んで枠を押してもセットできます。ⓘで技の性能を開けます。全枠を空にして、通常攻撃と守るだけで戦うこともできます。</p>
      <div className="move-slot-grid" aria-label="セットする技">
        {slots.map((id, index) => {
          const move = moves.find(m => m.skill.id === id);
          const open = openSlot === index && !!move;
          return <div className={`move-slot ${inspected === id && id ? "is-inspected" : ""}`} onMouseEnter={() => inspect(id)} onFocus={() => inspect(id)} data-element={move?.skill.element} key={index}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={e => { e.preventDefault(); equip(e.dataTransfer.getData("text/plain"), index); }}>
            <div className="move-slot-row">
              <button className="slot-target" type="button" aria-label={`技枠${index + 1}：${move ? skillLabel(move.skill) : "空き枠"}`} onClick={() => {
                if (picked) equip(picked, index);
                else { playUiSound(); setMessage("技一覧から技を選んで、この枠を押してください。"); }
              }}>
                <small className="slot-no" aria-hidden="true">{index + 1}</small>
                {partArt(move, "＋")}
                <span className="slot-copy">
                  <strong>{move ? skillLabel(move.skill) : "空き枠"}</strong>
                  <span className="slot-meta">
                    {move
                      ? <><MoveBadges element={move.skill.element} scaling={move.skill.scaling} /><small>MP {move.skill.cost}{move.category === "finisher" ? " · 大技" : ""}</small></>
                      : <small>技一覧から選んでください</small>}
                  </span>
                </span>
              </button>
              {move && <button type="button" className="move-info" aria-label={`${skillLabel(move.skill)}の性能`} aria-expanded={open} aria-controls={`slot-info-${index}`} onClick={() => {
                inspect(move.skill.id); setOpenSlot(open ? -1 : index); playUiSound();
              }}>ⓘ</button>}
              {move && <button type="button" className="slot-remove" aria-label={`${skillLabel(move.skill)}を外す`} onClick={() => change(slots.map((v, i) => i === index ? "" : v), "remove")}>×</button>}
            </div>
            {open && move && <div id={`slot-info-${index}`} className="slot-info"><MoveHelp caster={monster} skill={move.skill} move={move} phenotype={monster.phenotype} /></div>}
          </div>;
        })}
      </div>
      <div className="loadout-actions">
        <button type="button" onClick={save}>この技でセット</button>
        <button type="button" className="text-button" onClick={() => { change(pad(recommendedFeatureLoadout(monsterId).skillIds), "equip"); setPicked(""); }}>おすすめを選ぶ</button>
      </div>
      {error && <p role="alert">{error}</p>}
      <p role="status">{message}</p>
      <p className="battle-help">攻撃・守るはいつでも使えます。技セットは自動保存され、次に開いたときもそのままです。</p>
    </section>
    <section className="panel" data-custom-sound aria-label="覚えられる技">
      <h2>部位から覚えられる技</h2>
      {!moves.length && <p>この個体には部位技がありません。通常攻撃と「守る」で戦えます。</p>}
      <p className="battle-help">ⓘで説明を開けます。セット済みの技を別の枠に置くと、位置を交換します。</p>
      <div className="profile-moves">
        {moves.map(move => {
          const { skill, category } = move;
          const open = expanded.includes(skill.id);
          return <div className={`profile-move ${inspected === skill.id ? "is-inspected" : ""}`} onMouseEnter={() => inspect(skill.id)} onFocus={() => inspect(skill.id)} data-element={skill.element} key={skill.id}>
            <div className="move-list-row">
              <button type="button" className="move-pick" draggable aria-pressed={picked === skill.id}
                onDragStart={e => { e.dataTransfer.setData("text/plain", skill.id); e.dataTransfer.effectAllowed = "move"; setPicked(skill.id); playUiSound(); }}
                onDragEnd={() => setPicked("")}
                onClick={() => { setPicked(picked === skill.id ? "" : skill.id); playUiSound(); setMessage("入れたい技枠を押してください。"); }}>
                {partArt(move, "✦")}
                <span className="slot-copy">
                  <strong>{skillLabel(skill)}{category === "finisher" && <span className="finisher-badge">大技</span>}</strong>
                  {/* Name and cost. The effect lives behind ⓘ, and saying it
                      in both places made the list twice as tall for nothing. */}
                  <span className="slot-meta">
                    <small>MP {skill.cost}{slots.includes(skill.id) ? " · セット済み" : ""}</small>
                  </span>
                </span>
              </button>
              <button type="button" className="move-info" aria-label={`${skillLabel(skill)}の説明`} aria-expanded={open} aria-controls={`move-info-${skill.id}`} onClick={() => {
                inspect(skill.id); setExpanded(open ? expanded.filter(id => id !== skill.id) : [...expanded, skill.id]); playUiSound();
              }}>ⓘ</button>
            </div>
            {open && <div id={`move-info-${skill.id}`}><MoveHelp caster={monster} skill={skill} move={move} phenotype={monster.phenotype} /></div>}
          </div>;
        })}
      </div>
    </section>
  </>;
}
