/**
 * The only thing in this game that outlives a run.
 *
 * Everything else is thrown away on reload, deliberately for now. A streak
 * is different: it is the thing the player is trying to beat, and a record
 * that forgets itself is not a record. It lives in localStorage, which is
 * per-browser and per-device, and is written so that every read survives
 * the storage being unavailable, full, or holding something from a future
 * version of this file.
 *
 * This is also the shape a world ranking would submit. Keep it serialisable
 * and keep `runs` append-only, and the day there is a server the payload is
 * already here.
 */

const KEY = 'monsterfusion.record.v1';

export interface RunRecord {
  /** Fights won before the run ended. */
  readonly wins: number;
  /** The monster that got that far. */
  readonly monster: string;
  /** How it ended, because a retirement is not a defeat. */
  readonly ending: 'retired' | 'defeated' | 'cleared';
  /** Epoch ms, so a later ranking can order and window them. */
  readonly at: number;
}

export interface PlayerRecord {
  readonly name: string;
  readonly best: RunRecord | null;
  /** Most recent first, kept short. */
  readonly runs: readonly RunRecord[];
}

const EMPTY: PlayerRecord = { name: '', best: null, runs: [] };
const HISTORY_LIMIT = 20;

function read(): PlayerRecord {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<PlayerRecord>;
    const runs = Array.isArray(parsed.runs) ? parsed.runs.filter(isRun) : [];
    return {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      best: isRun(parsed.best) ? parsed.best : null,
      runs,
    };
  } catch {
    // A corrupt or unavailable store must not stop anybody playing.
    return EMPTY;
  }
}

function isRun(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<RunRecord>;
  return typeof run.wins === 'number' && typeof run.monster === 'string'
    && typeof run.at === 'number'
    && (run.ending === 'retired' || run.ending === 'defeated' || run.ending === 'cleared');
}

function write(next: PlayerRecord): PlayerRecord {
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* play on */ }
  return next;
}

export function getRecord(): PlayerRecord {
  return read();
}

export function getPlayerName(): string {
  return read().name;
}

export function setPlayerName(name: string): PlayerRecord {
  return write({ ...read(), name: name.trim().slice(0, 20) });
}

/**
 * Files a finished run.
 *
 * A retirement counts: walking away with eight wins is eight wins, and a
 * record that only counted deaths would push everyone into throwing their
 * monsters away.
 */
export function recordRun(
  wins: number,
  monster: string,
  ending: RunRecord['ending'],
): { record: PlayerRecord; run: RunRecord; isBest: boolean } {
  const current = read();
  const run: RunRecord = { wins: Math.max(0, Math.floor(wins)), monster, ending, at: Date.now() };
  const isBest = run.wins > (current.best?.wins ?? -1);
  const record = write({
    ...current,
    best: isBest ? run : current.best,
    runs: [run, ...current.runs].slice(0, HISTORY_LIMIT),
  });
  return { record, run, isBest };
}

/** Wipes the record. Only from a control the player pressed on purpose. */
export function clearRecord(): PlayerRecord {
  try { localStorage.removeItem(KEY); } catch { /* nothing to do */ }
  return EMPTY;
}
