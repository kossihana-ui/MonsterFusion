// Stages the share card so it can be rendered and captured at 1200x630.
//
// The card is HTML rather than a drawn image on purpose: it uses the game's
// own palette, fonts and starter art, so the thing people see in a timeline
// and the thing they land on look like the same game. Capturing it needs a
// browser, which is the one step this script cannot do for you.
//
//   node scripts/build-og-card.mjs
//   open http://127.0.0.1:5187/og-card.html at 1200x630 and screenshot it
//   save the capture as public/og.png, then run with --clean
import { copyFile, rm, access } from 'node:fs/promises';

const staged = [
  ['scripts/og-card.html', 'dist/og-card.html'],
  ['src/mocks/assets/starters/moss-v2-64.png', 'dist/moss-v2-64.png'],
  ['src/mocks/assets/starters/ignis-v2-64.png', 'dist/ignis-v2-64.png'],
  ['src/mocks/assets/starters/aqua-v2-64.png', 'dist/aqua-v2-64.png'],
];

if (process.argv.includes('--clean')) {
  for (const [, to] of staged) await rm(to, { force: true });
  console.log('Removed the staged card from dist/.');
} else {
  await access('dist').catch(() => {
    throw new Error('dist/ is missing - run `npm run build` first.');
  });
  for (const [from, to] of staged) await copyFile(from, to);
  console.log('Staged. Now:');
  console.log('  1. open http://127.0.0.1:5187/og-card.html with a 1200x630 viewport');
  console.log('  2. screenshot it and save as public/og.png');
  console.log('  3. node scripts/build-og-card.mjs --clean');
}
