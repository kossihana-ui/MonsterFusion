import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameConfig, createStatsConfig, DEFAULT_STATS_CONFIG } from '../src/core/config.ts';
import { computeStatBreakdown, computeStats, statTotal, withinCaps } from '../src/core/stats.ts';
import { STAT_KEYS } from '../src/shared/types.ts';
import type { MonsterPhenotype } from '../src/shared/types.ts';
import { fusionChain } from './helpers.ts';

const maxedPhenotype: MonsterPhenotype = {
  bodyColor: 'red',
  bodyShape: 'muscular',
  size: 'giant',
  horns: 'crown',
  wings: 'ethereal',
  tail: 'spiked',
  eyes: 'glowing',
  crest: 'mane',
  jaw: 'maw',
  element: 'dark',
  attackTendency: 100,
  defenseTendency: 100,
  magicTendency: 100,
  speedTendency: 100,
};

test('stats are a pure function of the phenotype', () => {
  assert.deepEqual(computeStats(maxedPhenotype, 2), computeStats(maxedPhenotype, 2));
});

test('no stat exceeds its hard cap, even with everything maxed', () => {
  const stats = computeStats(maxedPhenotype, 99);
  for (const key of STAT_KEYS) {
    assert.ok(
      stats[key] <= DEFAULT_STATS_CONFIG.statCap[key],
      `${key} = ${stats[key]} exceeds cap ${DEFAULT_STATS_CONFIG.statCap[key]}`,
    );
    assert.ok(stats[key] >= 1, `${key} must stay positive`);
  }
});

test('the total cap is enforced', () => {
  const stats = computeStats(maxedPhenotype, 99);
  assert.ok(
    statTotal(stats) <= DEFAULT_STATS_CONFIG.totalCap,
    `total ${statTotal(stats)} exceeds ${DEFAULT_STATS_CONFIG.totalCap}`,
  );
  assert.ok(withinCaps(stats));
});

test('the soft cap makes the last points cost more', () => {
  const config = createStatsConfig({
    statCap: { hp: 200, attack: 100, defense: 100, magic: 100, speed: 100 },
    softCapRatio: 0.5,
    totalCap: 10_000,
  });
  const at = (tendency: number) =>
    computeStatBreakdown({ ...maxedPhenotype, attackTendency: tendency }, 0, config);

  const low = at(10);
  const high = at(100);
  const rawGain = high.raw.attack - low.raw.attack;
  const finalGain = high.final.attack - low.final.attack;
  assert.ok(rawGain > 0);
  assert.ok(
    finalGain < rawGain,
    `soft cap did not compress: raw +${rawGain} vs final +${finalGain}`,
  );
});

test('the mutation bonus is capped, so mutations cannot stack forever', () => {
  const atCap = computeStats(maxedPhenotype, DEFAULT_STATS_CONFIG.mutationBonusCap);
  const farBeyond = computeStats(maxedPhenotype, 500);
  assert.deepEqual(atCap, farBeyond);
});

test('stats do not inflate across 200 generations of fusion', () => {
  const config = createGameConfig();
  const { chain } = fusionChain(200, 4242, config);

  for (const monster of chain) {
    assert.ok(
      withinCaps(monster.stats, config.stats),
      `${monster.name} (gen ${monster.generation}) breached a cap: ${JSON.stringify(monster.stats)}`,
    );
  }

  // The average of the last 20 generations must not be meaningfully higher
  // than the average of the first 20: fusion must not be a free power ramp.
  const average = (slice: typeof chain) =>
    slice.reduce((sum, m) => sum + statTotal(m.stats), 0) / slice.length;
  const early = average(chain.slice(1, 21));
  const late = average(chain.slice(-20));
  assert.ok(
    late <= early * 1.25,
    `stat totals inflated from ${early.toFixed(1)} to ${late.toFixed(1)}`,
  );
});

test('caps are configurable', () => {
  const tiny = createStatsConfig({
    statCap: { hp: 50, attack: 10, defense: 10, magic: 10, speed: 10 },
    totalCap: 60,
  });
  const stats = computeStats(maxedPhenotype, 3, tiny);
  assert.ok(withinCaps(stats, tiny));
  assert.ok(statTotal(stats) <= 60);
});

test('the breakdown adds up to the raw total', () => {
  const breakdown = computeStatBreakdown(maxedPhenotype, 2);
  for (const key of STAT_KEYS) {
    const sum =
      breakdown.base[key] +
      breakdown.fromTendencies[key] +
      breakdown.fromVisual[key] +
      breakdown.fromMutation[key];
    assert.equal(breakdown.raw[key], sum, `${key} breakdown mismatch`);
  }
});
