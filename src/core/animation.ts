/**
 * Sprite animation.
 *
 * Takes the layer stack from `composeAppearance` and a time in milliseconds,
 * and returns where every layer sits at that instant. It draws nothing and
 * keeps no clock of its own - the caller passes the time - so a pose is a pure
 * function of (appearance, animation, time) and can be asserted in a test.
 *
 * The reason this is worth doing at all: the parts are separate layers, so
 * they can move at different times. A tail that lags a few frames behind the
 * body, wings that keep flapping after the body stops - that trailing motion
 * is what made DS-era sprites feel alive, and a single flat image cannot do
 * it at any frame rate. None of it needs extra artwork.
 *
 * Three clips, matching what a battle needs:
 *
 * - `idle`   breathing, with the head riding on the chest and a blink that
 *            does not fall on a metronome.
 * - `attack` anticipation, lunge, recovery - with the tail and wings arriving
 *            late, which is where the weight comes from.
 * - `hurt`   a short recoil and flash, so a hit reads as a hit.
 */

import type { LayerKind, SpriteComposition, SpriteLayer } from './appearance.ts';

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export type AnimationName = 'idle' | 'attack' | 'hurt';

/**
 * How one layer is displaced this frame.
 *
 * The renderer applies these about the layer's anchor, in this order:
 * translate to the anchor, rotate, scale, then draw the part so its origin is
 * at the anchor.
 */
export interface PoseTransform {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  /** Degrees, clockwise, about the layer's anchor. */
  readonly rotation: number;
  readonly opacity: number;
  /** Swap in another asset for this frame, e.g. a closed-eye sprite. */
  readonly partOverride?: string;
}

export interface PosedLayer extends SpriteLayer {
  readonly transform: PoseTransform;
}

export interface Pose {
  readonly animation: AnimationName;
  /** Milliseconds into the clip, after looping. */
  readonly elapsed: number;
  /** 0..1 through the clip. Stays at 1 for a finished one-shot. */
  readonly progress: number;
  readonly finished: boolean;
  readonly layers: readonly PosedLayer[];
  /** White flash, 0..1. The renderer composites this over the whole sprite. */
  readonly flash: number;
}

export const REST_TRANSFORM: PoseTransform = {
  offsetX: 0,
  offsetY: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  opacity: 1,
};

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** How a layer responds to the body's motion. */
export interface LayerMotion {
  /** 0..1 share of the body's displacement this layer inherits. */
  readonly follow: number;
  /** Milliseconds this layer trails the body by. This is the secondary motion. */
  readonly lagMs: number;
  /** 0..1 share of the breathing squash this layer takes on itself. */
  readonly breathe: number;
  /** Degrees of sway added at the extremes of a motion. */
  readonly sway: number;
}

export const DEFAULT_LAYER_MOTION: Readonly<Record<LayerKind, LayerMotion>> = {
  // The body leads; everything else is measured against it.
  body: { follow: 1, lagMs: 0, breathe: 1, sway: 0 },
  // Head furniture rides on the chest: it moves with the body but does not
  // squash with it, or a horn would visibly stretch.
  eyes: { follow: 1, lagMs: 10, breathe: 0, sway: 0 },
  jaw: { follow: 1, lagMs: 10, breathe: 0, sway: 0 },
  horns: { follow: 1, lagMs: 25, breathe: 0, sway: 1.5 },
  crest: { follow: 1, lagMs: 45, breathe: 0, sway: 4 },
  // The trailing parts. Their lag is what sells the weight.
  tail: { follow: 0.85, lagMs: 110, breathe: 0, sway: 7 },
  'wings-back': { follow: 0.9, lagMs: 70, breathe: 0, sway: 5 },
  'wings-front': { follow: 0.9, lagMs: 70, breathe: 0, sway: 5 },
};

