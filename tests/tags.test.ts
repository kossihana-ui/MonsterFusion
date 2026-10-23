import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameConfig, DEFAULT_GENETICS_CONFIG } from '../src/core/config.ts';
import { fuseDetailed } from '../src/core/fusion.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import {
  describeAppearanceTags,
  describeFusion,
  describeMonster,
  describePhenotype,
  describeTraits,
  dominanceOf,
  labelFor,
  LOCUS_LABELS,
  traitLabel,
  TRAIT_LABELS,
} from '../src/core/tags.ts';
import { CATEGORICAL_LOCI, NUMERIC_LOCI } from '../src/shared/types.ts';
import { DEFAULT_ALLELE_POOLS } from '../src/core/config.ts';
import { testContext } from './helpers.ts';

function starter(index = 0, seed = 1) {
  const monsters = createStarterMonsters(testContext(seed));
  const monster = monsters[index];
  assert.ok(monster);
  return monster;
}

test('every locus and every allele value has a Japanese label', () => {
  for (const locus of [...CATEGORICAL_LOCI, ...NUMERIC_LOCI]) {
    assert.ok(LOCUS_LABELS[locus], `${locus}: no label`);
  }
  for (const locus of CATEGORICAL_LOCI) {
    const pool = DEFAULT_ALLELE_POOLS[locus] as readonly string[];
    for (const value of pool) {
      const label = labelFor(locus, value);
      assert.notEqual(label, value, `${locus}/${value}: still showing the raw value`);
      assert.ok(label.length > 0);
    }
  }
});

test('every trait a monster can carry has a label', () => {
  // The traits deriveTraits can produce, listed so a new one fails here rather
  // than appearing in the UI in English.
  const known = [
    'winged', 'horned', 'tailed-weapon', 'keen-sight', 'crested', 'floral',
    'fanged', 'royal', 'heavyweight', 'lightweight', 'brawler', 'guardian',
    'caster', 'swift', 'mutant', 'unstable', 'throwback',
  ];
  for (const trait of known) {
    assert.ok(TRAIT_LABELS[trait], `${trait}: no label`);
  }
  for (const element of DEFAULT_ALLELE_POOLS.element) {
    assert.ok(TRAIT_LABELS[`element-${element}`], `element-${element}: no label`);
  }
  assert.equal(traitLabel('nonsense'), 'nonsense', 'an unknown trait falls back to itself');
});

test('a monster is described as dominant, recessive and hidden alleles', () => {
  const tags = describeMonster(starter());
  const kinds = new Set(tags.map((t) => t.kind));

  assert.ok(kinds.has('dominant'));
  assert.ok(kinds.has('hidden'), 'the carrier slot is what makes atavism visible');
  assert.ok(tags.every((t) => t.label.length > 0));
  assert.ok(tags.every((t) => t.locusLabel.length > 0));

  // Exactly one expressed tag per appearance locus: what you see.
  const expressed = tags.filter((t) => t.expressed);
  const loci = new Set(expressed.map((t) => t.locus));
  assert.equal(loci.size, CATEGORICAL_LOCI.length);
});

test('the expressed tag matches what the monster actually looks like', () => {
  const monster = starter(0, 3);
  for (const tag of describeAppearanceTags(monster)) {
    const shown = (monster.phenotype as unknown as Record<string, unknown>)[tag.locus];
    assert.equal(tag.value, shown, `${tag.locus}: tagged a value the monster is not wearing`);
  }
});

test('a hidden allele is never reported as expressed', () => {
  for (const tag of describeMonster(starter(1, 5))) {
    if (tag.kind === 'hidden') {
      assert.equal(tag.expressed, false, 'a carrier is not on show, that is the point');
    }
  }
});

test('the carrier can be left out for a compact view', () => {
  const monster = starter(2, 7);
  const full = describeMonster(monster);
  const compact = describeMonster(monster, { includeHidden: false });
  assert.ok(compact.length < full.length);
  assert.ok(compact.every((t) => t.kind !== 'hidden'));
});

test('tendencies are numbers, so they are off by default', () => {
  const monster = starter(0, 9);
  assert.ok(describeMonster(monster).every((t) => !NUMERIC_LOCI.includes(t.locus as never)));

  const withNumbers = describeMonster(monster, { includeTendencies: true });
  const tendency = withNumbers.find((t) => t.locus === 'attackTendency');
  assert.ok(tendency);
  assert.match(tendency.label, /攻撃傾向 \d+/);
});

