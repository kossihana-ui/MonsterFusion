# MonsterFusion — Core (game logic)

UI-independent TypeScript game logic. No DOM, no network, no ambient clock, no
`Math.random` in any code path that matters. The UI lives on another branch and
consumes this package through `src/core/index.ts` only.

```
src/shared/types.ts   shared contract between core and UI
src/core/random.ts    Random interface + seeded mulberry32
src/core/config.ts    every probability and coefficient (no hard-coded numbers elsewhere)
src/core/genetics.ts  dominance, recessives, hidden genes, atavism, mutation, blending
src/core/stats.ts     phenotype -> HP/attack/defense/magic/speed, with caps
src/core/fusion.ts    monster creation and unlimited-generation fusion
src/core/battle.ts    turn-based battle, 1v1 today, N-vs-N already supported
src/core/analyzer.ts  MonsterAnalyzer interface + offline LocalMockMonsterAnalyzer
src/core/storage.ts   schemaVersion, serialise/validate/migrate
tests/                node:test suites
```

## Commands

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run check       # both
```

## Quick start for the UI

```ts
import {
  createRootMonster,
  fuse,
  canFuse,
  simulateDuel,
  createSeededRandom,
  createGameConfig,
  serializeSaveFile,
  deserializeSaveFile,
  LocalMockMonsterAnalyzer,
  createMonsterFromAnalysis,
} from '../core/index.ts';

// One context per game session. Swap `rng` for a seeded one to replay exactly.
const context = { rng: createSeededRandom(12345) };

const a = createRootMonster(context, { name: 'Alpha' });
const b = createRootMonster(context, { name: 'Beta' });

const check = canFuse(a, b);            // validate before fusing
const child = fuse(a, b, context);      // child.generation === 1
const grandchild = fuse(child, a, context); // generation 2, and so on, unlimited

const result = simulateDuel(child, b, createSeededRandom(7));
// result.outcome -> { status: 'win', winningSide: 0 | 1 } | { status: 'draw' }
// result.log     -> BattleLogEntry[] ready to render

const json = serializeSaveFile([a, b, child, grandchild]);
const loaded = deserializeSaveFile(json); // { ok: true, value } | { ok: false, errors }
```

Tuning anything is a config override, never an edit to the logic:

```ts
const config = createGameConfig({
  genetics: { mutationRate: 0.2, atavismRate: 0.3 },
  stats: { totalCap: 600 },
  battle: { criticalChance: 0.1 },
});
const monster = createRootMonster({ rng: createSeededRandom(1), config });
```

Image analysis works offline and has no API key anywhere:

```ts
const analyzer = new LocalMockMonsterAnalyzer();
const analysis = await analyzer.analyze({ data: dataUrl, mimeType: 'image/png' });
const monster = createMonsterFromAnalysis(analysis, context);
```

Swap in a hosted model later with `RemoteMonsterAnalyzer(handler)`, where the
caller builds `handler` with credentials from its own environment or a
server-side proxy. Any failure falls back to the local mock, so monster
creation never depends on the API being up.

## Design guarantees (all covered by tests)

- **Unlimited generations at constant size.** A monster stores parent *ids*, a
  generation number, its own genes, and a fusion history capped at
  `config.fusion.historyLimit`. 150 generations stay within a small factor of
  generation 1 in serialised bytes.
- **No cycles.** A child always gets a fresh id and `generation = max(parents) + 1`,
  so ancestry is a DAG by construction. Nothing holds a parent object reference.
- **No stat inflation.** Tendency genes live in 0..100 and are inherited by
  blending toward the parental mean; a soft cap compresses the top quarter
  asymptotically; hard per-stat and total caps apply last.
- **Reproducible.** Every stochastic path takes an injected `Random`. Same seed,
  same monster, same battle, log line for log line.
- **Pure.** Genetics, stats, fusion and damage are pure functions of their
  inputs plus the injected `Random`; `stepTurn` returns a new state and never
  mutates the one it was handed.
