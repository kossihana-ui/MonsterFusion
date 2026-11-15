import { useState } from "react";
import type { RunRecord } from "../shared/record";
import { postIntentUrl, siteUrl, streakShare, worthSharing } from "../shared/share";
import { playUiSound } from "./uiSound";
import "../styles/share.css";

/**
 * The one way a run leaves this browser.
 *
 * Three routes, because none of them works everywhere: a phone has a share
 * sheet, a desktop browser has a clipboard, and a browser that refuses both
 * (no permission, no secure context) still has a box the player can select
 * from by hand. The text is never posted by the game - every route ends with
 * the player deciding.
 */
export function ShareStreak({ run, label = "この記録を共有" }: { run: RunRecord; label?: string }) {
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
    <div className="share-buttons">
      <button type="button" onClick={() => void hand()}>↗ {label}</button>
      <a className="share-post" href={postIntentUrl(share)} target="_blank" rel="noopener noreferrer"
        onClick={() => playUiSound()}>Xに投稿</a>
    </div>
    <p className="share-said" role="status">{said}</p>
    {fallback && <textarea className="share-text" readOnly rows={4} value={share.full}
      onFocus={event => event.currentTarget.select()} aria-label="共有する文" />}
  </div>;
}
