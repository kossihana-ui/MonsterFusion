/**
 * Sprite composition.
 *
 * Turns an expressed phenotype into a stack of layers: which part to draw,
 * where to put it, how big, and in which colours. It draws nothing itself -
 * there is no canvas, no DOM and no image loading here - so the whole thing
 * stays pure and testable, and the UI only has to blit what it is handed.
 *
 * Why this is simpler than a head-and-body fusion (Pokemon Infinite Fusion
 * style): that approach splices two finished illustrations, so it has to
 * extract a dominant colour from one and force it onto the other. Here the
 * child's appearance is already decided gene by gene before anything is drawn.
 * There is exactly one `bodyColor`, so every part is recoloured to the same
 * palette by construction and the seams cannot disagree.
 *
 * The three pieces the renderer needs:
 *
 * 1. Anchors   - each body shape says where a horn, wing, tail, eye, crest or
 *                jaw attaches. A part is drawn so its own origin lands there.
 * 2. Palette   - parts are authored in a fixed reference ramp and remapped to
 *                the monster's palette at draw time (classic palette swap).
 * 3. Scale     - the `size` gene scales the whole sprite; each body shape also
 *                carries a head scale, because a serpent's head is not a blob's.
 */

import type {
  BodyColor,
  BodyShape,
  BodySize,
  CrestType,
  Element,
  EyeType,
  HornType,
  JawType,
  MonsterPhenotype,
  TailType,
  WingType,
} from '../shared/types.ts';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** The logical grid every sprite is composed on. Matches the 64x64 art. */
export const CANVAS_SIZE = 64;

/** Where a part attaches to a body. */
export type AnchorName =
  | 'body'
  | 'head'
  | 'eyes'
  | 'jaw'
  | 'crest'
  | 'horns'
  | 'wings'
  | 'tail';

/**
 * A body shape's attachment points, in the 64x64 grid.
 *
 * This is the contract between the renderer and the artist: a part is authored
 * with its own origin on the pixel that touches the body (the base of a horn,
 * the root of a wing), and the renderer puts that origin here.
 */
export interface BodyRig {
  /** Where the body sprite's own origin goes. Its origin is its centre. */
  readonly origin: Point;
  readonly anchors: Readonly<Record<AnchorName, Point>>;
  /**
   * Multiplier for head-mounted parts (eyes, jaw, crest, horns). A slim or
   * serpentine body carries a smaller head than a round one, so the same horn
   * art has to shrink to look right on it.
   */
  readonly headScale: number;
  /** Multiplier for wings and tail, which follow the body rather than the head. */
  readonly limbScale: number;
  /**
   * Per-slot correction for this body shape, on top of head and limb scale.
   *
   * Occlusion tracks the forehead a body has, not the horn asset: a shape with
   * a short brow wears the same horn art much closer to its eyes than a round
   * one does. That makes the correction belong to the shape, which is what
   * this is for. Missing entries mean 1.
   */
  readonly partScale?: Partial<Record<LayerKind, number>>;
  /** Mirrors parts that would otherwise point the wrong way. */
  readonly facing: 'left' | 'right';
}

/**
 * One rig per body shape.
 *
 * The numbers assume the creature faces slightly left, as the starter art
 * does, and that it sits inside the middle 56x56 of the grid.
 */
