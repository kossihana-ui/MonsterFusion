import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGeneticsConfig } from '../src/core/config.ts';
import {
  allelesAt,
  createRandomGenes,
  deriveTraits,
  expressGenes,
  inheritGenes,
} from '../src/core/genetics.ts';
import { createRootMonster, fuse } from '../src/core/fusion.ts';
import { createSeededRandom } from '../src/core/random.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../src/shared/types.ts';
import { fusionChain, testContext } from './helpers.ts';

test('a random genome fills every locus with three allele slots', () => {
  const genes = createRandomGenes(createSeededRandom(1));
  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    const pair = (genes as unknown as Record<string, { a: unknown; b: unknown; hidden: unknown }>)[locus];
    assert.ok(pair, `${locus} missing`);
    assert.ok(pair.a, `${locus}.a missing`);
    assert.ok(pair.b, `${locus}.b missing`);
    assert.ok(pair.hidden, `${locus}.hidden missing`);
  }
});

test('the dominant allele is the one expressed', () => {
  const genes = createRandomGenes(createSeededRandom(4));
  genes.bodyColor = {
    a: { value: 'red', dominance: 0.9 },
    b: { value: 'blue', dominance: 0.1 },
    hidden: null,
  };
  const phenotype = expressGenes(genes, createSeededRandom(1));
  assert.equal(phenotype.bodyColor, 'red');
});

test('near-equal dominance mixes the parents\' features', () => {
  const genes = createRandomGenes(createSeededRandom(4));
  genes.attackTendency = {
    a: { value: 20, dominance: 0.5 },
    b: { value: 80, dominance: 0.5 },
    hidden: null,
  };
  const phenotype = expressGenes(genes, createSeededRandom(1));
  assert.equal(phenotype.attackTendency, 50, 'co-dominant numeric loci average');
});

test('a recessive allele survives inheritance instead of being discarded', () => {
  const config = createGeneticsConfig({ mutationRate: 0, atavismRate: 0 });
  const rng = createSeededRandom(31);
  const parentA = createRandomGenes(rng, config);
  const parentB = createRandomGenes(rng, config);

  parentA.bodyColor = {
    a: { value: 'red', dominance: 0.9 },
    b: { value: 'black', dominance: 0.1 },
    hidden: { value: 'black', dominance: 0.1 },
  };
  parentB.bodyColor = {
    a: { value: 'red', dominance: 0.9 },
    b: { value: 'black', dominance: 0.1 },
    hidden: { value: 'black', dominance: 0.1 },
  };

  let carriedSomewhere = 0;
  let expressedSomewhere = 0;
  for (let i = 0; i < 200; i++) {
    const childRng = createSeededRandom(1000 + i);
    const child = inheritGenes(parentA, parentB, childRng, config);
    const pool = allelesAt(child.genes, 'bodyColor');
    if (pool.includes('black')) carriedSomewhere++;
    const phenotype = expressGenes(child.genes, createSeededRandom(i), config);
    if (phenotype.bodyColor === 'black') expressedSomewhere++;
  }

  assert.ok(carriedSomewhere > 150, `recessive carried in only ${carriedSomewhere}/200 children`);
  assert.ok(expressedSomewhere > 0, 'a recessive homozygote should appear sometimes');
  assert.ok(expressedSomewhere < 200, 'the dominant allele should usually win');
});

test('atavism lets a hidden allele resurface', () => {
  const config = createGeneticsConfig({ mutationRate: 0, atavismRate: 1 });
  const rng = createSeededRandom(5);
  const parentA = createRandomGenes(rng, config);
  const parentB = createRandomGenes(rng, config);

  parentA.element = {
    a: { value: 'fire', dominance: 0.9 },
    b: { value: 'fire', dominance: 0.9 },
    hidden: { value: 'dark', dominance: 0.9 },
  };
  parentB.element = {
    a: { value: 'water', dominance: 0.9 },
    b: { value: 'water', dominance: 0.9 },
    hidden: { value: 'dark', dominance: 0.9 },
  };

  const child = inheritGenes(parentA, parentB, createSeededRandom(9), config);
  assert.deepEqual(allelesAt(child.genes, 'element').slice(0, 2), ['dark', 'dark']);
  assert.ok(child.atavismLoci.includes('element'));
});

