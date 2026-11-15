import type { ConflictChoice } from "@core/core/index.ts";
import "../styles/sync.css";

/**
 * The one screen in this game that can take something away.
 *
 * Two devices were played from the same point, so one of the two runs stops
 * being the player's. That is not a thing to resolve with a tidy "最新を使う"
 * button: it has to say what each side is, and what choosing costs.
 *
 * What it must never do is look symmetric when it is not. Both sides keep
 * their whole family tree either way - core merges that - and only the run
 * is lost, so the warning says exactly that rather than "データが消えます".
 */
export function SyncConflict({
  local,
  remote,
  busy,
  onKeep,
  onCancel,
}: {
  local: ConflictChoice;
  remote: ConflictChoice;
  busy: boolean;
  onKeep: (keep: "local" | "remote") => void;
  onCancel: () => void;
}) {
  return (
    <div className="sync-conflict" role="group" aria-labelledby="sync-conflict-title">
      <h3 id="sync-conflict-title">2つの端末で遊んでいました</h3>
      <p className="sync-conflict-lead">
        どちらも同じところから進んでいて、<strong>新しいほうはありません。</strong>
        残すほうを選んでください。
      </p>
      <div className="sync-sides">
        <Side side={local} mine busy={busy} onKeep={() => onKeep("local")} />
        <Side side={remote} mine={false} busy={busy} onKeep={() => onKeep("remote")} />
      </div>
      <p className="sync-conflict-note">
        選ばなかったほうのモンスターも<strong>図鑑には残ります</strong>。
        手持ちからいなくなるだけで、系譜が消えることはありません。
      </p>
      <button type="button" className="text-button" onClick={onCancel} disabled={busy}>
        あとで決める
      </button>
    </div>
  );
}

function Side({
  side,
  mine,
  busy,
  onKeep,
}: {
  side: ConflictChoice;
  mine: boolean;
  busy: boolean;
  onKeep: () => void;
}) {
  return (
    <div className="sync-side">
      <p className="sync-side-who">
        {mine ? "この端末" : "もう一方の端末"}
        <small>{side.deviceId}</small>
      </p>
      <dl className="sync-side-facts">
        <div>
          <dt>手持ち</dt>
          <dd>{side.owned}体</dd>
        </div>
        <div>
          <dt>図鑑</dt>
          <dd>{side.lineage}体</dd>
        </div>
        <div>
          <dt>挑戦中</dt>
          <dd>{side.arenaWins === null ? "なし" : `${side.arenaWins}連勝`}</dd>
        </div>
        <div>
          <dt>最後の保存</dt>
          <dd>{when(side.savedAt)}</dd>
        </div>
      </dl>
      {side.gameOver && <p className="sync-side-over">ゲームオーバー済み</p>}
      <button type="button" className="primary" disabled={busy} onClick={onKeep}>
        こちらを残す
      </button>
    </div>
  );
}

function when(at: number): string {
  if (!Number.isFinite(at) || at <= 0) return "不明";
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
