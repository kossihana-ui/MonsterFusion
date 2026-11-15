/**
 * The two rooms that are not for players.
 *
 * 技の編集室 and 音の試聴室 are tools for whoever is building this game: one
 * writes a change list for the moves, the other plays every sound file on its
 * own. A player who wanders into either finds no game there, so the doors are
 * not drawn in the sidebar at all.
 *
 * Not a secret, and deliberately not treated as one - there is nothing behind
 * them worth locking, and a password would only be a lie about what this is.
 * It is an address nobody arrives at by accident: open the site with
 * `?workshop=on` once and the doors appear, `?workshop=off` and they are gone.
 * The answer is remembered per browser, so the address is typed once rather
 * than carried around on every link.
 *
 * Pure on purpose: the deciding is the part worth checking, and a check script
 * can read it without a browser.
 */
export const WORKSHOP_KEY = 'monsterfusion.workshop';

/** What an address asks for, if it asks at all. */
export function workshopAsk(url: string): boolean | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Either place: a query is what you type, a hash is what survives a link
  // to a single-page site that has no server to answer the query.
  const asked = parsed.searchParams.get('workshop')
    ?? (parsed.hash.startsWith('#workshop') ? (parsed.hash.split('=')[1] ?? 'on') : null);
  if (asked === null) return null;
  return asked === 'on' || asked === '1' || asked === 'true';
}

/** Whether the doors are drawn, given the address and what was remembered. */
export function workshopOpen(url: string, remembered: string | null): boolean {
  const asked = workshopAsk(url);
  if (asked !== null) return asked;
  return remembered === 'on';
}

/**
 * The same, for a browser: reads the address, remembers the answer so the
 * next visit needs no address, and survives a browser that refuses storage.
 */
export function workshopHere(): boolean {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(WORKSHOP_KEY);
  } catch {
    // Private window, or storage turned off. The address still works.
  }
  const open = workshopOpen(location.href, remembered);
  if (workshopAsk(location.href) !== null) {
    try {
      localStorage.setItem(WORKSHOP_KEY, open ? 'on' : 'off');
    } catch {
      // Then it lasts for this page only, which is enough to get in.
    }
  }
  return open;
}
