import assert from 'node:assert/strict';
import { test } from 'node:test';

import { composeAppearance } from '../src/core/appearance.ts';
import {
  animationDuration,
  createAnimationConfig,
  DEFAULT_ANIMATION_CONFIG,
  isBlinking,
  poseAt,
  restPose,
} from '../src/core/animation.ts';
import type { AnimationName, Pose } from '../src/core/animation.ts';
import { createStarterMonsters } from '../src/core/starters.ts';
import type { MonsterPhenotype } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

const winged: MonsterPhenotype = {
  bodyColor: 'red',
  bodyShape: 'muscular',
  size: 'medium',
  horns: 'spiral',
  wings: 'membrane',
  tail: 'spiked',
  eyes: 'round',
  crest: 'mane',
  jaw: 'fangs',
  element: 'fire',
  attackTendency: 70,
  defenseTendency: 50,
  magicTendency: 30,
  speedTendency: 40,
};

const composition = composeAppearance(winged);

function layer(pose: Pose, kind: string) {
  const found = pose.layers.find((l) => l.kind === kind);
  assert.ok(found, `no ${kind} layer`);
  return found;
}

test('a pose is a pure function of appearance, clip and time', () => {
  const a = poseAt(composition, { animation: 'attack', timeMs: 180 });
  const b = poseAt(composition, { animation: 'attack', timeMs: 180 });
  assert.deepEqual(a, b);
});

test('every layer survives posing, in the same order', () => {
  const pose = poseAt(composition, { timeMs: 500 });
  assert.equal(pose.layers.length, composition.layers.length);
  assert.deepEqual(
    pose.layers.map((l) => l.part),
    composition.layers.map((l) => l.part),
  );
  for (const posed of pose.layers) {
    for (const value of [
      posed.transform.offsetX,
      posed.transform.offsetY,
      posed.transform.scaleX,
      posed.transform.scaleY,
      posed.transform.rotation,
    ]) {
      assert.ok(Number.isFinite(value), `${posed.part} produced ${value}`);
    }
    assert.ok(posed.transform.scaleY > 0, `${posed.part} collapsed`);
  }
});

test('breathing moves the body and loops', () => {
  const period = DEFAULT_ANIMATION_CONFIG.breathPeriodMs;
  const quarter = poseAt(composition, { timeMs: period * 0.25 });
  const threeQuarter = poseAt(composition, { timeMs: period * 0.75 });

  const up = layer(quarter, 'body').transform;
  const down = layer(threeQuarter, 'body').transform;

  assert.ok(up.offsetY < 0, 'the chest rises on the in-breath');
  assert.ok(down.offsetY > 0, 'and falls on the out-breath');
  assert.ok(up.scaleY > 1 && up.scaleX < 1, 'rising narrows the body');

  // One full period later, the pose repeats.
  const start = poseAt(composition, { timeMs: 0 });
  const looped = poseAt(composition, { timeMs: period });
  assert.deepEqual(start.layers, looped.layers);
});

test('breathing stays subtle', () => {
  const period = DEFAULT_ANIMATION_CONFIG.breathPeriodMs;
  for (let t = 0; t <= period; t += 40) {
    const body = layer(poseAt(composition, { timeMs: t }), 'body').transform;
    assert.ok(Math.abs(body.offsetY) <= 1.5, `lift ${body.offsetY} is too big`);
    assert.ok(Math.abs(body.scaleY - 1) <= 0.06, `squash ${body.scaleY} is too big`);
  }
});

test('head parts ride the body without squashing with it', () => {
  const pose = poseAt(composition, { timeMs: DEFAULT_ANIMATION_CONFIG.breathPeriodMs * 0.25 });
  const body = layer(pose, 'body').transform;
  const horns = layer(pose, 'horns').transform;

  assert.ok(horns.offsetY < 0, 'the horns rise with the chest');
  assert.equal(horns.scaleY, 1, 'a horn must not stretch with the lungs');
  assert.notEqual(body.scaleY, 1);
});

