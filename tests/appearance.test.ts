import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  appearanceKey,
  BODY_RIGS,
  CANVAS_SIZE,
  colorMappings,
  composeAppearance,
  createAppearanceConfig,
  EYE_RAMP,
  paletteFor,
  referenceColors,
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
  assert.notEqual(green.palette.body.base, red.palette.body.base);

  // Element only tints the accent, never the hide.
  const fire = composeAppearance({ ...basePhenotype, element: 'fire' });
  assert.equal(fire.palette.body.base, green.palette.body.base);
  assert.notEqual(fire.palette.accent, green.palette.accent);
});

test('a monster is not one flat colour', () => {
  const palette = composeAppearance(basePhenotype).palette;
  const bases = [
    palette.body.base,
    palette.belly.base,
    palette.keratin.base,
    palette.membrane.base,
    palette.eye.base,
  ];
  assert.equal(
    new Set(bases).size,
    bases.length,
    'hide, belly, horn, wing and eye must each read as their own material',
  );

  // Horns are ivory whatever the creature is made of: a horn that takes the
  // hide colour stops reading as a horn.
  const green = composeAppearance({ ...basePhenotype, bodyColor: 'green' });
  const purple = composeAppearance({ ...basePhenotype, bodyColor: 'purple' });
  assert.deepEqual(green.palette.keratin, purple.palette.keratin);
});

test('glowing eyes are lit by the element, plain eyes are amber', () => {
  const amber = composeAppearance({ ...basePhenotype, eyes: 'round', element: 'fire' });
  const lit = composeAppearance({ ...basePhenotype, eyes: 'glowing', element: 'fire' });

  assert.equal(amber.palette.eye.base, EYE_RAMP.base, 'an ordinary eye stays amber');
  assert.equal(lit.palette.eye.base, amber.palette.accent, 'a glowing eye takes the element');
  assert.notEqual(lit.palette.eye.base, lit.palette.body.base);
});

