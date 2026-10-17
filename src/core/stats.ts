/**
 * Stats: turning an expressed phenotype into HP / attack / defense / magic /
 * speed, without letting repeated fusion inflate anything.
 *
 * Three independent guards keep the numbers bounded:
 *
 * 1. Tendency genes live in 0..100 and are inherited by blending toward the
 *    parental mean (see genetics.ts), so the *input* cannot drift upward.
 * 2. A soft cap compresses everything above `softCapRatio * statCap`
 *    asymptotically, so the last points cost exponentially more.
 * 3. Hard per-stat caps and a hard total cap are applied last.
 *
 * All functions are pure: same phenotype in, same stats out. No randomness.
 */

import type { MonsterPhenotype, MonsterStats, StatKey } from '../shared/types.ts';
import { NUMERIC_LOCI, STAT_KEYS } from '../shared/types.ts';
import type { StatsConfig } from './config.ts';
import { DEFAULT_STATS_CONFIG } from './config.ts';
import { clamp } from './util.ts';

export interface StatBreakdown {
  readonly base: MonsterStats;
  readonly fromTendencies: MonsterStats;
  readonly fromVisual: MonsterStats;
  readonly fromMutation: MonsterStats;
  /** Before the tier ramp, the soft cap and the hard caps. */
  readonly raw: MonsterStats;
  /** The multiplier the evolution tier applies to `raw`. 1 at tier 0. */
  readonly tierScale: number;
  /** After every cap: the value actually stored on the monster. */
  readonly final: MonsterStats;
  /** True when the hard total cap had to scale the stats down. */
  readonly totalCapApplied: boolean;
}

function zeroStats(): MonsterStats {
  return { hp: 0, attack: 0, defense: 0, magic: 0, speed: 0 };
}

function addInto(target: MonsterStats, delta: Partial<MonsterStats>, scale = 1): void {
  for (const key of STAT_KEYS) {
    const value = delta[key];
    if (value !== undefined) target[key] += value * scale;
  }
}

function sumStats(a: MonsterStats, b: MonsterStats): MonsterStats {
  const out = zeroStats();
  for (const key of STAT_KEYS) out[key] = a[key] + b[key];
  return out;
}

/** hp + attack + defense + magic + speed. */
export function statTotal(stats: MonsterStats): number {
  let total = 0;
  for (const key of STAT_KEYS) total += stats[key];
  return total;
}

/**
 * Asymptotic compression above the soft-cap threshold. The result approaches
 * `cap` but mathematically never reaches it, so the hard clamp below is only a
 * rounding safety net.
 */
function applySoftCap(value: number, cap: number, ratio: number): number {
  const threshold = cap * ratio;
  if (value <= threshold) return value;
  const headroom = cap - threshold;
  if (headroom <= 0) return cap;
  const excess = value - threshold;
  return threshold + headroom * (1 - Math.exp(-excess / headroom));
}

/**
 * The caps that apply at a given evolution tier.
 *
 * Tier 0 is the plain config. Each tier raises every ceiling by
 * `tierCapBonus`, which is what lets an evolved monster's larger body actually
 * show up in its stats instead of being clipped away.
 */
export function statCapsForTier(
  config: StatsConfig = DEFAULT_STATS_CONFIG,
  tier = 0,
): { statCap: MonsterStats; totalCap: number } {
  const scale = 1 + Math.max(0, tier) * config.tierCapBonus;
  const statCap = zeroStats();
  for (const key of STAT_KEYS) statCap[key] = Math.round(config.statCap[key] * scale);
  return { statCap, totalCap: Math.round(config.totalCap * scale) };
}

/** Full, inspectable derivation. `computeStats` is the thin wrapper over this. */
export function computeStatBreakdown(
  phenotype: MonsterPhenotype,
  mutationCount = 0,
  config: StatsConfig = DEFAULT_STATS_CONFIG,
  tier = 0,
): StatBreakdown {
  const caps = statCapsForTier(config, tier);
  const base: MonsterStats = { ...config.base };

  const fromTendencies = zeroStats();
  for (const locus of NUMERIC_LOCI) {
    const weights = config.tendencyWeight[locus];
    const tendency = clamp(phenotype[locus], 0, 100);
    addInto(fromTendencies, weights, tendency);
  }

  const fromVisual = zeroStats();
  for (const [locus, byValue] of Object.entries(config.visual)) {
    if (!byValue) continue;
    const expressed = (phenotype as unknown as Record<string, unknown>)[locus];
    if (typeof expressed !== 'string') continue;
    const modifiers = byValue[expressed];
    if (modifiers) addInto(fromVisual, modifiers);
  }

  const fromMutation = zeroStats();
  const countedMutations = Math.min(mutationCount, config.mutationBonusCap);
  addInto(fromMutation, config.mutationBonus, countedMutations);

  const raw = sumStats(sumStats(base, fromTendencies), sumStats(fromVisual, fromMutation));

  // The evolution ramp. Bounded by maxTier, and still subject to every cap.
  const tierScale = 1 + Math.max(0, tier) * config.tierStatBonus;

  const capped = zeroStats();
  for (const key of STAT_KEYS) {
    const cap = caps.statCap[key];
    const scaled = Math.max(raw[key], 0) * tierScale;
    const soft = applySoftCap(scaled, cap, config.softCapRatio);
    capped[key] = Math.round(clamp(soft, 1, cap));
  }

  let totalCapApplied = false;
  const total = statTotal(capped);
  if (total > caps.totalCap) {
    totalCapApplied = true;
    const scale = caps.totalCap / total;
    for (const key of STAT_KEYS) {
      capped[key] = Math.max(1, Math.floor(capped[key] * scale));
    }
  }

  return {
    base,
    fromTendencies,
    fromVisual,
    fromMutation,
    raw,
    tierScale,
    final: capped,
    totalCapApplied,
  };
}

/** The stats stored on a monster. */
export function computeStats(
  phenotype: MonsterPhenotype,
  mutationCount = 0,
  config: StatsConfig = DEFAULT_STATS_CONFIG,
  tier = 0,
): MonsterStats {
  return computeStatBreakdown(phenotype, mutationCount, config, tier).final;
}

/** True when `stats` respects every cap in `config`. Used by balance tests. */
export function withinCaps(
  stats: MonsterStats,
  config: StatsConfig = DEFAULT_STATS_CONFIG,
  tier = 0,
): boolean {
  const caps = statCapsForTier(config, tier);
  for (const key of STAT_KEYS) {
    if (stats[key] > caps.statCap[key]) return false;
    if (stats[key] < 1) return false;
  }
  return statTotal(stats) <= caps.totalCap;
}

/** The theoretical ceiling, for UI gauges. */
export function maxPossibleStats(
  config: StatsConfig = DEFAULT_STATS_CONFIG,
  tier = 0,
): MonsterStats {
  return statCapsForTier(config, tier).statCap;
}

export function statKeys(): readonly StatKey[] {
  return STAT_KEYS;
}