test('the tail trails the body instead of moving with it', () => {
  // Halfway through the strike the body is already committed; the tail, lagged
  // by over 100ms, is still catching up.
  const pose = poseAt(composition, { animation: 'attack', timeMs: 180 });
  const body = layer(pose, 'body').transform;
  const tail = layer(pose, 'tail').transform;

  assert.notEqual(tail.offsetX, body.offsetX, 'a tail that moves in lockstep is a flat image');
  assert.ok(
    Math.abs(tail.offsetX) < Math.abs(body.offsetX),
    'the tail should be behind the body, not ahead of it',
  );
  assert.notEqual(tail.rotation, 0, 'trailing parts sway');
});

test('wings also trail, and do so in both layers', () => {
  const pose = poseAt(composition, { animation: 'attack', timeMs: 200 });
  const wings = pose.layers.find((l) => l.kind === 'wings-back' || l.kind === 'wings-front');
  assert.ok(wings);
  const body = layer(pose, 'body').transform;
  assert.notEqual(wings.transform.offsetX, body.offsetX);
});

test('an attack winds up before it lunges', () => {
  const duration = DEFAULT_ANIMATION_CONFIG.attackDurationMs;
  const windUp = layer(poseAt(composition, { animation: 'attack', timeMs: duration * 0.2 }), 'body');
  const strike = layer(poseAt(composition, { animation: 'attack', timeMs: duration * 0.5 }), 'body');

  assert.ok(windUp.transform.offsetX > 0, 'it pulls back first');
  assert.ok(strike.transform.offsetX < 0, 'then drives forward past the start');
  assert.ok(
    Math.abs(strike.transform.offsetX) > Math.abs(windUp.transform.offsetX),
    'the strike must outreach the anticipation',
  );
});

test('a one-shot clip ends at rest and reports that it is done', () => {
  for (const animation of ['attack', 'hurt'] as const) {
    const duration = animationDuration(animation);
    const mid = poseAt(composition, { animation, timeMs: duration * 0.4 });
    const end = poseAt(composition, { animation, timeMs: duration });
    const after = poseAt(composition, { animation, timeMs: duration * 3 });

    assert.equal(mid.finished, false);
    assert.equal(end.finished, true);
    assert.deepEqual(after.layers, end.layers, 'a finished clip holds its last frame');

    const body = layer(end, 'body').transform;
    assert.ok(Math.abs(body.offsetX) < 0.5, `${animation} did not return to rest`);
    assert.ok(Math.abs(body.offsetY) < 0.5);
  }
});

test('idle never finishes', () => {
  assert.equal(poseAt(composition, { timeMs: 10_000_000 }).finished, false);
});

test('being hurt recoils and flashes, then settles', () => {
  const duration = animationDuration('hurt');
  const hit = poseAt(composition, { animation: 'hurt', timeMs: 20 });
  const settled = poseAt(composition, { animation: 'hurt', timeMs: duration });

  assert.ok(layer(hit, 'body').transform.offsetX > 0, 'knocked back');
  assert.ok(hit.flash > 0.5, 'and flashed');
  assert.equal(settled.flash, 0, 'the flash is over well before the clip is');
  assert.equal(poseAt(composition, { timeMs: 0 }).flash, 0, 'idle never flashes');
});

test('the monster blinks, briefly and irregularly', () => {
  const window = 30_000;
  const blinks: number[] = [];
  let wasBlinking = false;
  for (let t = 0; t < window; t += 10) {
    const now = isBlinking(t);
    if (now && !wasBlinking) blinks.push(t);
    wasBlinking = now;
  }

  const expected = window / DEFAULT_ANIMATION_CONFIG.blinkIntervalMs;
  assert.ok(blinks.length >= expected - 2, `only ${blinks.length} blinks in 30s`);
  assert.ok(blinks.length <= expected + 2, `${blinks.length} blinks in 30s is too many`);

  const gaps = blinks.slice(1).map((t, i) => t - (blinks[i] as number));
  assert.ok(new Set(gaps).size > 1, 'evenly spaced blinks read as a metronome');

  // Eyes are open the overwhelming majority of the time.
  let shut = 0;
  for (let t = 0; t < window; t += 10) if (isBlinking(t)) shut += 10;
  assert.ok(shut / window < 0.08, `eyes shut ${((shut / window) * 100).toFixed(1)}% of the time`);
});

