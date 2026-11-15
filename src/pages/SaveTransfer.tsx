import { useState } from "react";
import type { AnonymousAccount, SyncEnvelope } from "@core/core/index.ts";
import { adoptCode, deviceId, ensureAccount, storedAccount, transferCode } from "../shared/account";
import { createSupabaseTransport, supabaseKeys } from "../shared/supabaseSave";
import { settleDivergence, syncOnce, type SyncOutcome } from "../shared/saveSync";
import { applySaveFile, currentSaveFile } from "../mocks/game";
import { SyncConflict } from "../components/SyncConflict";
import "../styles/sync.css";

/**
 * Carrying the game to another device.
 *
 * The account is made here and nowhere else - visiting this page is the first
 * thing that creates one - so somebody who never opens it is never given an
 * identity they did not ask for.
 *
 * The last envelope this browser pushed is remembered, because that is what
 * says whether a divergence is real: without it, every second device looks
 * like a conflict.
 */
const LAST_KEY = "monsterfusion.sync.last.v1";

function lastEnvelope(): SyncEnvelope | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as SyncEnvelope) : null;
  } catch {
    return null;
  }
}

function rememberEnvelope(envelope: SyncEnvelope): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(envelope));
  } catch {
    // Then the next sync reads as a conflict and the player picks a side,
    // which is wrong-but-safe rather than silently overwriting.
  }
}

