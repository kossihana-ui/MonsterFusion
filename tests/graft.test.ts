import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createGameConfig,
  createGraftConfig,
  DEFAULT_ALLELE_POOLS,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GRAFT_CONFIG,
} from '../src/core/config.ts';
import { createRootMonster, fuse } from '../src/core/fusion.ts';
import {
  graftGene,
  graftGeneDetailed,
  graftRandomRecessive,
  graftRandomRecessiveDetailed,
} from '../src/core/graft.ts';
import { withinCaps } from '../src/core/stats.ts';
import type { Allele, GeneLocus, GenePair, Monster } from '../src/shared/types.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

type AnyPair = GenePair<unknown>;

function pairAt(monster: Monster, locus: GeneLocus): AnyPair {
  return (monster.genes as unknown as Record<string, AnyPair>)[locus] as AnyPair;
}

function hiddenAt(monster: Monster, locus: GeneLocus): Allele<unknown> | null {
  return pairAt(monster, locus).hidden;
}

test('a graft changes neither the look, the traits nor the stats', () => {
  const context = testContext(11);
  const monster = createRootMonster(context, { name: 'Host' });
  const grafted = graftRandomRecessive(monster, context, { count: 4, includeNumeric: true });

  assert.deepEqual(grafted.phenotype, monster.phenotype);
  assert.deepEqual(grafted.stats, monster.stats);
  assert.deepEqual(grafted.traits, monster.traits);
  assert.equal(grafted.mutationCount, monster.mutationCount);
  assert.ok(withinCaps(grafted.stats, DEFAULT_GAME_CONFIG.stats, grafted.tier));
});

test('identity is preserved: id, name, generation, tier and parents', () => {
  const context = testContext(12);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const child = fuse(a, b, context);
  const grafted = graftRandomRecessive(child, context, { count: 3 });

  assert.equal(grafted.id, child.id);
  assert.equal(grafted.name, child.name);
  assert.equal(grafted.generation, child.generation);
  assert.equal(grafted.tier, child.tier);
  assert.equal(grafted.parentAId, child.parentAId);
  assert.equal(grafted.parentBId, child.parentBId);
  assert.equal(grafted.createdAt, child.createdAt);
  assert.equal(grafted.schemaVersion, child.schemaVersion);
  assert.deepEqual(grafted.fusionHistory, child.fusionHistory);
});

test('the grafted allele lands in the hidden slot and nowhere else', () => {
  const context = testContext(13);
  const monster = createRootMonster(context);
  const result = graftGeneDetailed(monster, 'crest', 'crown', context);
  const pair = pairAt(result.monster, 'crest');

  assert.equal(pair.hidden?.value, 'crown');
  assert.notEqual(pair.a.value, 'crown');
  assert.notEqual(pair.b.value, 'crown');
  // The active alleles are untouched, which is why the phenotype cannot move.
  assert.deepEqual(pair.a, pairAt(monster, 'crest').a);
  assert.deepEqual(pair.b, pairAt(monster, 'crest').b);
  assert.deepEqual(result.grafts.map((g) => g.locus), ['crest']);
});

test('a grafted allele is recessive: within the configured range and below a and b', () => {
  const [lo, hi] = DEFAULT_GRAFT_CONFIG.dominanceRange;
  for (let seed = 1; seed <= 40; seed++) {
    const context = testContext(seed);
    const monster = createRootMonster(context);
    const grafted = graftRandomRecessiveDetailed(monster, context, {
      count: 14,
      includeNumeric: true,
    });
    assert.equal(grafted.grafts.length, 14);

    for (const graft of grafted.grafts) {
      const pair = pairAt(grafted.monster, graft.locus);
      const hidden = pair.hidden as Allele<unknown>;
      assert.ok(
        hidden.dominance >= lo && hidden.dominance <= hi,
        `${graft.locus}: dominance ${hidden.dominance} outside ${lo}..${hi}`,
      );
      assert.ok(
        hidden.dominance < pair.a.dominance && hidden.dominance < pair.b.dominance,
        `${graft.locus}: dominance ${hidden.dominance} is not recessive to ${pair.a.dominance}/${pair.b.dominance}`,
      );
    }
  }
});

test('the dominance range and the locus count come from the config', () => {
  const config = createGameConfig({
    graft: { dominanceRange: [0.004, 0.006], lociPerGraft: 3, includeNumericLoci: true },
  });
  assert.deepEqual(config.graft, createGraftConfig({
    dominanceRange: [0.004, 0.006],
    lociPerGraft: 3,
    includeNumericLoci: true,
  }));

  const context = testContext(14, config);
  const monster = createRootMonster(context);
  const grafted = graftRandomRecessiveDetailed(monster, context);

  assert.equal(grafted.grafts.length, 3);
  for (const graft of grafted.grafts) {
    assert.ok(graft.dominance >= 0.004 && graft.dominance <= 0.006, String(graft.dominance));
  }
});

test('numeric loci are excluded by default and opt-in by config or option', () => {
  const monster = createRootMonster(testContext(15));

  const byDefault = graftRandomRecessiveDetailed(monster, testContext(15), { count: 14 });
  assert.equal(byDefault.grafts.length, 10);
  for (const graft of byDefault.grafts) {
    assert.ok((CATEGORICAL_LOCI as readonly string[]).includes(graft.locus as string));
  }

  const viaOption = graftRandomRecessiveDetailed(monster, testContext(15), {
    count: 14,
    includeNumeric: true,
  });
  assert.equal(viaOption.grafts.length, 14);

  const viaConfig = createGameConfig({ graft: { includeNumericLoci: true, lociPerGraft: 14 } });
  const fromConfig = graftRandomRecessiveDetailed(monster, testContext(15, viaConfig));
  assert.equal(fromConfig.grafts.length, 14);
});