export const BODY_RIGS: Readonly<Record<BodyShape, BodyRig>> = {
  round: {
    origin: { x: 32, y: 38 },
    anchors: {
      body: { x: 32, y: 38 },
      head: { x: 31, y: 32 },
      eyes: { x: 31, y: 33 },
      jaw: { x: 31, y: 41 },
      crest: { x: 32, y: 23 },
      horns: { x: 32, y: 23 },
      wings: { x: 36, y: 34 },
      tail: { x: 47, y: 42 },
    },
    headScale: 1.0,
    limbScale: 1,
    facing: 'left',
  },
  slim: {
    origin: { x: 32, y: 36 },
    anchors: {
      body: { x: 32, y: 36 },
      head: { x: 27, y: 22 },
      eyes: { x: 27, y: 22 },
      jaw: { x: 30, y: 29 },
      crest: { x: 31, y: 16 },
      horns: { x: 31, y: 16 },
      wings: { x: 35, y: 31 },
      tail: { x: 42, y: 47 },
    },
    headScale: 0.7,
    limbScale: 0.95,
    partScale: { horns: 0.9 },
    facing: 'left',
  },
  muscular: {
    origin: { x: 32, y: 38 },
    anchors: {
      body: { x: 32, y: 38 },
      head: { x: 27, y: 23 },
      eyes: { x: 27, y: 24 },
      jaw: { x: 32, y: 31 },
      crest: { x: 30, y: 15 },
      horns: { x: 30, y: 16 },
      wings: { x: 38, y: 32 },
      tail: { x: 48, y: 44 },
    },
    headScale: 1.0,
    limbScale: 1.1,
    partScale: { horns: 0.9 },
    facing: 'left',
  },
  serpentine: {
    origin: { x: 32, y: 40 },
    anchors: {
      body: { x: 32, y: 40 },
      head: { x: 24, y: 20 },
      eyes: { x: 24, y: 20 },
      jaw: { x: 25, y: 26 },
      crest: { x: 26, y: 13 },
      horns: { x: 26, y: 13 },
      wings: { x: 34, y: 30 },
      tail: { x: 48, y: 50 },
    },
    headScale: 0.75,
    limbScale: 0.9,
    facing: 'left',
  },
  winged: {
    origin: { x: 32, y: 36 },
    anchors: {
      body: { x: 32, y: 36 },
      head: { x: 28, y: 22 },
      eyes: { x: 28, y: 22 },
      jaw: { x: 30, y: 30 },
      crest: { x: 31, y: 15 },
      horns: { x: 31, y: 15 },
      wings: { x: 34, y: 28 },
      tail: { x: 43, y: 46 },
    },
    headScale: 0.85,
    limbScale: 1.15,
    facing: 'left',
  },
  finned: {
    origin: { x: 32, y: 38 },
    anchors: {
      body: { x: 32, y: 38 },
      head: { x: 25, y: 32 },
      eyes: { x: 25, y: 34 },
      jaw: { x: 24, y: 38 },
      crest: { x: 32, y: 25 },
      horns: { x: 28, y: 26 },
      wings: { x: 36, y: 34 },
      tail: { x: 50, y: 38 },
    },
    headScale: 0.9,
    limbScale: 1,
    facing: 'left',
  },
};

/**
 * Per-asset size correction, applied on top of the slot's scale.
 *
 * Some parts are drawn larger than the rest of their slot. The ram horns are
 * 42px wide against 30px for every other horn, which is 1.4x, and at full size
 * they cover a face rather than crowning it. Shrinking the asset would lose
 * the detail; scaling it at draw time keeps it.
 *
 * Only put a part here when it is out of step with its own slot. A part that
 * is big everywhere is a body-shape problem - use `BodyRig.partScale`.
 */
export const PART_SCALES: Readonly<Record<string, number>> = {
  // 42px of art against a 30px slot median.
  'horns/spiral': 0.75,
};

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * A three-step ramp: one material, lit, mid and in shadow.
 *
 * Pixel art of this era gets its richness from several short ramps rather than
 * one long one. Three steps is what a 64x64 sprite can actually show.
 */
export interface Ramp {
  readonly shade: string;
  readonly base: string;
  readonly light: string;
}

/**
 * A monster's full palette, split by material.
 *
 * Everything used to be recoloured to a single body ramp, which flattened the
 * creature into one colour: horns, belly and wings all came out the same.
 * Splitting it by material is what gives a monster of this era its read - a
 * green body with a cream belly, ivory horns and a translucent wing, all at
 * once.
 *
 * A part is authored in whichever channels it needs, usually two or three.
 */
