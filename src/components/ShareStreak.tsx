import { useState } from "react";
import type { RunRecord } from "../shared/record";
import { lineShareUrl, postIntentUrl, siteUrl, streakShare, worthSharing } from "../shared/share";
import { playUiSound } from "./uiSound";
import "../styles/share.css";

/**
 * The one way a run leaves this browser.
 *
 * Absent entirely where the host forbids a game to open another site -
 * ふりーむ！ does, so that build sets MONSTERFUSION_SHARE=off and this
 * returns nothing. The flag is a build-time literal, so the branch below
 * folds away and the X and LINE addresses never reach the file.
 *
 * Three routes, because none of them works everywhere: a phone has a share
 * sheet, a desktop browser has a clipboard, and a browser that refuses both
 * (no permission, no secure context) still has a box the player can select
 * from by hand. The text is never posted by the game - every route ends with
 * the player deciding.
 */
declare const __MONSTERFUSION_SHARE__: boolean | undefined;
const SHARING = typeof __MONSTERFUSION_SHARE__ === "boolean" ? __MONSTERFUSION_SHARE__ : true;

export function ShareStreak({ run, label = "この記録を共有" }: { run: RunRecord; label?: string }) {
  if (!SHARING) return null;
  return <Sharing run={run} label={label} />;
}

function Sharing({ run, label }: { run: RunRecord; label: string }) {
  const share = streakShare(run, siteUrl());
  const [said, setSaid] = useState("");
  const [fallback, setFallback] = useState(false);
  // Decided here, so no caller can forget it.
  const offer = worthSharing(run);
  async function hand() {
    playUiSound();
    const sheet = navigator.share;
    if (sheet) {
      try {
        await sheet.call(navigator, { title: share.title, text: share.text, url: share.url });
        setSaid("共有しました。");
        return;
      } catch {
        // Cancelled, or refused by the browser. Fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(share.full);
      setSaid("コピーしました。貼り付けて投稿できます。");
      return;
    } catch {
      setFallback(true);
      setSaid("コピーできませんでした。下の文を選んでコピーしてください。");
    }
  }
  if (!offer) return null;
  return <div className="share-streak">
    <p className="share-lead">{label}</p>
    <div className="share-buttons">
      {/* Named destinations first. "共有" is an abstraction; "Xでポスト" is
          a place, and a player who wants to post should not have to guess
          that the copy button is how they get there. Both open a compose
          window with the text already in it - nothing is sent by the game. */}
      <a className="share-post is-x" href={postIntentUrl(share)} target="_blank" rel="noopener noreferrer"
        onClick={() => playUiSound()}><b aria-hidden="true">X</b>Xでポスト</a>
      <a className="share-post is-line" href={lineShareUrl(share)} target="_blank" rel="noopener noreferrer"
        onClick={() => playUiSound()}><b aria-hidden="true">L</b>LINEで送る</a>
      <button type="button" className="share-copy" onClick={() => void hand()}>↗ ほかの方法で共有</button>
    </div>
    <p className="share-said" role="status">{said}</p>
    {fallback && <textarea className="share-text" readOnly rows={4} value={share.full}
      onFocus={event => event.currentTarget.select()} aria-label="共有する文" />}
  </div>;
}
