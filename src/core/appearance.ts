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
      head: { x: 32, y: 30 },
      eyes: { x: 31, y: 33 },
      jaw: { x: 31, y: 41 },
      crest: { x: 32, y: 20 },
      horns: { x: 32, y: 23 },
      wings: { x: 36, y: 34 },
      tail: { x: 47, y: 42 },
    },
    headScale: 1,
    limbScale: 1,
    facing: 'left',
  },
  slim: {
    origin: { x: 32, y: 36 },
    anchors: {
      body: { x: 32, y: 36 },
      head: { x: 31, y: 22 },
      eyes: { x: 30, y: 24 },
      jaw: { x: 30, y: 29 },
      crest: { x: 31, y: 13 },
      horns: { x: 31, y: 16 },
      wings: { x: 36, y: 31 },
      tail: { x: 44, y: 46 },
    },
    headScale: 0.8,
    limbScale: 0.95,
    facing: 'left',
  },
  muscular: {
    origin: { x: 32, y: 38 },
    anchors: {
      body: { x: 32, y: 38 },
      head: { x: 30, y: 24 },
      eyes: { x: 29, y: 26 },
      jaw: { x: 29, y: 31 },
      crest: { x: 30, y: 14 },
      horns: { x: 30, y: 17 },
      wings: { x: 38, y: 32 },
      tail: { x: 48, y: 44 },
    },
    headScale: 1,
    limbScale: 1.1,
    facing: 'left',
  },
  serpentine: {
    origin: { x: 32, y: 40 },
    anchors: {
      body: { x: 32, y: 40 },
      head: { x: 26, y: 20 },
      eyes: { x: 25, y: 22 },
      jaw: { x: 25, y: 26 },
      crest: { x: 26, y: 11 },
      horns: { x: 26, y: 14 },
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
      head: { x: 31, y: 23 },
      eyes: { x: 30, y: 25 },
      jaw: { x: 30, y: 30 },
      crest: { x: 31, y: 14 },
      horns: { x: 31, y: 17 },
      wings: { x: 34, y: 28 },
      tail: { x: 45, y: 45 },
    },
    headScale: 0.85,
    limbScale: 1.15,
    facing: 'left',
  },
  finned: {
    origin: { x: 32, y: 38 },
    anchors: {
      body: { x: 32, y: 38 },
      head: { x: 26, y: 32 },
      eyes: { x: 26, y: 30 },
      jaw: { x: 24, y: 38 },
      crest: { x: 32, y: 24 },
      horns: { x: 28, y: 26 },
      wings: { x: 36, y: 34 },
      tail: { x: 50, y: 38 },
    },
    headScale: 0.9,
    limbScale: 1,
    facing: 'left',
  },
};

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

/**
 * The four tones a part is authored in. The renderer swaps these exact values
 * for the monster's own palette, so one sprite serves every body colour.
 */
export interface Palette {
  readonly outline: string;
  readonly shade: string;
  readonly base: string;
  readonly light: string;
  /** Element tint for glows, gems and energy. Not used for the body itself. */
  readonly accent: string;
}

/**
 * The reference ramp every part asset must be drawn in. Deliberately a set of
 * flat, unmistakable values so a mis-coloured pixel is obvious in review.
 */
export const REFERENCE_PALETTE: Palette = {
  outline: '#1b2030',
  shade: '#4a4a6a',
  base: '#8a8ab0',
  light: '#c8c8e0',
  accent: '#ff00ff',
};

export const BODY_PALETTES: Readonly<Record<BodyColor, Omit<Palette, 'accent'>>> = {
  red: { outline: '#2a1016', shade: '#8c2020', base: '#d6402e', light: '#f58a5a' },
  blue: { outline: '#0e1b32', shade: '#1b4a8c', base: '#2e7ad6', light: '#6fb8f5' },
  green: { outline: '#122a14', shade: '#2a6b2e', base: '#4aa83c', light: '#8fd96a' },
  yellow: { outline: '#33280c', shade: '#9c7a14', base: '#e0b526', light: '#f7e07a' },
  purple: { outline: '#201033', shade: '#5a2a8c', base: '#8f4ad6', light: '#c08af5' },
  white: { outline: '#2a2a33', shade: '#9a9aa8', base: '#dcdce6', light: '#ffffff' },
  black: { outline: '#08080c', shade: '#2a2a36', base: '#44445a', light: '#70708c' },
};

export const ELEMENT_ACCENTS: Readonly<Record<Element, string>> = {
  neutral: '#cfd6e0',
  fire: '#ff8a2b',
  water: '#36cfe0',
  earth: '#c08a3a',
  wind: '#9ae86a',
  light: '#ffe98a',
  dark: '#9a5ad6',
};

/** The palette a monster's parts are recoloured to. */
export function paletteFor(bodyColor: BodyColor, element: Element): Palette {
  return { ...BODY_PALETTES[bodyColor], accent: ELEMENT_ACCENTS[element] };
}

/** One reference colour and what it becomes. The renderer applies these. */
export interface ColorMapping {
  readonly from: string;
  readonly to: string;
}

export function colorMappings(palette: Palette): ColorMapping[] {
  return [
    { from: REFERENCE_PALETTE.outline, to: palette.outline },
    { from: REFERENCE_PALETTE.shade, to: palette.shade },
    { from: REFERENCE_PALETTE.base, to: palette.base },
    { from: REFERENCE_PALETTE.light, to: palette.light },
    { from: REFERENCE_PALETTE.accent, to: palette.accent },
  ];
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
  readonly bodyPalettes: Readonly<Record<BodyColor, Omit<Palette, 'accent'>>>;
  readonly elementAccents: Readonly<Record<Element, string>>;
  /** Wings drawn behind the body rather than in front. */
  readonly wingsBehind: Readonly<Record<WingType, boolean>>;
}

export const DEFAULT_APPEARANCE_CONFIG: AppearanceConfig = {
  rigs: BODY_RIGS,
  sizeScales: SIZE_SCALES,
  bodyPalettes: BODY_PALETTES,
  elementAccents: ELEMENT_ACCENTS,
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
    layers.push({ kind, part, z: LAYER_ORDER.indexOf(kind), anchor, scale, flipX });
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

  const palette = {
    ...config.bodyPalettes[phenotype.bodyColor],
    accent: config.elementAccents[phenotype.element],
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
