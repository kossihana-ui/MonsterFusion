/**
 * Compares this repository's core sources against a copy of them elsewhere
 * (today: MonsterFusion-UI/src/core and src/shared).
 *
 * The UI keeps its own copy of the core, so the two drift silently the moment
 * either side changes. This script makes that drift loud.
 *
 * Line endings are ignored: the repositories check out with different ones on
 * Windows, and that difference is noise, not drift.
 *
 *   node scripts/check-ui-sync.mjs [path-to-ui-repo]
 *
 * Exits 0 when every file matches, 1 when anything differs, so it can run in a
 * pre-commit hook or CI.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_UI_ROOT = resolve(CORE_ROOT, '..', 'MonsterFusion-UI');

/** Files the UI copies, as `[source, copy]` relative paths. */
const MIRRORED = [
  'src/shared/types.ts',
  'src/core/analyzer.ts',
  'src/core/battle.ts',
  'src/core/config.ts',
  'src/core/fusion.ts',
  'src/core/genetics.ts',
  'src/core/graft.ts',
  'src/core/index.ts',
  'src/core/random.ts',
  'src/core/starters.ts',
  'src/core/stats.ts',
  'src/core/storage.ts',
  'src/core/util.ts',
];

/** Normalises line endings and a trailing newline so only real edits show. */
function normalise(text) {
  return text.replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

async function main() {
  const uiRoot = resolve(process.argv[2] ?? DEFAULT_UI_ROOT);

  if (!existsSync(uiRoot)) {
    console.error(`UI repository not found at ${uiRoot}`);
    console.error('Pass its path: node scripts/check-ui-sync.mjs <path>');
    process.exit(1);
  }

  const missing = [];
  const drifted = [];
  let matched = 0;

  for (const relative of MIRRORED) {
    const source = join(CORE_ROOT, relative);
    const copy = join(uiRoot, relative);

    if (!existsSync(copy)) {
      missing.push(relative);
      continue;
    }

    const [a, b] = await Promise.all([
      readFile(source, 'utf8'),
      readFile(copy, 'utf8'),
    ]);

    if (normalise(a) === normalise(b)) matched++;
    else drifted.push(relative);
  }

  console.log(`core:  ${CORE_ROOT}`);
  console.log(`ui:    ${uiRoot}`);
  console.log('');
  console.log(`in sync:  ${matched}/${MIRRORED.length}`);

  for (const relative of missing) console.log(`missing:  ${relative}`);
  for (const relative of drifted) console.log(`drifted:  ${relative}`);

  if (missing.length === 0 && drifted.length === 0) {
    console.log('\nThe UI copy matches this repository.');
    process.exit(0);
  }

  console.log('\nThe UI copy is out of date. Re-copy the files above, or');
  console.log('switch the UI to importing this repository directly - see');
  console.log('docs/CORE_SYNC.md.');
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
