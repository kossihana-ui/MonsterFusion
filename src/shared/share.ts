/**
 * The words a player hands to somebody else.
 *
 * A streak is only worth sharing if the person reading it can go and try the
 * same thing, so the text names the ladder it was run on - the weekly one
 * carries its week, and everybody on that week meets the same opponents in
 * the same order - and it never dresses a practice run up as a record.
 *
 * Pure on purpose: the text is the part worth checking, and a check script
 * can read it without a browser.
 */
import type { RunRecord } from './record';

export interface StreakShare {
  /** The headline, also used as the title a native share sheet shows. */
  readonly title: string;
  /** Title and invitation, without the address. */
  readonly text: string;
  readonly url: string;
  /** Everything, for the clipboard and for a post box. */
  readonly full: string;
}

/** The published address, used when the page is not being served from one. */
export const PUBLISHED_URL = 'https://kossihana-ui.github.io/MonsterFusion/';

/**
 * The address to put in a shared message.
 *
 * Wherever the page is actually served from, so moving the site needs no code
 * change - except from a local copy, where the address nobody else can open
 * would make the whole message useless.
 */
export function siteUrl(): string {
  try {
    const here = new URL(import.meta.env.BASE_URL, location.origin);
    const local = here.protocol === 'file:'
      || /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/.test(here.hostname);
    return local ? PUBLISHED_URL : here.href;
  } catch {
    return PUBLISHED_URL;
  }
}

/**
 * Whether a run is worth handing to anybody.
 *
 * A run that ended on the first fight is zero wins, and "0連勝を共有" invites
 * the player to publish nothing. The button is simply absent there - the
 * answer to a bad result is another run, not a post about it.
 */
export function worthSharing(run: RunRecord): boolean {
  return run.ending === 'cleared' || run.wins > 0;
}

export function streakShare(run: RunRecord, url: string): StreakShare {
  const ladder = run.seasonLabel ?? 'バトルアリーナ';
  const title = run.ending === 'cleared'
    ? `MonsterFusion｜${ladder}を制覇しました（${run.monster}）`
    : `MonsterFusion｜${ladder}で${run.wins}連勝${run.ending === 'retired' ? 'してリタイア' : ''}（${run.monster}）`;
  const invitation = run.practice
    ? '練習ラダーなので順位には入りません。本番は週替わりで、世界中が同じ敵と同じ順番で戦います。'
    : run.season?.startsWith('season-week-')
      ? '同じ週に挑めば、敵も順番も同じです。あなたは何連勝できますか。'
      : 'いつ挑んでも敵の順番は変わりません。あなたは何連勝できますか。';
  const text = `${title}\n${invitation}`;
  return { title, text, url, full: `${text}\n${url}` };
}

/**
 * The compose window on X, filled in but not sent.
 *
 * A link, not a request: the game opens the box with the text already in it
 * and the player presses post, or does not.
 */
export function postIntentUrl(share: StreakShare): string {
  const query = new URLSearchParams({ text: share.text, url: share.url });
  return `https://x.com/intent/post?${query.toString()}`;
}

/**
 * The same, for LINE.
 *
 * Worth its own button here: most of the people this game is written for
 * send things to each other on LINE rather than posting them in public.
 */
export function lineShareUrl(share: StreakShare): string {
  const query = new URLSearchParams({ url: share.url, text: share.text });
  return `https://social-plugins.line.me/lineit/share?${query.toString()}`;
}