test('a mutated locus is tagged as a mutation rather than as a plain allele', () => {
  // Mutation is rare by design, so this asks for a run where it is not.
  const config = createGameConfig({ genetics: { mutationRate: 1 } });
  const context = testContext(11, config);
  const [a, , b] = createStarterMonsters(context);
  assert.ok(a && b);
  const child = fuseDetailed(a, b, context).child;

  assert.ok(child.mutatedLoci.length > 0);
  // Tendencies are off by default, so ask for them: they mutate too.
  const tags = describeMonster(child, {
    config: config.genetics,
    includeTendencies: true,
  });
  for (const locus of child.mutatedLoci) {
    const forLocus = tags.filter((t) => t.locus === locus && t.kind !== 'hidden');
    assert.ok(forLocus.length > 0);
    assert.ok(
      forLocus.every((t) => t.kind === 'mutation'),
      `${locus}: a mutated locus should read as a mutation, not as an ordinary allele`,
    );
  }

  // An unmutated locus keeps its ordinary kind.
  const untouched = tags.filter((t) => !child.mutatedLoci.includes(t.locus));
  assert.ok(untouched.every((t) => t.kind !== 'mutation'));
});

test('a monster with no mutations has no mutation tags', () => {
  const config = createGameConfig({ genetics: { mutationRate: 0 } });
  const context = testContext(13, config);
  const [a, , b] = createStarterMonsters(context);
  assert.ok(a && b);
  const child = fuseDetailed(a, b, context).child;
  assert.equal(child.mutatedLoci.length, 0);
  assert.ok(describeMonster(child).every((t) => t.kind !== 'mutation'));
});

test('a fusion reveal ends on the payoff', () => {
  const config = createGameConfig({ genetics: { mutationRate: 0.5, atavismRate: 0.5 } });
  const context = testContext(17, config);
  const [a, , b] = createStarterMonsters(context);
  assert.ok(a && b);
  const result = fuseDetailed(a, b, context);
  const summary = describeFusion(result.child, result.evolution.willEvolve);

  assert.ok(summary.steps.length > 0);
  const order = ['inherited', 'atavism', 'mutation', 'evolution'];
  const seen = summary.steps.map((s) => order.indexOf(s.kind));
  assert.deepEqual(seen, [...seen].sort((x, y) => x - y), 'the surprises come last');

  for (const step of summary.steps) {
    assert.ok(step.label.length > 0);
    assert.ok(step.note.length > 0);
  }
  assert.equal(summary.mutationCount, result.child.mutationCount);
});

test('an evolution is announced, and only when it happened', () => {
  const context = testContext(19);
  const [moss] = createStarterMonsters(context);
  const [twin] = createStarterMonsters(testContext(19));
  assert.ok(moss && twin);

  const plain = describeFusion(moss, false);
  assert.ok(plain.steps.every((s) => s.kind !== 'evolution'));
  assert.equal(plain.evolved, false);

  const evolved = describeFusion(moss, true);
  const last = evolved.steps.at(-1);
  assert.ok(last);
  assert.equal(last.kind, 'evolution');
  assert.match(last.note, /進化/);
});

test('describing a phenotype needs no monster', () => {
  const labels = describePhenotype(starter().phenotype);
  assert.equal(labels.length, CATEGORICAL_LOCI.length);
  assert.ok(labels.every((l) => l.length > 0));
});

test('dominance figures come back for the UI to show', () => {
  const monster = starter();
  const d = dominanceOf(monster.genes, 'element');
  assert.ok(d.a >= 0 && d.a <= 1);
  assert.ok(d.b >= 0 && d.b <= 1);
  const [lo, hi] = DEFAULT_GENETICS_CONFIG.dominanceRange;
  assert.ok(d.a >= lo - 1e-9 && d.a <= hi + 1e-9);
});

test('traits come back labelled', () => {
  const traits = describeTraits(starter());
  assert.ok(traits.length > 0);
  for (const { trait, label } of traits) {
    assert.ok(label.length > 0);
    assert.equal(label, traitLabel(trait));
  }
});
