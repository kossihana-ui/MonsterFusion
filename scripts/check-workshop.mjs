// The two builder's rooms stay shut unless somebody asks for them by address.
//
// Getting this wrong in either direction is bad: a player who finds 技の編集室
// finds no game in it, and a developer locked out of 音の試聴室 cannot hear
// the sound files. So both directions are checked here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { workshopAsk, workshopOpen, WORKSHOP_KEY } = await server.ssrLoadModule('/src/shared/workshop.ts');
  const site = 'https://kossihana-ui.github.io/MonsterFusion/';

  // A plain visit - the overwhelming majority - asks for nothing.
  assert.equal(workshopAsk(site), null);
  assert.equal(workshopOpen(site, null), false, 'a first visit sees no builder rooms');
  assert.equal(workshopOpen(`${site}#battle`, null), false, 'nor does any ordinary hash');
  assert.equal(workshopOpen('not a url', null), false, 'and a broken address opens nothing');

  // Asked for, in either place.
  assert.equal(workshopOpen(`${site}?workshop=on`, null), true);
  assert.equal(workshopOpen(`${site}#workshop`, null), true);
  assert.equal(workshopOpen(`${site}?workshop=1`, null), true);

  // Remembered, so the address is typed once.
  assert.equal(workshopOpen(site, 'on'), true);
  assert.equal(workshopOpen(site, 'off'), false);

  // And closed again on purpose, which must beat what was remembered.
  assert.equal(workshopOpen(`${site}?workshop=off`, 'on'), false, 'the door can be shut again');
  assert.equal(workshopOpen(`${site}#workshop=off`, 'on'), false);
  assert.ok(WORKSHOP_KEY.startsWith('monsterfusion.'), 'stored under this game, not loose');

  // The rooms are hidden by the one rule, not by being deleted: both pages
  // are still wired up, and both doors are still marked.
  const app = readFileSync('src/App.tsx', 'utf8');
  for (const room of ['sound', 'moves']) {
    assert.ok(
      new RegExp(`id: "${room}"[^}]*workshop: true`).test(app),
      `the ${room} room is marked as a builder's room`,
    );
    assert.ok(
      app.includes(`{page === "${room}" && workshop &&`),
      `and is guarded, not merely undrawn, for ${room}`,
    );
  }
  assert.ok(app.includes('{doors.map('), 'the sidebar draws the filtered list');
  assert.ok(!app.includes('{tabs.map('), 'and nothing draws the unfiltered one');

  console.log('工房の扉 OK');
} finally {
  await server.close();
}
