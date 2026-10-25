import { useState } from "react";
import { defaultLoadout, getLearnableMoves, MAX_MOVE_SLOTS } from "@core/core/index.ts";
import { getCoreMonster, getMoveLoadout, setMoveLoadout } from "../mocks/game";
import { skillLabel } from "../shared/battlePresentation";
import { MoveBadges } from "./MoveBadges";

export function MoveLoadoutEditor({ monsterId }: { monsterId: string }) {
  const monster = getCoreMonster(monsterId);
  const moves = getLearnableMoves(monster);
  const [selected, setSelected] = useState<readonly string[]>(() => getMoveLoadout(monsterId).skillIds);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  function change(ids: readonly string[]) {
    setSelected(ids);
    setMessage("変更中です。「この技でセット」で反映します。");
    setError("");
  }
  function save() {
    const result = setMoveLoadout(monsterId, selected);
    if (!result.ok) { setError(result.message); setMessage(""); return; }
    setError("");
    setMessage("技をセットしました。次のバトルから使えます。");
  }
  return <section aria-label="技セット">
    <h2>技セット <small>{selected.length} / {MAX_MOVE_SLOTS}</small></h2>
    <p>使いたい技を選ぼう。大技も同じ枠にセットできます。</p>
    <ol className="move-slots" aria-label="セットする技">
      {Array.from({ length: MAX_MOVE_SLOTS }, (_, index) => {
        const move = moves.find(m => m.skill.id === selected[index]);
        return <li key={index}>{move ? <><span>{skillLabel(move.skill)}</span><button type="button" aria-label={`${skillLabel(move.skill)}を外す`} onClick={() => change(selected.filter(id => id !== move.skill.id))}>外す</button></> : <span>空き枠</span>}</li>;
      })}
    </ol>
    <div className="profile-moves">
      {moves.map(({ skill, category, reason }) => {
        const checked = selected.includes(skill.id);
        return <label className="profile-move move-option" data-element={skill.element} key={skill.id}>
          <span><input type="checkbox" checked={checked} disabled={!checked && selected.length >= MAX_MOVE_SLOTS} onChange={() => change(checked ? selected.filter(id => id !== skill.id) : [...selected, skill.id])} /> <strong>{skillLabel(skill)}</strong> {category === "finisher" && <span className="finisher-badge">大技</span>}</span>
          <MoveBadges element={skill.element} scaling={skill.scaling} />
          <span>MP {skill.cost} · {reason}</span>
        </label>;
      })}
    </div>
    <div className="loadout-actions">
      <button type="button" onClick={save}>この技でセット</button>
      <button type="button" className="text-button" onClick={() => change(defaultLoadout(monster).skillIds)}>おすすめを選ぶ</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <p role="status">{message}</p>
    <p className="battle-help">攻撃・守るはいつでも使えます。技セットはこのプレイ中のみ保持され、ページを再読み込みすると戻ります。</p>
  </section>;
}