test('a zero atavism rate never passes the hidden allele', () => {
  const config = createGeneticsConfig({ mutationRate: 0, atavismRate: 0 });
  const rng = createSeededRandom(6);
  const parentA = createRandomGenes(rng, config);
  const parentB = createRandomGenes(rng, config);
  for (let i = 0; i < 50; i++) {
    const child = inheritGenes(parentA, parentB, createSeededRandom(i), config);
    assert.equal(child.atavismLoci.length, 0);
  }
});

test('the mutation rate is configurable', () => {
  const rng = createSeededRandom(17);
  const parentA = createRandomGenes(rng);
  const parentB = createRandomGenes(rng);

  const countMutations = (mutationRate: number): number => {
    const config = createGeneticsConfig({ mutationRate });
    let total = 0;
    for (let i = 0; i < 120; i++) {
      total += inheritGenes(parentA, parentB, createSeededRandom(i), config).mutationCount;
    }
    return total;
  };

  assert.equal(countMutations(0), 0, 'rate 0 must never mutate');

  const low = countMutations(0.05);
  const high = countMutations(0.9);
  assert.ok(low > 0, 'a 5% rate should mutate occasionally');
  assert.ok(high > low * 3, `rate 0.9 (${high}) should far exceed rate 0.05 (${low})`);

  const everyLocus = CATEGORICAL_LOCI.length + NUMERIC_LOCI.length;
  const always = inheritGenes(parentA, parentB, createSeededRandom(1), createGeneticsConfig({ mutationRate: 1 }));
  assert.equal(always.mutationCount, everyLocus, 'rate 1 must mutate every locus');
});

test('numeric tendencies stay inside the configured range over 200 fusions', () => {
  const { chain } = fusionChain(200, 808);
  for (const monster of chain) {
    for (const locus of NUMERIC_LOCI) {
      const value = monster.phenotype[locus];
      assert.ok(value >= 0 && value <= 100, `${locus} drifted to ${value}`);
      for (const allele of allelesAt(monster.genes, locus) as number[]) {
        assert.ok(allele >= 0 && allele <= 100, `${locus} allele drifted to ${allele}`);
      }
    }
  }
});

test('traits are derived, bounded, and never accumulate across generations', () => {
  const { chain } = fusionChain(60, 303);
  for (const monster of chain) {
    assert.ok(monster.traits.length <= 16, `trait list grew to ${monster.traits.length}`);
    assert.equal(new Set(monster.traits).size, monster.traits.length, 'traits must be unique');
  }
});

test('mutant and throwback traits reflect the inheritance result', () => {
  const clean = deriveTraits(
    { ...baseline, wings: 'none', horns: 'none', element: 'neutral' },
    0,
    0,
  );
  assert.ok(!clean.includes('mutant'));
  assert.ok(!clean.includes('throwback'));

  const mutated = deriveTraits(baseline, 4, 2);
  assert.ok(mutated.includes('mutant'));
  assert.ok(mutated.includes('unstable'));
  assert.ok(mutated.includes('throwback'));
});

test('inheritance consumes only the injected rng', () => {
  const context = testContext(55);
  const a = createRootMonster(context);
  const b = createRootMonster(context);
  const first = fuse(a, b, testContext(56));
  const second = fuse(a, b, testContext(56));
  assert.deepEqual(first.genes, second.genes);
});

const baseline = {
  bodyColor: 'red',
  bodyShape: 'muscular',
  size: 'large',
  horns: 'twin',
  wings: 'feathered',
  tail: 'spiked',
  eyes: 'glowing',
  crest: 'mane',
  jaw: 'fangs',
  element: 'fire',
  attackTendency: 80,
  defenseTendency: 40,
  magicTendency: 30,
  speedTendency: 20,
} as const;