test('a graft can be aimed at a chosen set of loci', () => {
  const context = testContext(16);
  const monster = createRootMonster(context);
  const grafted = graftRandomRecessiveDetailed(monster, context, {
    count: 2,
    loci: ['horns', 'wings'],
  });

  assert.equal(grafted.grafts.length, 2);
  assert.deepEqual(
    grafted.grafts.map((g) => g.locus).slice().sort(),
    ['horns', 'wings'],
  );
});

test('a numeric graft is clamped into the configured range', () => {
  const context = testContext(17);
  const monster = createRootMonster(context);
  const grafted = graftGene(monster, 'attackTendency', 999, context);
  const hidden = hiddenAt(grafted, 'attackTendency') as Allele<number>;

  assert.equal(hidden.value, DEFAULT_GAME_CONFIG.genetics.numericRange[1]);
});

test('the source monster is never modified', () => {
  const context = testContext(18);
  const monster = createRootMonster(context);
  const before = JSON.stringify(monster);

  const grafted = graftRandomRecessive(monster, context, { count: 14, includeNumeric: true });

  assert.equal(JSON.stringify(monster), before);
  assert.notEqual(grafted, monster);
  assert.notEqual(grafted.genes, monster.genes);
  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    assert.notEqual(pairAt(grafted, locus), pairAt(monster, locus));
  }
});

test('the same seed grafts the same genes', () => {
  const build = (): Monster => {
    const context = testContext(19);
    const monster = createRootMonster(context);
    return graftRandomRecessive(monster, context, { count: 5, includeNumeric: true });
  };
  assert.deepEqual(build().genes, build().genes);
});

test('a graft only consumes the injected rng', () => {
  const context = testContext(20);
  const monster = createRootMonster(context);
  const realRandom = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be reachable from the core');
  };
  try {
    graftRandomRecessive(monster, context, { count: 14, includeNumeric: true });
    graftGene(monster, 'element', 'dark', context);
  } finally {
    Math.random = realRandom;
  }
});

test('a grafted gene is handed down latent and can surface generations later', () => {
  // The body-colour pool holds one value, so no root monster and no mutation
  // can ever produce 'black': any black descendant got it from the graft.
  const config = createGameConfig({
    genetics: { pools: { ...DEFAULT_ALLELE_POOLS, bodyColor: ['red'] } },
  });
  const generations = 8;
  let expressed = 0;
  let carried = 0;

  for (let seed = 1; seed <= 200; seed++) {
    const context = testContext(seed, config);
    const founder = graftGene(createRootMonster(context), 'bodyColor', 'black', context);
    assert.equal(founder.phenotype.bodyColor, 'red');

    let current = founder;
    for (let g = 0; g < generations; g++) {
      current = fuse(current, createRootMonster(context), context);
      if (current.phenotype.bodyColor === 'black') {
        expressed++;
        assert.ok(withinCaps(current.stats, config.stats, current.tier));
        break;
      }
      if (hiddenAt(current, 'bodyColor')?.value === 'black') carried++;
    }
  }

  assert.ok(carried > 0, 'the graft was never carried into a descendant');
  assert.ok(
    expressed > 0,
    `the grafted gene never surfaced in ${generations} generations over 200 lineages`,
  );
});

test('grafting does not breach the stat caps down the lineage', () => {
  const context = testContext(21);
  let current = graftRandomRecessive(createRootMonster(context), context, {
    count: 14,
    includeNumeric: true,
  });

  for (let g = 0; g < 30; g++) {
    const partner = graftRandomRecessive(createRootMonster(context), context, {
      count: 14,
      includeNumeric: true,
    });
    current = fuse(current, partner, context);
    assert.ok(
      withinCaps(current.stats, DEFAULT_GAME_CONFIG.stats, current.tier),
      `generation ${current.generation} breached a cap`,
    );
  }
});

test('a graft of zero loci is a no-op and an unknown locus throws', () => {
  const context = testContext(22);
  const monster = createRootMonster(context);

  assert.equal(graftRandomRecessive(monster, context, { count: 0 }), monster);
  assert.throws(
    () => graftGeneDetailed(monster, 'nope' as GeneLocus, 'x', context),
    /unknown locus/,
  );
  assert.throws(
    () => graftRandomRecessiveDetailed(monster, context, { loci: [] }),
    /no candidate loci/,
  );
});

test('a displaced carrier is reported back, so a UI can show what was overwritten', () => {
  const context = testContext(23);
  const monster = createRootMonster(context);
  const before = hiddenAt(monster, 'jaw');
  const result = graftGeneDetailed(monster, 'jaw', 'maw', context);

  assert.deepEqual(result.grafts[0]?.replaced, before);
  assert.equal(result.grafts[0]?.value, 'maw');
});

test('a grafted monster still serialises and fuses like any other', () => {
  const context = testContext(24);
  const a = graftRandomRecessive(createRootMonster(context), context, { count: 2 });
  const b = createRootMonster(context);
  const child = fuse(a, b, context);

  assert.equal(child.generation, 1);
  assert.equal(child.parentAId, a.id);
  const round = JSON.parse(JSON.stringify(a)) as Monster;
  assert.deepEqual(round.genes, a.genes);
});
