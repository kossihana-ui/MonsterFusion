/**
 * The seeds everybody shares.
 *
 * An arena run takes its id and every roll that follows from it - which
 * opponents appear, in what order, wearing what, and what they drop. Give
 * two players the same id and they walk the same ladder. That is the whole
 * mechanism; a season is just an agreed id.
 *
 * Two of them, by the player's request of 2026-11-14:
 *
 *   - 今週のチャンピオン, which rolls over every Monday. A fresh ladder a
 *     week, and a reason to come back on Monday.
 *   - 総合チャンピオン, which never changes. The permanent one, for a table
 *     that is about the best run anyone has ever had rather than this week's.
 *
 * Weeks are counted in UTC on purpose. A world ranking cannot have Japan
 * and Brazil on different ladders on the same day.
 *
 * One honest caveat, worth knowing before a leaderboard is built on this:
 * a shared id makes the ladder's SHAPE identical - the same opponents in
 * the same order with the same drops - but an opponent's strength is still
 * built as a share of whoever entered, so two players do not face the same
 * difficulty. Until that scaling is absolute, a season is a shared course
 * and not yet a fair race. See docs/COMPETITION_AND_DEPTH.md.
 */

export type SeasonKind = 'weekly' | 'allTime' | 'free';

export interface ArenaSeason {
  readonly kind: SeasonKind;
  /** The arena run id. Everyone on this season uses it. */
  readonly id: string;
  /** Japanese, shown as-is. */
  readonly label: string;
  readonly detail: string;
  /** When this season stops accepting runs. Absent when it never does. */
  readonly endsAt?: number;
}

const DAY = 86_400_000;

/** ISO-8601 week, in UTC, so the whole world turns the page together. */
export function isoWeek(at: number | Date = Date.now()): { year: number; week: number } {
  const date = new Date(at);
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Sunday is 7, not 0
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday that names the week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / DAY + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/** Midnight UTC on the Monday after the week containing `at`. */
export function weekEndsAt(at: number | Date = Date.now()): number {
  const date = new Date(at);
  const d = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = new Date(d).getUTCDay() || 7;
  return d + (8 - day) * DAY;
}

/** This week's ladder. Changes every Monday, the same one for everybody. */
export function weeklySeason(at: number | Date = Date.now()): ArenaSeason {
  const { year, week } = isoWeek(at);
  const tag = `${year}-W${String(week).padStart(2, '0')}`;
  return {
    kind: 'weekly',
    id: `season-week-${tag}`,
    label: `今週のチャンピオン（${tag}）`,
    detail: '今週は世界中が同じ敵・同じ順番で戦います。いちばん長く勝ち抜いた人が今週のチャンピオンです。月曜に敵が入れ替わり、記録は週ごとに分かれます。',
    endsAt: weekEndsAt(at),
  };
}

/** The permanent ladder. Never changes, so a record can stand for good. */
export function allTimeSeason(): ArenaSeason {
  return {
    kind: 'allTime',
    id: 'season-all-time',
    label: '総合チャンピオン',
    detail: 'いつ挑んでも敵の順番が変わらないラダーです。条件が同じなので、歴代でいちばん長い連勝を競えます。何度でも挑戦できます。',
  };
}

/**
 * A ladder of one's own.
 *
 * Not for comparing - the id is whatever the caller passes - but a player
 * who just wants to try a monster out should not have to burn a season run
 * to do it.
 */
export function freeSeason(id: string): ArenaSeason {
  return {
    kind: 'free',
    id: `free-${id}`,
    label: '腕試し（順位なし）',
    detail: '毎回ちがう敵の順番になります。記録は手元に残りますが、チャンピオンの順位には加わりません。',
  };
}

/** The seasons on offer right now, in the order a screen should show them. */
export function seasons(at: number | Date = Date.now()): readonly ArenaSeason[] {
  return [weeklySeason(at), allTimeSeason()];
}

/** Whether a run on this season still counts. Free runs never expire. */
export function seasonIsOpen(season: ArenaSeason, at: number = Date.now()): boolean {
  return season.endsAt === undefined || at < season.endsAt;
}
