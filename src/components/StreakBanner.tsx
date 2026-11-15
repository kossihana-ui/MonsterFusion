import { useEffect, useState } from "react";
import "../styles/streak-banner.css";

/**
 * The number this whole game is scored on, finally saying something.
 *
 * 「評価は何連勝できたかだけ」 is the rule, and until now that number lived in
 * a header line as "· 3勝" and changed without comment. The one thing the
 * player is playing for never announced itself, which is a large part of why
 * twenty fights felt like one fight.
 *
 * So it counts up, out loud, and the moments that are actually different are
 * drawn differently: a round number, the fight before the boss, and - the
 * only one that really matters - beating your own record, said at the moment
 * it happens rather than at the end of the run.
 */
export interface StreakMoment {
  /** Wins after this fight. */
  readonly wins: number;
  /** The best this player had before this run reached it, if any. */
  readonly previousBest: number | null;
  /** True when the next fight is the first boss. */
  readonly bossNext: boolean;
  /** True when this run does not count towards a record. */
  readonly practice: boolean;
}

/** The round numbers worth stopping on. Sparse on purpose. */
const MILESTONES = [5, 10, 25, 50, 75, 99];

export function StreakBanner({ moment }: { moment: StreakMoment }) {
  const { wins, previousBest, bossNext, practice } = moment;
  // Counts from the streak the player had a moment ago, so the number moving
  // is the thing they watch.
  const [shown, setShown] = useState(Math.max(0, wins - 1));

  useEffect(() => {
    setShown(Math.max(0, wins - 1));
    const timer = window.setTimeout(() => setShown(wins), 420);
    return () => window.clearTimeout(timer);
  }, [wins]);

  const record = !practice && previousBest !== null && wins > previousBest;
  const first = !practice && previousBest === null && wins > 0;
  const milestone = MILESTONES.includes(wins);
  const tone = record || first ? "record" : milestone ? "milestone" : "plain";

  return (
    <div className={`streak-banner tone-${tone}`} data-wins={wins}>
      <p className="streak-count" aria-hidden="true">
        <strong key={shown} className="streak-number">{shown}</strong>
        <span className="streak-unit">連勝</span>
      </p>
      {/* The spoken version, so a screen reader hears the result rather than
          a number mid-animation. */}
      <p className="sr-only" role="status">{wins}連勝</p>

      {record && <p className="streak-headline">自己ベスト更新！<small>これまでの記録は{previousBest}連勝</small></p>}
      {first && <p className="streak-headline">はじめての記録です<small>ここからが自己ベスト</small></p>}
      {!record && !first && milestone && <p className="streak-headline">{wins}連勝</p>}

      {practice && <p className="streak-note">練習なので記録には残りません。</p>}
      {bossNext && <p className="streak-next">次はボスです。</p>}
    </div>
  );
}
