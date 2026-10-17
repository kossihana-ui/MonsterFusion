import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  fingerprintImage,
  LocalMockMonsterAnalyzer,
  RemoteMonsterAnalyzer,
} from '../src/core/analyzer.ts';
import { createMonsterFromAnalysis } from '../src/core/fusion.ts';
import { CATEGORICAL_LOCI } from '../src/shared/types.ts';
import type { MonsterImage } from '../src/shared/types.ts';
import { testContext } from './helpers.ts';

const image: MonsterImage = { data: 'data:image/png;base64,AAAA', mimeType: 'image/png' };
const otherImage: MonsterImage = { data: 'data:image/png;base64,BBBB', mimeType: 'image/png' };

test('the local mock analyser works with no API and no key', async () => {
  const analyzer = new LocalMockMonsterAnalyzer();
  const analysis = await analyzer.analyze(image);

  for (const locus of CATEGORICAL_LOCI) {
    assert.ok(
      (analysis as unknown as Record<string, unknown>)[locus],
      `${locus} missing from the analysis`,
    );
  }
  assert.ok(analysis.confidence > 0 && analysis.confidence <= 1);
});

test('the mock is deterministic per image', async () => {
  const analyzer = new LocalMockMonsterAnalyzer();
  assert.deepEqual(await analyzer.analyze(image), await analyzer.analyze(image));
  assert.notEqual(fingerprintImage(image), fingerprintImage(otherImage));
});

test('byte payloads are fingerprinted too', () => {
  const bytes: MonsterImage = { data: new Uint8Array([1, 2, 3]), mimeType: 'image/png' };
  const otherBytes: MonsterImage = { data: new Uint8Array([3, 2, 1]), mimeType: 'image/png' };
  assert.equal(fingerprintImage(bytes), fingerprintImage({ ...bytes }));
  assert.notEqual(fingerprintImage(bytes), fingerprintImage(otherBytes));
});

test('an analysed look becomes the expressed phenotype', async () => {
  const analysis = {
    ...(await new LocalMockMonsterAnalyzer().analyze(image)),
    bodyColor: 'purple' as const,
    wings: 'crystal' as const,
    element: 'light' as const,
  };
  const monster = createMonsterFromAnalysis(analysis, testContext(3));
  assert.equal(monster.phenotype.bodyColor, 'purple');
  assert.equal(monster.phenotype.wings, 'crystal');
  assert.equal(monster.phenotype.element, 'light');
  assert.equal(monster.generation, 0);
});

test('a remote analyser overrides only the fields it returns', async () => {
  const analyzer = new RemoteMonsterAnalyzer(() =>
    Promise.resolve({ element: 'dark', confidence: 0.92 }),
  );
  const analysis = await analyzer.analyze(image);
  assert.equal(analysis.element, 'dark');
  assert.equal(analysis.confidence, 0.92);
  assert.ok(analysis.bodyColor, 'unreturned fields fall back to the mock');
});

test('a remote failure falls back to the local mock instead of throwing', async () => {
  const analyzer = new RemoteMonsterAnalyzer(() => Promise.reject(new Error('network down')));
  const analysis = await analyzer.analyze(image);
  const mock = await new LocalMockMonsterAnalyzer().analyze(image);
  assert.deepEqual(analysis, mock);
});
