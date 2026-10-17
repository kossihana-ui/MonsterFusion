import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appearanceKey,
  BODY_RIGS,
  CANVAS_SIZE,
  colorMappings,
  composeAppearance,
  createAppearanceConfig,
  paletteFor,
  REFERENCE_PALETTE,
  requiredPartKeys,
  SIZE_SCALES,
} from '../src/core/appearance.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import { fuse } from '../src/core/fusion.ts';
import { DEFAULT_ALLELE_POOLS } from '../src/core/config.ts';
import type { MonsterPhenotype } from '../src/shared/types.ts';
import { fusionChain, testContext } from './helpers.ts';

const basePhenotype: MonsterPhenotype = {
  bodyColor: 'green',
  bodyShape: 'round',
  size: 'small',
  horns: 'none',
  wings: 'none',
  tail: 'vine',
  eyes: 'round',
  crest: 'flower',
  jaw: 'normal',
  element: 'earth',
  attackTendency: 35,
  defenseTendency: 55,
  magicTendency: 65,
  speedTendency: 35,
};

test('composition is a pure function of the phenotype', () => {
  assert.deepEqual(composeAppearance(basePhenotype), composeAppearance(basePhenotype));
});

test('absent slots produce no layer', () => {
  const composition = composeAppearance(basePhenotype);
  const kinds = composition.layers.map((l) => l.kind);

  assert.ok(kinds.includes('body'));
  assert.ok(kinds.includes('eyes'));
  assert.ok(kinds.includes('crest'), 'the flower must be drawn');
  assert.ok(kinds.includes('tail'), 'the vine tail must be drawn');
  assert.ok(!kinds.includes('horns'), "horns: 'none' must not emit a layer");
  assert.ok(
    !kinds.includes('wings-back') && !kinds.includes('wings-front'),
    "wings: 'none' must not emit a layer",
  );
  assert.ok(!kinds.includes('jaw'), "jaw: 'normal' belongs to the body sprite");
});

test('layers come back sorted back to front', () => {
  const composition = composeAppearance({
    ...basePhenotype,
    horns: 'spiral',
    wings: 'feathered',
    jaw: 'maw',
  });
  const order = composition.layers.map((l) => l.z);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));

  const kinds = composition.layers.map((l) => l.kind);
  assert.ok(
    kinds.indexOf('wings-back') < kinds.indexOf('body'),
    'feathered wings go behind the body',
  );
  assert.ok(kinds.indexOf('body') < kinds.indexOf('eyes'), 'eyes go on top of the body');
  assert.ok(kinds.indexOf('eyes') < kinds.indexOf('crest'), 'the crest sits above the eyes');
});

test('ethereal wings are drawn in front, the rest behind', () => {
  const behind = composeAppearance({ ...basePhenotype, wings: 'membrane' });
  const front = composeAppearance({ ...basePhenotype, wings: 'ethereal' });
  assert.ok(behind.layers.some((l) => l.kind === 'wings-back'));
  assert.ok(front.layers.some((l) => l.kind === 'wings-front'));
});

test('size scales the sprite monotonically', () => {
  const sizes = ['tiny', 'small', 'medium', 'large', 'giant'] as const;
  const scales = sizes.map((size) => composeAppearance({ ...basePhenotype, size }).sizeScale);
  for (let i = 1; i < scales.length; i++) {
    assert.ok(
      (scales[i] as number) > (scales[i - 1] as number),
      `${sizes[i]} must be larger than ${sizes[i - 1]}`,
    );
  }
  assert.equal(scales[2], 1, 'medium is the reference size');
});

test('anchors stay on the canvas at every size', () => {
  for (const size of ['tiny', 'small', 'medium', 'large', 'giant'] as const) {
    for (const bodyShape of Object.keys(BODY_RIGS) as (keyof typeof BODY_RIGS)[]) {
      const composition = composeAppearance({
        ...basePhenotype,
        size,
        bodyShape,
        horns: 'crown',
        wings: 'crystal',
        crest: 'antenna',
        jaw: 'tusks',
      });
      for (const layer of composition.layers) {
        assert.ok(
          layer.anchor.x >= 0 && layer.anchor.x <= CANVAS_SIZE,
          `${bodyShape}/${size} ${layer.part}: x=${layer.anchor.x} is off canvas`,
        );
        assert.ok(
          layer.anchor.y >= 0 && layer.anchor.y <= CANVAS_SIZE,
          `${bodyShape}/${size} ${layer.part}: y=${layer.anchor.y} is off canvas`,
        );
        assert.ok(layer.scale > 0);
      }
    }
  }
});

test('head parts follow the body shape head scale', () => {
  const round = composeAppearance({ ...basePhenotype, bodyShape: 'round', horns: 'twin' });
  const serpent = composeAppearance({
    ...basePhenotype,
    bodyShape: 'serpentine',
    horns: 'twin',
  });
  const hornOf = (c: typeof round) => c.layers.find((l) => l.kind === 'horns');
  const a = hornOf(round);
  const b = hornOf(serpent);
  assert.ok(a && b);
  assert.ok(b.scale < a.scale, 'a serpent carries a smaller head than a blob');
});