test('a blink closes the eye layer and nothing else', () => {
  let blinkTime = -1;
  for (let t = 0; t < 10_000; t += 10) {
    if (isBlinking(t)) { blinkTime = t; break; }
  }
  assert.ok(blinkTime >= 0, 'no blink found');

  const pose = poseAt(composition, { timeMs: blinkTime });
  assert.ok(layer(pose, 'eyes').transform.scaleY < 1, 'the eyes narrow');
  assert.equal(layer(pose, 'horns').transform.scaleY, 1, 'the horns do not');
});

test('eyes already drawn shut do not blink', () => {
  const slit = composeAppearance({ ...winged, eyes: 'slit' });
  for (let t = 0; t < 20_000; t += 50) {
    assert.equal(
      layer(poseAt(slit, { timeMs: t }), 'eyes').transform.scaleY,
      1,
      `slit eyes closed at ${t}ms`,
    );
  }
});

test('the swap style names a closed sprite instead of squashing', () => {
  const config = createAnimationConfig({ blinkStyle: 'swap' });
  let found = false;
  for (let t = 0; t < 10_000; t += 10) {
    const eyes = layer(poseAt(composition, { timeMs: t }, config), 'eyes');
    if (eyes.transform.partOverride) {
      assert.equal(eyes.transform.partOverride, 'eyes/round-closed');
      assert.equal(eyes.transform.scaleY, 1, 'a swapped sprite must not also squash');
      found = true;
      break;
    }
  }
  assert.ok(found, 'no blink produced a swap');
});

test('phase keeps a party from breathing in unison', () => {
  const a = poseAt(composition, { timeMs: 400, phase: 0 });
  const b = poseAt(composition, { timeMs: 400, phase: 900 });
  assert.notDeepEqual(a.layers, b.layers);
});

test('facing right mirrors the motion', () => {
  const left = poseAt(composition, { animation: 'attack', timeMs: 200 });
  const right = poseAt(composition, { animation: 'attack', timeMs: 200, facingRight: true });
  assert.equal(
    layer(right, 'body').transform.offsetX,
    -layer(left, 'body').transform.offsetX,
  );
});

test('the rest pose is flat', () => {
  const pose = restPose(composition);
  for (const posed of pose.layers) {
    assert.deepEqual(posed.transform, {
      offsetX: 0,
      offsetY: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
    });
  }
});

test('timings are configurable', () => {
  const config = createAnimationConfig({ attackDurationMs: 1000, breathPeriodMs: 1000 });
  assert.equal(animationDuration('attack', config), 1000);
  assert.equal(
    poseAt(composition, { animation: 'attack', timeMs: 900 }, config).finished,
    false,
  );
});

test('every starter and every clip poses without a hitch', () => {
  const context = testContext(5);
  const clips: AnimationName[] = ['idle', 'attack', 'hurt'];
  for (const monster of createStarterMonsters(context)) {
    const parts = composeAppearance(monster.phenotype);
    for (const animation of clips) {
      for (let t = 0; t <= animationDuration(animation); t += 20) {
        const pose = poseAt(parts, { animation, timeMs: t });
        assert.equal(pose.layers.length, parts.layers.length);
      }
    }
  }
});

test('a negative or zero time is safe', () => {
  assert.doesNotThrow(() => poseAt(composition, { timeMs: -500 }));
  assert.doesNotThrow(() => poseAt(composition, { animation: 'attack', timeMs: 0 }));
  assert.equal(isBlinking(-100), false);
});