export function SaveTransfer() {
  const keys = supabaseKeys();
  const [account, setAccount] = useState<AnonymousAccount | null>(storedAccount);
  const [shown, setShown] = useState(false);
  const [typed, setTyped] = useState("");
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState<Extract<SyncOutcome, { kind: "diverged" }> | null>(null);

  function begin(): AnonymousAccount | null {
    const made = account ?? ensureAccount();
    if (!made) {
      setSaid("このブラウザではアカウントを作れません（保存が禁止されているか、暗号用の乱数がありません）。");
      return null;
    }
    if (!account) setAccount(made);
    return made;
  }

  function report(outcome: SyncOutcome): void {
    if (outcome.kind === "diverged") {
      setConflict(outcome);
      setSaid("2つの端末で遊んでいました。下で選んでください。");
      return;
    }
    setConflict(null);
    if (outcome.kind === "pushed") {
      rememberEnvelope(outcome.envelope);
      setSaid("この端末のセーブを送りました。");
    } else if (outcome.kind === "pulled") {
      if (applySaveFile(outcome.envelope.save)) {
        rememberEnvelope(outcome.envelope);
        setSaid("もう一方の端末のセーブを読み込みました。");
      } else {
        setSaid("届いたセーブを読めませんでした。この端末のゲームはそのままです。");
      }
    } else if (outcome.kind === "same") {
      if (outcome.envelope) rememberEnvelope(outcome.envelope);
      setSaid("どちらも同じでした。何もしていません。");
    } else {
      setSaid(outcome.message);
    }
  }

  async function sync(): Promise<void> {
    const held = begin();
    if (!held) return;
    const transport = createSupabaseTransport(keys, { secret: held.secret });
    if (!transport) {
      setSaid("同期の置き場所がまだ設定されていません。");
      return;
    }
    setBusy(true);
    setSaid("同期しています…");
    try {
      report(await syncOnce({
        transport,
        accountId: held.id,
        secret: held.secret,
        deviceId: deviceId(),
        local: lastEnvelope(),
        save: currentSaveFile(),
      }));
    } finally {
      setBusy(false);
    }
  }

  async function settle(keep: "local" | "remote"): Promise<void> {
    const held = account;
    if (!held || !conflict) return;
    const transport = createSupabaseTransport(keys, { secret: held.secret });
    if (!transport) return;
    setBusy(true);
    try {
      const outcome = await settleDivergence(
        {
          transport,
          accountId: held.id,
          secret: held.secret,
          deviceId: deviceId(),
          local: conflict.envelopes.local,
          save: currentSaveFile(),
        },
        conflict.envelopes,
        keep,
      );
      // Keeping the far side means this device has to become it.
      if (outcome.kind === "pushed" && keep === "remote") {
        applySaveFile(outcome.envelope.save);
      }
      report(outcome);
    } finally {
      setBusy(false);
    }
  }

  function adopt(): void {
    const result = adoptCode(typed);
    if (!result.ok) {
      setSaid(result.reason);
      return;
    }
    setAccount(result.account);
    setShown(false);
    setTyped("");
    try {
      localStorage.removeItem(LAST_KEY);
    } catch { /* the next sync just reads as a conflict */ }
    setSaid("コードを受け取りました。「今すぐ同期」でセーブを取り寄せてください。");
  }

  return (
    <section className="panel sync-page">
      <div className="hero">
        <div>
          <div className="eyebrow">SAVE TRANSFER</div>
          <h1>セーブの引き継ぎ</h1>
          <p>
            セーブはこのブラウザの中にあります。別の端末で続けるには、下のコードを持っていってください。
          </p>
        </div>
      </div>

      {!keys && (
        <p className="sync-warning" role="status">
          いまは同期の置き場所が設定されていないため、<strong>この端末の中だけ</strong>で動いています。
          コードの発行と読み取りは使えます。
        </p>
      )}

      <div className="sync-block">
        <h2>この端末のコード</h2>
        {account ? (
          <>
            <p className="sync-code-lead">
              別の端末でこのコードを入れると、同じセーブになります。
              <strong>人に見せないでください。</strong>これを持っている人が、このセーブの持ち主です。
            </p>
            <div className="sync-code-row">
              <code className={`sync-code${shown ? "" : " is-hidden"}`}>
                {shown ? transferCode(account) : "・・・・ ・・・・ ・・・・ ・・・・"}
              </code>
              <button type="button" onClick={() => setShown((value) => !value)}>
                {shown ? "隠す" : "見る"}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard
                    ?.writeText(transferCode(account))
                    .then(() => setSaid("コードをコピーしました。"))
                    .catch(() => {
                      setShown(true);
                      setSaid("コピーできませんでした。表示されたコードを選んで写してください。");
                    });
                }}
              >
                コピー
              </button>
            </div>
            <p className="sync-code-warning">
              このコードを失くすと、そのセーブは<strong>誰のものでもなくなります</strong>。
              メールアドレスを預かっていないので、こちらから戻す手段がありません。
            </p>
          </>
        ) : (
          <>
            <p>まだこの端末にはアカウントがありません。</p>
            <button
              type="button"
              className="primary"
              onClick={() => {
                const made = begin();
                if (made) setSaid("アカウントを作りました。コードを「見る」で確認できます。");
              }}
            >
              アカウントを作る
            </button>
          </>
        )}
      </div>

      <div className="sync-block">
        <h2>別の端末のコードを入れる</h2>
        <p>
          持ってきたコードを入れると、<strong>この端末のアカウントが入れ替わります</strong>。
          いま遊んでいる記録は、入れ替える前にコードを控えておいてください。
        </p>
        <div className="sync-code-row">
          <input
            className="sync-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="MF1-XXXX-XXXX-…"
            aria-label="引き継ぎコード"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="button" disabled={typed.trim() === ""} onClick={adopt}>
            受け取る
          </button>
        </div>
      </div>

      <div className="sync-block">
        <h2>同期</h2>
        <button type="button" className="primary" disabled={busy || !keys} onClick={() => void sync()}>
          {busy ? "同期中…" : "今すぐ同期"}
        </button>
        <p className="sync-said" role="status">{said}</p>
        {conflict && (
          <SyncConflict
            local={conflict.local}
            remote={conflict.remote}
            busy={busy}
            onKeep={(keep) => void settle(keep)}
            onCancel={() => {
              setConflict(null);
              setSaid("そのままにしました。どちらのセーブも残っています。");
            }}
          />
        )}
      </div>
    </section>
  );
}