export interface AnimationConfig {
  readonly motion: Readonly<Record<LayerKind, LayerMotion>>;
  /** Full breath cycle, milliseconds. */
  readonly breathPeriodMs: number;
  /** Peak vertical squash of the body, as a fraction. */
  readonly breathAmplitude: number;
  /** How far the chest rises, in canvas pixels. */
  readonly breathLiftPx: number;
  /** Average gap between blinks. */
  readonly blinkIntervalMs: number;
  /** How much the gap wanders, so blinking is not a metronome. */
  readonly blinkJitterMs: number;
  readonly blinkDurationMs: number;
  /**
   * `squash` flattens the eye layer and needs no extra art. `swap` draws
   * `eyes/<type>-closed` instead, if the UI has that sprite.
   */
  readonly blinkStyle: 'squash' | 'swap';
  readonly attackDurationMs: number;
  /** How far the attacker lunges, in canvas pixels. */
  readonly attackReachPx: number;
  /** How far it winds up first. Anticipation is what makes a lunge read. */
  readonly attackAnticipationPx: number;
  readonly hurtDurationMs: number;
  readonly hurtRecoilPx: number;
}

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  motion: DEFAULT_LAYER_MOTION,
  breathPeriodMs: 2600,
  breathAmplitude: 0.045,
  breathLiftPx: 0.9,
  blinkIntervalMs: 3400,
  blinkJitterMs: 1500,
  blinkDurationMs: 130,
  blinkStyle: 'squash',
  attackDurationMs: 520,
  attackReachPx: 9,
  attackAnticipationPx: 3.5,
  hurtDurationMs: 340,
  hurtRecoilPx: 4,
};

