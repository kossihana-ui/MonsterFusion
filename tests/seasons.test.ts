import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  allTimeSeason,
  freeSeason,
  isoWeek,
  seasonIsOpen,
  seasons,
  rankedSeasons,
  weeklySeason,
  weekEndsAt,
} from '../src/core/seasons.ts';
import { createArenaEnemy } from '../src/core/arena.ts';
import { createRootMonster } from '../src/core/fusion.ts';
import { testContext } from './helpers.ts';

const at = (iso: string) => Date.parse(iso);

test('a week is the same week everywhere on earth', () => {
  // Monday morning in Tokyo is still Sunday in New York; both are told the
  // same week, because a world ranking cannot run two ladders at once.
  const mondayTokyo = at('2026-11-16T00:30:00+09:00');
  const sundayNewYork = at('2026-11-15T10:30:00-05:00');
  assert.equal(mondayTokyo, sundayNewYork, 'one instant, Monday in Tokyo and Sunday in New York');
  assert.deepEqual(isoWeek(mondayTokyo), isoWeek(sundayNewYork));
  assert.equal(
    weeklySeason(mondayTokyo).id, weeklySeason(sundayNewYork).id,
    'so both players get the same ladder',
  );

  // Two instants inside one UTC week share an id; one across the boundary does not.
  const tuesday = at('2026-11-17T12:00:00Z');
  const thursday = at('2026-11-19T23:00:00Z');
  const nextMonday = at('2026-11-23T00:30:00Z');
  assert.equal(weeklySeason(tuesday).id, weeklySeason(thursday).id);
  assert.notEqual(weeklySeason(thursday).id, weeklySeason(nextMonday).id);
});

test('the week rolls over on Monday at midnight UTC', () => {
  const wednesday = at('2026-11-18T09:00:00Z');
  const ends = weekEndsAt(wednesday);
  const endDate = new Date(ends);
  assert.equal(endDate.getUTCDay(), 1, 'a Monday');
  assert.equal(endDate.getUTCHours(), 0);
  assert.ok(ends > wednesday);
  assert.equal(weeklySeason(wednesday).endsAt, ends);
  assert.equal(seasonIsOpen(weeklySeason(wednesday), wednesday), true);
  assert.equal(seasonIsOpen(weeklySeason(wednesday), ends), false, 'closed the moment it turns');
  assert.equal(weeklySeason(ends).id, weeklySeason(ends + 1000).id, 'and the next one has begun');
});

test('the all-time ladder never moves', () => {
  const season = allTimeSeason();
  assert.equal(season.id, allTimeSeason().id);
  assert.equal(season.endsAt, undefined);
  assert.equal(seasonIsOpen(season, at('2099-01-01T00:00:00Z')), true);
  assert.notEqual(season.id, weeklySeason().id);
});

test('two players on one season meet the same opponents in the same order', () => {
  const season = weeklySeason(at('2026-11-18T09:00:00Z'));
  const alice = createRootMonster(testContext(1), { name: 'Alice' });
  const bob = createRootMonster(testContext(2), { name: 'Bob' });

  for (const index of [0, 3, 5, 20]) {
    const hers = createArenaEnemy(season.id, index, alice, testContext(11));
    const his = createArenaEnemy(season.id, index, bob, testContext(22));
    assert.equal(hers.enemy.name, his.enemy.name, `fight ${index + 1} differed`);
    assert.equal(hers.enemy.phenotype.bodyShape, his.enemy.phenotype.bodyShape);
    assert.equal(hers.enemy.phenotype.element, his.enemy.phenotype.element);
    assert.equal(hers.isBoss, his.isBoss);
  }

  // And a different season is a different ladder.
  const other = allTimeSeason();
  const sameFight = createArenaEnemy(other.id, 0, alice, testContext(11));
  assert.notEqual(sameFight.enemy.name, createArenaEnemy(season.id, 0, alice, testContext(11)).enemy.name);
});

test('a free run is nobody else\u2019s ladder', () => {
  assert.notEqual(freeSeason('a').id, freeSeason('b').id);
  assert.equal(freeSeason('a').kind, 'free');
  assert.equal(seasonIsOpen(freeSeason('a')), true);
});

test('the gate is offered practice first, then the two ranked ladders', () => {
  const list = seasons(at('2026-11-18T09:00:00Z'));
  assert.deepEqual(list.map((s) => s.kind), ['practice', 'weekly', 'allTime']);
  assert.deepEqual(
    rankedSeasons(at('2026-11-18T09:00:00Z')).map((s) => s.kind),
    ['weekly', 'allTime'],
    'practice is not something a streak can be ranked on',
  );
  for (const season of list) {
    assert.ok(season.label.length > 0, 'a season needs a name to show');
    assert.ok(season.detail.length > 0);
    assert.ok(season.id.startsWith('season-'), `${season.id} is not a season id`);
  }
});