export interface Palette {
  /** Shared by every part, so the silhouette reads as one creature. */
  readonly outline: string;
  /** The main hide. The `bodyColor` gene decides this one. */
  readonly body: Ramp;
  /** Underside, chest and muzzle. Lighter and less saturated than the body. */
  readonly belly: Ramp;
  /** Horns, claws, beaks, tusks and fangs. Ivory, barely tinted by the hide. */
  readonly keratin: Ramp;
  /** Wing membranes and fins. Related to the body but thinner and brighter. */
  readonly membrane: Ramp;
  /** Eyes. Amber by default; a glowing eye takes the element colour instead. */
  readonly eye: Ramp;
  /** Element tint for glows, gems and energy. Never the hide. */
  readonly accent: string;
}

/**
 * The reference palette every part asset is drawn in.
 *
 * The channels are deliberately unrelated hues - brown belly, green keratin,
 * purple membrane, red eye - so a pixel in the wrong channel is obvious at a
 * glance instead of surviving review and then recolouring wrongly in play.
 */
export const REFERENCE_PALETTE: Palette = {
  outline: '#1b2030',
  body: { shade: '#4a4a6a', base: '#8a8ab0', light: '#c8c8e0' },
  belly: { shade: '#6a5a3a', base: '#b09a6a', light: '#e0d0a0' },
  keratin: { shade: '#3a5a4a', base: '#6aa88a', light: '#a8e0c0' },
  membrane: { shade: '#5a3a6a', base: '#a06ac0', light: '#d0a8e8' },
  eye: { shade: '#7a2a2a', base: '#d04a4a', light: '#f09a9a' },
  accent: '#ff00ff',
};

/** What a body colour means for the hide, the belly and a wing membrane. */
export interface HidePalette {
  readonly outline: string;
  readonly body: Ramp;
  readonly belly: Ramp;
  readonly membrane: Ramp;
}

export const BODY_PALETTES: Readonly<Record<BodyColor, HidePalette>> = {
  red: {
    outline: '#2a1016',
    body: { shade: '#8c2020', base: '#d6402e', light: '#f58a5a' },
    belly: { shade: '#a8705a', base: '#e8c0a0', light: '#f8e4d0' },
    membrane: { shade: '#8c3a4a', base: '#d4707a', light: '#f0a8b0' },
  },
  blue: {
    outline: '#0e1b32',
    body: { shade: '#1b4a8c', base: '#2e7ad6', light: '#6fb8f5' },
    belly: { shade: '#5a7a9a', base: '#b0d0e8', light: '#dceaf8' },
    membrane: { shade: '#2a6a8c', base: '#5aaed4', light: '#9fd8f0' },
  },
  green: {
    outline: '#122a14',
    body: { shade: '#2a6b2e', base: '#4aa83c', light: '#8fd96a' },
    belly: { shade: '#7a8a50', base: '#d0d898', light: '#eef0cc' },
    membrane: { shade: '#3a7a4a', base: '#6ab87a', light: '#a8e0b0' },
  },
  yellow: {
    outline: '#33280c',
    body: { shade: '#9c7a14', base: '#e0b526', light: '#f7e07a' },
    belly: { shade: '#a08a40', base: '#e8d8a0', light: '#f8f0d8' },
    membrane: { shade: '#b08a2a', base: '#e8c860', light: '#f8e8a8' },
  },
  purple: {
    outline: '#201033',
    body: { shade: '#5a2a8c', base: '#8f4ad6', light: '#c08af5' },
    belly: { shade: '#7a6a9a', base: '#c8b8e0', light: '#e8e0f4' },
    membrane: { shade: '#6a3a9c', base: '#a86ae0', light: '#d0a8f0' },
  },
  white: {
    outline: '#2a2a33',
    body: { shade: '#9a9aa8', base: '#dcdce6', light: '#ffffff' },
    belly: { shade: '#b0b0bc', base: '#ececf2', light: '#fdfdff' },
    membrane: { shade: '#a8a8c0', base: '#e0e0ee', light: '#fafaff' },
  },
  black: {
    outline: '#08080c',
    body: { shade: '#2a2a36', base: '#44445a', light: '#70708c' },
    belly: { shade: '#3a3a4a', base: '#5a5a72', light: '#8a8aa4' },
    membrane: { shade: '#30303f', base: '#4e4e66', light: '#7c7c98' },
  },
};

