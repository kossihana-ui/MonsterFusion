import { blockingStatus, STATUS_LABELS, STATUS_POLARITY } from "@core/core/index.ts";
import type { StatusEffect, StatusKind } from "@core/core/index.ts";
import "../styles/status-chips.css";

/** What each condition actually does to you, in one short line. */
const STATUS_EFFECTS: Record<StatusKind, string> = {
  bind: "動けない",
  blind: "物理が当たりにくい",
  poison: "毎ターンHPが減る",
  seed: "次の一撃が効きやすい",
  flinch: "動けない",
  recoil: "動けない",
  attackUp: "攻撃力が上がっている",
  reflect: "受けた攻撃を返す",
  doubleStrike: "次のターン2回行動",
  evasion: "攻撃を避けやすい",
};

/**
 * Both monsters' conditions, said plainly.
 *
 * Which condition stops a monster acting is core's answer, not a list
 * repeated here - `blockingStatus` is the same function the battle uses to
 * decide, so the screen cannot drift from what actually happens.
 */
export function StatusChips({ statuses, label }: { statuses: readonly StatusEffect[] | undefined; label: string }) {
  const live = (statuses ?? []).filter((status) => status.turns > 0);
  const blocked = blockingStatus(statuses);
  if (live.length === 0) {
    return <p className="status-chips is-clear" aria-label={`${label}の状態`}>状態：なし</p>;
  }
  return (
    <div className="status-chips" aria-label={`${label}の状態`}>
      {blocked && <p className="status-blocked" role="status">⚠ {STATUS_LABELS[blocked]}で行動できない</p>}
      <ul>
        {live.map((status) => (
          <li
            key={status.kind}
            className={`status-chip is-${STATUS_POLARITY[status.kind]} ${status.kind === blocked ? "is-blocking" : ""}`}
            title={STATUS_EFFECTS[status.kind]}
          >
            <strong>{STATUS_LABELS[status.kind]}</strong>
            <span>{STATUS_EFFECTS[status.kind]}</span>
            <small>あと{status.turns}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