test('every body colour has a full palette and a complete mapping', () => {
  for (const bodyColor of DEFAULT_ALLELE_POOLS.bodyColor) {
    for (const element of DEFAULT_ALLELE_POOLS.element) {
      const palette = paletteFor(bodyColor, element);
      assert.match(palette.outline, /^#[0-9a-f]{6}$/i, `${bodyColor}.outline`);
      assert.match(palette.accent, /^#[0-9a-f]{6}$/i, `${bodyColor}.accent`);
      for (const channel of ['body', 'belly', 'keratin', 'membrane', 'eye'] as const) {
        for (const tone of ['shade', 'base', 'light'] as const) {
          assert.match(
            palette[channel][tone],
            /^#[0-9a-f]{6}$/i,
            `${bodyColor}.${channel}.${tone}`,
          );
        }
      }

      const mappings = colorMappings(palette);
      assert.equal(mappings.length, 17, 'outline + accent + five three-step ramps');
      for (const mapping of mappings) {
        assert.match(mapping.from, /^#[0-9a-f]{6}$/i);
        assert.match(mapping.to, /^#[0-9a-f]{6}$/i);
      }
    }
  }
});

test('each ramp goes dark to light', () => {
  const luminance = (hex: string): number => {
    const n = Number.parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  };
  for (const bodyColor of DEFAULT_ALLELE_POOLS.bodyColor) {
    const palette = paletteFor(bodyColor, 'neutral');
    for (const channel of ['body', 'belly', 'keratin', 'membrane', 'eye'] as const) {
      const ramp = palette[channel];
      assert.ok(
        luminance(ramp.shade) < luminance(ramp.base),
        `${bodyColor}.${channel}: shade is not darker than base`,
      );
      assert.ok(
        luminance(ramp.base) < luminance(ramp.light),
        `${bodyColor}.${channel}: light is not brighter than base`,
      );
    }
    assert.ok(
      luminance(palette.outline) < luminance(palette.body.shade),
      `${bodyColor}: the outline must be the darkest tone`,
    );
  }
});

test('no two reference colours collide', () => {
  const colors = referenceColors();
  assert.equal(
    new Set(colors).size,
    colors.length,
    'a duplicate would make the swap ambiguous',
  );
  assert.equal(colors.length, 17);
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

// ---------------------------------------------------------------------------
// Rig invariants
//
// The rig was first written before any art existed, and the guesses showed:
// eyes hung off faces, tails floated behind bodies, and a fitting pass once
// put a jaw above the eyes because nothing said which way up a face is. These
// lock in what the art cannot tell us but anatomy can.
// ---------------------------------------------------------------------------

test('every body wears its features the right way up', () => {
  for (const [shape, rig] of Object.entries(BODY_RIGS)) {
    const a = rig.anchors;
    assert.ok(
      a.crest.y <= a.horns.y,
      `${shape}: the crest (${a.crest.y}) must sit above the horns (${a.horns.y})`,
    );
    assert.ok(
      a.horns.y <= a.eyes.y,
      `${shape}: horns (${a.horns.y}) do not grow below the eyes (${a.eyes.y})`,
    );
    assert.ok(
      a.jaw.y > a.eyes.y,
      `${shape}: the jaw (${a.jaw.y}) must sit below the eyes (${a.eyes.y})`,
    );
    assert.ok(
      a.jaw.y - a.eyes.y <= 12,
      `${shape}: the jaw is ${a.jaw.y - a.eyes.y}px below the eyes, which is off the face`,
    );
    assert.ok(
      a.head.y > a.crest.y && a.head.y < a.jaw.y,
      `${shape}: the head centre must lie between the crest and the jaw`,
    );
  }
});

test('the tail sits behind the body and the wings on it', () => {
  for (const [shape, rig] of Object.entries(BODY_RIGS)) {
    const a = rig.anchors;
    assert.ok(
      a.tail.x > a.wings.x,
      `${shape}: the tail (${a.tail.x}) should be further back than the wings (${a.wings.x})`,
    );
    assert.ok(a.tail.y > a.eyes.y, `${shape}: the tail should not grow out of the head`);
  }
});

test('head and limb scales stay in a sane range', () => {
  for (const [shape, rig] of Object.entries(BODY_RIGS)) {
    assert.ok(rig.headScale > 0.5 && rig.headScale <= 1.2, `${shape}: headScale ${rig.headScale}`);
    assert.ok(rig.limbScale > 0.5 && rig.limbScale <= 1.5, `${shape}: limbScale ${rig.limbScale}`);
  }
});

test('an anchor tracks the body it is attached to, at every size', () => {
  // Both the body art and the anchors scale about the canvas centre, so a
  // feature painted at a point on the body and the anchor meant to sit on it
  // move together. If these ever diverge, parts drift apart as a monster grows
  // - which is exactly how the first rig failed.
  const centre = CANVAS_SIZE / 2;
  for (const size of ['tiny', 'small', 'medium', 'large', 'giant'] as const) {
    const scale = SIZE_SCALES[size];
    for (const [shape, rig] of Object.entries(BODY_RIGS)) {
      const composition = composeAppearance({
        ...basePhenotype,
        bodyShape: shape as never,
        size,
        horns: 'twin',
      });
      const body = composition.layers.find((l) => l.kind === 'body');
      const horns = composition.layers.find((l) => l.kind === 'horns');
      assert.ok(body && horns);

      // Where the horn anchor sits relative to the body origin must be the
      // unscaled offset times the scale, with no extra term.
      const expectedX = centre + (rig.anchors.horns.x - centre) * scale;
      const expectedY = centre + (rig.anchors.horns.y - centre) * scale;
      assert.ok(
        Math.abs(horns.anchor.x - expectedX) < 0.02 &&
          Math.abs(horns.anchor.y - expectedY) < 0.02,
        `${shape}/${size}: the horn anchor drifted from the body`,
      );

      // And the body itself must scale about the same point.
      assert.ok(
        Math.abs(body.anchor.x - (centre + (rig.origin.x - centre) * scale)) < 0.02,
        `${shape}/${size}: the body does not scale about the canvas centre`,
      );
    }
  }
});

test('scaling is applied once, not twice', () => {
  const medium = composeAppearance({ ...basePhenotype, size: 'medium', horns: 'twin' });
  const giant = composeAppearance({ ...basePhenotype, size: 'giant', horns: 'twin' });
  const hornOf = (c: typeof medium) => c.layers.find((l) => l.kind === 'horns');
  const a = hornOf(medium);
  const b = hornOf(giant);
  assert.ok(a && b);
  const ratio = b.scale / a.scale;
  assert.ok(
    Math.abs(ratio - SIZE_SCALES.giant / SIZE_SCALES.medium) < 1e-6,
    `the size scale was applied ${ratio.toFixed(2)}x instead of once`,
  );
});