/**
 * Horn and claw colour hardly varies between creatures in this style, so it is
 * shared rather than derived. It is what keeps a horn reading as a horn
 * instead of as another lump of hide.
 */
export const KERATIN_RAMP: Ramp = { shade: '#8a7a5c', base: '#d8c9a0', light: '#f3ead0' };

/** Amber, the default eye. A glowing eye swaps to the element accent. */
export const EYE_RAMP: Ramp = { shade: '#7a4a10', base: '#e0a030', light: '#ffe9a0' };

export const ELEMENT_ACCENTS: Readonly<Record<Element, string>> = {
  neutral: '#cfd6e0',
  fire: '#ff8a2b',
  water: '#36cfe0',
  earth: '#c08a3a',
  wind: '#9ae86a',
  light: '#ffe98a',
  dark: '#9a5ad6',
};

export interface PaletteOptions {
  /** A glowing eye is lit by the element rather than being plain amber. */
  readonly glowingEyes?: boolean;
}

/** The palette a monster's parts are recoloured to. */
export function paletteFor(
  bodyColor: BodyColor,
  element: Element,
  options: PaletteOptions = {},
): Palette {
  const hide = BODY_PALETTES[bodyColor];
  const accent = ELEMENT_ACCENTS[element];
  return {
    outline: hide.outline,
    body: hide.body,
    belly: hide.belly,
    keratin: KERATIN_RAMP,
    membrane: hide.membrane,
    eye: options.glowingEyes
      ? { shade: hide.outline, base: accent, light: '#ffffff' }
      : EYE_RAMP,
    accent,
  };
}

/** One reference colour and what it becomes. The renderer applies these. */
export interface ColorMapping {
  readonly from: string;
  readonly to: string;
}

const RAMP_CHANNELS = ['body', 'belly', 'keratin', 'membrane', 'eye'] as const;
const TONES = ['shade', 'base', 'light'] as const;

export function colorMappings(palette: Palette): ColorMapping[] {
  const mappings: ColorMapping[] = [
    { from: REFERENCE_PALETTE.outline, to: palette.outline },
    { from: REFERENCE_PALETTE.accent, to: palette.accent },
  ];
  for (const channel of RAMP_CHANNELS) {
    for (const tone of TONES) {
      mappings.push({ from: REFERENCE_PALETTE[channel][tone], to: palette[channel][tone] });
    }
  }
  return mappings;
}

/**
 * Every colour a part asset is allowed to contain. An asset linter can reject
 * anything else, which catches an anti-aliased edge before it ships.
 */