export function createAnimationConfig(
  overrides: Partial<AnimationConfig> = {},
): AnimationConfig {
  return {
    ...DEFAULT_ANIMATION_CONFIG,
    ...overrides,
    motion: { ...DEFAULT_LAYER_MOTION, ...(overrides.motion ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function easeOutCubic(t: number): number {
  const inverted = 1 - clamp01(t);
  return 1 - inverted * inverted * inverted;
}

function easeInCubic(t: number): number {
  const x = clamp01(t);
  return x * x * x;
}

/** 0 at both ends, 1 in the middle. For a there-and-back motion. */
function arc(t: number): number {
  return Math.sin(clamp01(t) * Math.PI);
}

/** Deterministic 0..1 from an integer. Keeps blinks irregular but reproducible. */
function hash01(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

// ---------------------------------------------------------------------------
// The body's motion, which everything else is derived from
// ---------------------------------------------------------------------------

interface BodyMotion {
  readonly offsetX: number;
  readonly offsetY: number;
  /** Vertical squash, 1 is at rest. */
  readonly squash: number;
  /** -1..1, drives the sway of trailing parts. */
  readonly lean: number;
}

const AT_REST: BodyMotion = { offsetX: 0, offsetY: 0, squash: 1, lean: 0 };

function breatheAt(timeMs: number, config: AnimationConfig): BodyMotion {
  const phase = (timeMs % config.breathPeriodMs) / config.breathPeriodMs;
  const wave = Math.sin(phase * Math.PI * 2);
  return {
    offsetX: 0,
    offsetY: -wave * config.breathLiftPx,
    // Volume is roughly preserved: as the chest rises it narrows a little.
    squash: 1 + wave * config.breathAmplitude,
    lean: wave * 0.25,
  };
}

function attackAt(timeMs: number, config: AnimationConfig): BodyMotion {
  const t = clamp01(timeMs / config.attackDurationMs);

  // Wind up, strike, recover. The anticipation is deliberately slow and the
  // strike fast; equal timing reads as a drift, not a hit.
  if (t < 0.32) {
    const local = easeOutCubic(t / 0.32);
    return {
      offsetX: local * config.attackAnticipationPx,
      offsetY: local * -1,
      squash: 1 - local * 0.06,
      lean: -local,
    };
  }

  if (t < 0.5) {
    const local = easeInCubic((t - 0.32) / 0.18);
    const from = config.attackAnticipationPx;
    return {
      offsetX: from + (-config.attackReachPx - from) * local,
      offsetY: -1 + local * 1,
      squash: 1 - 0.06 + local * 0.14,
      lean: -1 + local * 2,
    };
  }

  const local = easeOutCubic((t - 0.5) / 0.5);
  return {
    offsetX: -config.attackReachPx * (1 - local),
    offsetY: 0,
    squash: 1 + 0.08 * (1 - local),
    lean: 1 - local,
  };
}

function hurtAt(timeMs: number, config: AnimationConfig): BodyMotion {
  const t = clamp01(timeMs / config.hurtDurationMs);
  const shove = easeOutCubic(Math.min(1, t / 0.25)) * (1 - easeInCubic(t));
  return {
    offsetX: shove * config.hurtRecoilPx,
    offsetY: 0,
    squash: 1 - shove * 0.08,
    lean: shove,
  };
}

function bodyMotionAt(
  animation: AnimationName,
  timeMs: number,
  config: AnimationConfig,
): BodyMotion {
  // A negative time means the layer's lag reaches back before the clip began,
  // where it was simply at rest.
  if (timeMs < 0) return animation === 'idle' ? breatheAt(timeMs, config) : AT_REST;

  switch (animation) {
    case 'idle':
      return breatheAt(timeMs, config);
    case 'attack':
      return attackAt(timeMs, config);
    case 'hurt':
      return hurtAt(timeMs, config);
  }
}

// ---------------------------------------------------------------------------
// Blinking
// ---------------------------------------------------------------------------

/**
 * Whether the eyes are shut at this instant.
 *
 * Blinks are spaced by a jittered interval derived from the blink's index, so
 * they are irregular to watch but identical on every replay.
 */
export function isBlinking(
  timeMs: number,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG,
  phase = 0,
): boolean {
  if (timeMs < 0) return false;
  const base = config.blinkIntervalMs;
  if (base <= 0) return false;

  // Walk forward over blink slots; the jitter only shifts within a slot, so a
  // handful of iterations always covers the time asked about.
  const index = Math.floor(timeMs / base);
  for (const candidate of [index - 1, index]) {
    if (candidate < 0) continue;
    const jitter = (hash01(candidate + phase * 7919) - 0.5) * config.blinkJitterMs;
    const start = candidate * base + base * 0.5 + jitter;
    if (timeMs >= start && timeMs < start + config.blinkDurationMs) return true;
  }
  return false;
}

/** How shut the eyes are, 0..1, eased so the lid does not snap. */
function blinkAmount(
  timeMs: number,
  config: AnimationConfig,
  phase: number,
): number {
  if (!isBlinking(timeMs, config, phase)) return 0;
  const base = config.blinkIntervalMs;
  const index = Math.floor(timeMs / base);
  for (const candidate of [index - 1, index]) {
    if (candidate < 0) continue;
    const jitter = (hash01(candidate + phase * 7919) - 0.5) * config.blinkJitterMs;
    const start = candidate * base + base * 0.5 + jitter;
    if (timeMs >= start && timeMs < start + config.blinkDurationMs) {
      return arc((timeMs - start) / config.blinkDurationMs);
    }
  }
  return 0;
}

/** Eyes already drawn shut have nothing to close. */
function canBlink(part: string): boolean {
  return !part.endsWith('/slit');
}

// ---------------------------------------------------------------------------
// Posing
// ---------------------------------------------------------------------------

export interface PoseOptions {
  readonly animation?: AnimationName;
  /** Milliseconds since the clip started. */
  readonly timeMs: number;
  /**
   * Offsets this monster's idle cycle so a party does not breathe and blink in
   * unison. Any stable number works; the appearance key's length is a decent
   * one, or the combatant's index.
   */
  readonly phase?: number;
  /** Mirrors the clip for a combatant facing the other way. */
  readonly facingRight?: boolean;
}

function clipLength(animation: AnimationName, config: AnimationConfig): number {
  switch (animation) {
    case 'idle':
      return config.breathPeriodMs;
    case 'attack':
      return config.attackDurationMs;
    case 'hurt':
      return config.hurtDurationMs;
  }
}

/**
 * Where every layer sits at `timeMs`.
 *
 * `idle` loops; `attack` and `hurt` run once and hold their last frame, with
 * `finished` set so the caller knows to go back to idle.
 */
export function poseAt(
  composition: SpriteComposition,
  options: PoseOptions,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG,
): Pose {
  const animation = options.animation ?? 'idle';
  const phase = options.phase ?? 0;
  const mirror = options.facingRight ? -1 : 1;
  const length = clipLength(animation, config);

  const raw = Math.max(0, options.timeMs);
  const looping = animation === 'idle';
  const elapsed = looping ? (raw + phase) % length : Math.min(raw, length);
  const finished = !looping && raw >= length;
  const progress = length > 0 ? clamp01(elapsed / length) : 1;

  // `elapsed` is the clip's own clock: wrapped for a loop, clamped for a
  // one-shot, so a finished clip keeps holding its final frame.
  const clock = elapsed;

  const layers: PosedLayer[] = composition.layers.map((layer) => {
    const motion = config.motion[layer.kind] ?? DEFAULT_LAYER_MOTION.body;
    // Each layer reads the body's motion from slightly in the past. That delay
    // is the secondary motion: the tail arrives after the body has moved.
    const lagged = bodyMotionAt(animation, clock - motion.lagMs, config);

    const offsetX = lagged.offsetX * motion.follow * mirror;
    const offsetY = lagged.offsetY * motion.follow;

    // Squash applies to the body; the parts riding on it only translate, or a
    // horn would stretch with the chest.
    const squash = 1 + (lagged.squash - 1) * motion.breathe;
    const scaleY = squash;
    const scaleX = motion.breathe > 0 ? 1 - (squash - 1) * 0.6 : 1;

    let rotation = lagged.lean * motion.sway * mirror;
    let partOverride: string | undefined;
    let eyeScaleY = 1;

    if (layer.kind === 'eyes' && canBlink(layer.part)) {
      const shut = blinkAmount(clock, config, phase);
      if (shut > 0) {
        if (config.blinkStyle === 'swap') partOverride = `${layer.part}-closed`;
        else eyeScaleY = Math.max(0.08, 1 - shut);
      }
    }

    if (animation === 'hurt' && layer.kind === 'body') {
      // A small tilt on the hit, nothing more; the recoil carries the read.
      rotation += lagged.lean * 2 * mirror;
    }

    const transform: PoseTransform = {
      offsetX: round3(offsetX),
      offsetY: round3(offsetY),
      scaleX: round3(scaleX),
      scaleY: round3(scaleY * eyeScaleY),
      rotation: round3(rotation),
      opacity: 1,
      ...(partOverride ? { partOverride } : {}),
    };

    return { ...layer, transform };
  });

  return {
    animation,
    elapsed: round3(elapsed),
    progress: round3(progress),
    finished,
    layers,
    flash: animation === 'hurt' ? round3(Math.max(0, 1 - progress * 4)) : 0,
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Every layer at rest. Useful for a roster thumbnail or a paused frame. */
export function restPose(composition: SpriteComposition): Pose {
  return {
    animation: 'idle',
    elapsed: 0,
    progress: 0,
    finished: false,
    layers: composition.layers.map((layer) => ({ ...layer, transform: REST_TRANSFORM })),
    flash: 0,
  };
}

/** How long a clip runs, for sequencing a battle's turn against it. */
export function animationDuration(
  animation: AnimationName,
  config: AnimationConfig = DEFAULT_ANIMATION_CONFIG,
): number {
  return clipLength(animation, config);
}