test('every body shape has a rig with every anchor', () => {
  const anchors = ['body', 'head', 'eyes', 'jaw', 'crest', 'horns', 'wings', 'tail'] as const;
  for (const [shape, rig] of Object.entries(BODY_RIGS)) {
    for (const anchor of anchors) {
      const point = rig.anchors[anchor];
      assert.ok(point, `${shape} is missing the ${anchor} anchor`);
      assert.ok(point.x >= 0 && point.x <= CANVAS_SIZE, `${shape}.${anchor}.x out of range`);
      assert.ok(point.y >= 0 && point.y <= CANVAS_SIZE, `${shape}.${anchor}.y out of range`);
    }
    assert.ok(rig.headScale > 0);
    assert.ok(rig.limbScale > 0);
  }
});

test('the palette comes from the colour gene, never from image analysis', () => {
  const green = composeAppearance({ ...basePhenotype, bodyColor: 'green' });
  const red = composeAppearance({ ...basePhenotype, bodyColor: 'red' });
  assert.notEqual(green.palette.base, red.palette.base);

  // Element only tints the accent, never the body.
  const fire = composeAppearance({ ...basePhenotype, element: 'fire' });
  assert.equal(fire.palette.base, green.palette.base);
  assert.notEqual(fire.palette.accent, green.palette.accent);
});

test('every body colour has a full palette and a complete mapping', () => {
  for (const bodyColor of DEFAULT_ALLELE_POOLS.bodyColor) {
    for (const element of DEFAULT_ALLELE_POOLS.element) {
      const palette = paletteFor(bodyColor, element);
      for (const tone of ['outline', 'shade', 'base', 'light', 'accent'] as const) {
        assert.match(palette[tone], /^#[0-9a-f]{6}$/i, `${bodyColor}.${tone}`);
      }
      const mappings = colorMappings(palette);
      assert.equal(mappings.length, 5);
      for (const mapping of mappings) {
        assert.match(mapping.from, /^#[0-9a-f]{6}$/i);
        assert.match(mapping.to, /^#[0-9a-f]{6}$/i);
      }
    }
  }
});

test('the reference palette has no duplicate tones', () => {
  const tones = Object.values(REFERENCE_PALETTE);
  assert.equal(new Set(tones).size, tones.length, 'a duplicate would make the swap ambiguous');
});

test('the appearance key ignores everything that is not drawn', () => {
  const a = composeAppearance(basePhenotype);
  const b = composeAppearance({ ...basePhenotype, attackTendency: 99, magicTendency: 1 });
  assert.equal(a.key, b.key, 'tendencies are invisible, so they must not split the cache');

  const c = composeAppearance({ ...basePhenotype, horns: 'spiral' });
  assert.notEqual(a.key, c.key, 'a visible change must change the key');
});

test('the part checklist covers every appearance the game can produce', () => {
  const available = new Set(requiredPartKeys());

  // Walk a long lineage and demand that nothing asks for a missing asset.
  const { chain } = fusionChain(200, 31337);
  for (const monster of chain) {
    for (const layer of composeAppearance(monster.phenotype).layers) {
      assert.ok(available.has(layer.part), `no asset for ${layer.part}`);
    }
  }
});

test('the checklist is small: parts are linear, not combinatorial', () => {
  const keys = requiredPartKeys();
  assert.equal(new Set(keys).size, keys.length, 'no duplicates');
  assert.ok(keys.length <= 40, `the artwork list grew to ${keys.length} sprites`);
});

test('the starters and their fusions all compose', () => {
  const context = testContext(7);
  const [moss, ignis, aqua] = createStarterMonsters(context);
  assert.ok(moss && ignis && aqua);

  for (const monster of [moss, ignis, aqua]) {
    const composition = composeAppearance(monster.phenotype);
    assert.ok(composition.layers.length >= 2);
    assert.equal(composition.key, appearanceKey(monster.phenotype));
  }

  // Moss keeps its flower; Aqua is a finned body with a maw.
  assert.ok(composeAppearance(moss.phenotype).layers.some((l) => l.part === 'crest/flower'));
  assert.ok(composeAppearance(aqua.phenotype).layers.some((l) => l.part === 'jaw/maw'));
  assert.ok(composeAppearance(aqua.phenotype).layers.some((l) => l.part === 'body/finned'));

  // A fused child must look different from the parent it was drawn from.
  const child = fuse(moss, aqua, context);
  const changed =
    appearanceKey(child.phenotype) !== appearanceKey(moss.phenotype) ||
    appearanceKey(child.phenotype) !== appearanceKey(aqua.phenotype);
  assert.ok(changed, 'a child that looks like neither parent is the whole point');
});

test('the rig and the scales are configurable', () => {
  const config = createAppearanceConfig({
    sizeScales: { ...SIZE_SCALES, giant: 2 },
  });
  const composition = composeAppearance({ ...basePhenotype, size: 'giant' }, config);
  assert.equal(composition.sizeScale, 2);
});