export function referenceColors(): string[] {
  return colorMappings(REFERENCE_PALETTE).map((mapping) => mapping.from);
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/** How much the `size` gene scales the whole sprite. */
export const SIZE_SCALES: Readonly<Record<BodySize, number>> = {
  tiny: 0.7,
  small: 0.85,
  medium: 1,
  large: 1.15,
  giant: 1.3,
};

// ---------------------------------------------------------------------------
// Layers
// ---------------------------------------------------------------------------

/** Draw order, back to front. Lower numbers are drawn first. */
export type LayerKind =
  | 'wings-back'
  | 'tail'
  | 'body'
  | 'jaw'
  | 'eyes'
  | 'horns'
  | 'crest'
  | 'wings-front';

const LAYER_ORDER: readonly LayerKind[] = [
  'wings-back',
  'tail',
  'body',
  'jaw',
  'eyes',
  'horns',
  'crest',
  'wings-front',
];

export interface SpriteLayer {
  readonly kind: LayerKind;
  /** Asset key, e.g. "body/muscular" or "horns/spiral". No file extension. */
  readonly part: string;
  /** Draw order; already sorted ascending in `SpriteComposition.layers`. */
  readonly z: number;
  /** Where the part's own origin must land, in canvas coordinates. */
  readonly anchor: Point;
  /** Multiply the part's native size by this. */
  readonly scale: number;
  /** True when the art must be mirrored horizontally. */
  readonly flipX: boolean;
}

export interface SpriteComposition {
  readonly canvas: { readonly width: number; readonly height: number };
  /** Back to front. */
  readonly layers: readonly SpriteLayer[];
  readonly palette: Palette;
  /** Reference-colour to palette-colour pairs, ready for a palette swap. */
  readonly colorMappings: readonly ColorMapping[];
  /** Whole-sprite scale from the `size` gene, already folded into each layer. */
  readonly sizeScale: number;
  /**
   * Stable key for this exact appearance. Two monsters that look the same
   * share it, which makes it a safe cache key for a rendered sprite.
   */
  readonly key: string;
}

export interface AppearanceConfig {
  readonly rigs: Readonly<Record<BodyShape, BodyRig>>;
  readonly sizeScales: Readonly<Record<BodySize, number>>;
  readonly bodyPalettes: Readonly<Record<BodyColor, HidePalette>>;
  readonly elementAccents: Readonly<Record<Element, string>>;
  /** Horn and claw colour, shared by every monster. */
  readonly keratin: Ramp;
  /** Default eye colour, used unless the eyes glow. */
  readonly eye: Ramp;
  /** Per-asset size corrections. See `PART_SCALES`. */
  readonly partScales: Readonly<Record<string, number>>;
  /** Wings drawn behind the body rather than in front. */
  readonly wingsBehind: Readonly<Record<WingType, boolean>>;
}

export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  rigs: BODY_RIGS,
  sizeScales: SIZE_SCALES,
  bodyPalettes: BODY_PALETTES,
  elementAccents: ELEMENT_ACCENTS,
  keratin: KERATIN_RAMP,
  eye: EYE_RAMP,
  partScales: PART_SCALES,
  wingsBehind: {
    none: true,
    feathered: true,
    membrane: true,
    crystal: true,
    // Ethereal wings read as a glow around the creature, so they sit in front.
    ethereal: false,
  },
};

export function createAppearanceConfig(
  overrides: Partial<AppearanceConfig> = {},
): AppearanceConfig {
  return { ...DEFAULT_APPEARANCE_CONFIG, ...overrides };
}

/** Values that mean "nothing to draw" for their slot. */
function isAbsent(value: HornType | WingType | TailType | CrestType | JawType): boolean {
  // A 'normal' jaw is part of the body sprite, not a separate layer.
  return value === 'none' || value === 'normal';
}

/**
 * Builds the layer stack for a phenotype.
 *
 * Pure: the same phenotype always produces the same composition, which is what
 * makes `key` usable as a sprite cache key.
 */
