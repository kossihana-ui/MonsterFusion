// The share text, for every kind of run that can produce one.
//
// A shared streak is an invitation: whoever reads it should be able to go and
// try the same thing. So the ladder has to be named, the weekly one has to
// say that the week is what makes it comparable, and a practice run must
// never read as a record.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const core = await server.ssrLoadModule('@core/core/index.ts');
  const { streakShare, postIntentUrl, siteUrl, worthSharing, PUBLISHED_URL } = await server.ssrLoadModule('/src/shared/share.ts');

  // Outside a browser there is no address to read, so the published one
  // stands in - as it does on a local copy, where a localhost link would
  // make the whole message useless to whoever receives it.
  assert.equal(siteUrl(), PUBLISHED_URL);
  assert.ok(PUBLISHED_URL.endsWith('/'), 'the address ends at the site root');

  const url = 'https://kossihana-ui.github.io/MonsterFusion/';
  const weekly = core.weeklySeason();
  const allTime = core.allTimeSeason();
  const practice = core.practiceSeason();
  const run = (season, extra = {}) => ({
    wins: 12, monster: 'モス', ending: 'defeated', at: Date.now(),
    season: season.id, seasonLabel: season.label, ...extra,
  });

  const week = streakShare(run(weekly), url);
  assert.ok(week.title.includes('12連勝'), week.title);
  assert.ok(week.title.includes('モス'), 'the monster that got there is named');
  assert.ok(week.title.includes(weekly.label), 'the ladder is named, with its week');
  assert.ok(/\d{4}-W\d{2}/.test(week.title), `the week itself is in the text: ${week.title}`);
  assert.ok(week.text.includes('同じ週'), 'and says why that week matters');
  assert.equal(week.url, url);
  assert.ok(week.full.endsWith(url), 'the address is the last thing in the text');

  const all = streakShare(run(allTime), url);
  assert.ok(all.title.includes(allTime.label));
  assert.ok(all.text.includes('いつ挑んでも'), all.text);
  assert.ok(!all.text.includes('同じ週'), 'the all-time ladder has no week');

  // The one that must not read as a boast.
  const trial = streakShare(run(practice, { practice: true }), url);
  assert.ok(trial.text.includes('練習'), trial.text);
  assert.ok(trial.text.includes('順位には入りません'), 'and says so plainly');

  const retired = streakShare(run(weekly, { ending: 'retired' }), url);
  assert.ok(retired.title.includes('リタイア'), retired.title);
  const cleared = streakShare(run(weekly, { ending: 'cleared', wins: 100 }), url);
  assert.ok(cleared.title.includes('制覇'), cleared.title);
  assert.ok(!cleared.title.includes('リタイア'));

  // A run filed before seasons existed still shares.
  const old = streakShare({ wins: 3, monster: 'アクア', ending: 'defeated', at: 0 }, url);
  assert.ok(old.title.includes('3連勝'), old.title);
  assert.ok(old.text.length > 10, 'and still carries an invitation');

  // Nothing to boast about, nothing offered.
  assert.equal(worthSharing(run(weekly, { wins: 0 })), false, 'a run that won nothing is not offered');
  assert.equal(worthSharing(run(weekly)), true);
  assert.equal(worthSharing(run(practice, { practice: true })), true, 'a practice streak still counts as something done');
  assert.equal(worthSharing(run(weekly, { wins: 0, ending: 'cleared' })), true, 'except a clear, which is never nothing');

  const intent = new URL(postIntentUrl(week));
  assert.equal(intent.host, 'x.com');
  assert.equal(intent.searchParams.get('url'), url);
  assert.equal(intent.searchParams.get('text'), week.text, 'posted as written, nothing added');

  console.log('共有ボタン OK');
  console.log(week.full);
} finally {
  await server.close();
}