export function composeAppearance(
  phenotype: MonsterPhenotype,
  config: AppearanceConfig = DEFAULT_APPEARANCE_CONFIG,
): SpriteComposition {
  const rig = config.rigs[phenotype.bodyShape];
  const sizeScale = config.sizeScales[phenotype.size];
  const flipX = rig.facing === 'right';

  const headScale = sizeScale * rig.headScale;
  const limbScale = sizeScale * rig.limbScale;

  const layers: SpriteLayer[] = [];
  const push = (
    kind: LayerKind,
    part: string,
    anchor: Point,
    scale: number,
  ): void => {
    // Slot scale, then this shape's correction, then the asset's own.
    const corrected =
      scale * (rig.partScale?.[kind] ?? 1) * (config.partScales[part] ?? 1);
    layers.push({
      kind,
      part,
      z: LAYER_ORDER.indexOf(kind),
      anchor,
      scale: Math.round(corrected * 1000) / 1000,
      flipX,
    });
  };

  const wingsBehind = config.wingsBehind[phenotype.wings] ?? true;

  if (!isAbsent(phenotype.wings)) {
    push(
      wingsBehind ? 'wings-back' : 'wings-front',
      `wings/${phenotype.wings}`,
      scaleAnchor(rig.anchors.wings, sizeScale),
      limbScale,
    );
  }

  if (!isAbsent(phenotype.tail)) {
    push('tail', `tail/${phenotype.tail}`, scaleAnchor(rig.anchors.tail, sizeScale), limbScale);
  }

  push('body', `body/${phenotype.bodyShape}`, scaleAnchor(rig.origin, sizeScale), sizeScale);

  if (!isAbsent(phenotype.jaw)) {
    push('jaw', `jaw/${phenotype.jaw}`, scaleAnchor(rig.anchors.jaw, sizeScale), headScale);
  }

  push('eyes', `eyes/${phenotype.eyes}`, scaleAnchor(rig.anchors.eyes, sizeScale), headScale);

  if (!isAbsent(phenotype.horns)) {
    push('horns', `horns/${phenotype.horns}`, scaleAnchor(rig.anchors.horns, sizeScale), headScale);
  }

  if (!isAbsent(phenotype.crest)) {
    push('crest', `crest/${phenotype.crest}`, scaleAnchor(rig.anchors.crest, sizeScale), headScale);
  }

  layers.sort((a, b) => a.z - b.z);

  const hide = config.bodyPalettes[phenotype.bodyColor];
  const accent = config.elementAccents[phenotype.element];
  const palette: Palette = {
    outline: hide.outline,
    body: hide.body,
    belly: hide.belly,
    keratin: config.keratin,
    membrane: hide.membrane,
    // A glowing eye is the one place the element reaches the creature itself.
    eye:
      phenotype.eyes === 'glowing'
        ? { shade: hide.outline, base: accent, light: '#ffffff' }
        : config.eye,
    accent,
  };

  return {
    canvas: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    layers,
    palette,
    colorMappings: colorMappings(palette),
    sizeScale,
    key: appearanceKey(phenotype),
  };
}

/**
 * Scales an anchor about the canvas centre, so a giant's horn stays on its
 * head instead of drifting off the enlarged body.
 */
function scaleAnchor(point: Point, scale: number): Point {
  const centre = CANVAS_SIZE / 2;
  return {
    x: round2(centre + (point.x - centre) * scale),
    y: round2(centre + (point.y - centre) * scale),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A stable identifier for an appearance. Only the loci that are drawn go into
 * it, so two monsters whose stats differ but whose look is identical share a
 * cached sprite.
 */
export function appearanceKey(phenotype: MonsterPhenotype): string {
  return [
    phenotype.bodyShape,
    phenotype.bodyColor,
    phenotype.size,
    phenotype.horns,
    phenotype.wings,
    phenotype.tail,
    phenotype.eyes,
    phenotype.crest,
    phenotype.jaw,
    phenotype.element,
  ].join('/');
}

/**
 * Every asset key the renderer can ever be asked for.
 *
 * This is the artwork checklist: draw one sprite per entry and no fusion, at
 * any generation, can ask for a part that does not exist. Body colour is a
 * palette swap and size is a scale, so neither multiplies this list.
 */
export function requiredPartKeys(
  config: AppearanceConfig = DEFAULT_APPEARANCE_CONFIG,
): string[] {
  const keys: string[] = [];
  for (const shape of Object.keys(config.rigs) as BodyShape[]) keys.push(`body/${shape}`);
  for (const value of ['single', 'twin', 'crown', 'spiral'] satisfies HornType[]) {
    keys.push(`horns/${value}`);
  }
  for (const value of ['feathered', 'membrane', 'crystal', 'ethereal'] satisfies WingType[]) {
    keys.push(`wings/${value}`);
  }
  for (const value of ['short', 'long', 'spiked', 'twin', 'vine'] satisfies TailType[]) {
    keys.push(`tail/${value}`);
  }
  for (const value of ['normal', 'sharp', 'round', 'multi', 'glowing', 'slit'] satisfies EyeType[]) {
    keys.push(`eyes/${value}`);
  }
  for (const value of ['flower', 'fin', 'crystal', 'mane', 'antenna', 'crown'] satisfies CrestType[]) {
    keys.push(`crest/${value}`);
  }
  for (const value of ['fangs', 'tusks', 'beak', 'maw'] satisfies JawType[]) {
    keys.push(`jaw/${value}`);
  }
  return keys;
}
