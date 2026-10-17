/**
 * Visual analysis of a monster image.
 *
 * `MonsterAnalyzer` is the only thing the rest of the core knows about. The
 * prototype ships `LocalMockMonsterAnalyzer`, which needs no network and no
 * API key: it hashes the image payload into a deterministic phenotype. A real
 * provider (OpenAI or similar) can be dropped in later by implementing the
 * same interface - see `RemoteMonsterAnalyzer` below, which takes its
 * credentials from the host (environment, secret store, server proxy) and
 * never embeds them.
 */

import type {
  MonsterAnalyzer,
  MonsterImage,
  MonsterVisualAnalysis,
} from '../shared/types.ts';
import type { AllelePools } from './config.ts';
import { DEFAULT_ALLELE_POOLS } from './config.ts';
import type { Random } from './random.ts';
import { createSeededRandom, pick, seedFromString } from './random.ts';

/** Stable fingerprint of an image payload, used to seed the mock analyser. */
export function fingerprintImage(image: MonsterImage): number {
  if (typeof image.data === 'string') {
    return seedFromString(`${image.mimeType}:${image.data}`);
  }
  // FNV-1a over the bytes, mixed with the mime type.
  let hash = seedFromString(image.mimeType);
  for (let i = 0; i < image.data.length; i++) {
    hash ^= image.data[i] as number;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export interface LocalMockAnalyzerOptions {
  readonly pools?: AllelePools;
  /** Confidence the mock reports. Low by default: it is not really looking. */
  readonly confidence?: number;
  /**
   * Override the randomness. By default the analyser seeds itself from the
   * image fingerprint, so the same image always yields the same analysis.
   */
  readonly rng?: Random;
}

/**
 * Offline stand-in for an image-understanding model.
 *
 * Deterministic: the same image always produces the same analysis, which keeps
 * fusion reproducible in tests and lets the game run with no API at all.
 */
export class LocalMockMonsterAnalyzer implements MonsterAnalyzer {
  private readonly pools: AllelePools;
  private readonly confidence: number;
  private readonly rngOverride: Random | undefined;

  constructor(options: LocalMockAnalyzerOptions = {}) {
    this.pools = options.pools ?? DEFAULT_ALLELE_POOLS;
    this.confidence = options.confidence ?? 0.35;
    this.rngOverride = options.rng;
  }

  analyze(image: MonsterImage): Promise<MonsterVisualAnalysis> {
    const rng = this.rngOverride ?? createSeededRandom(fingerprintImage(image));
    return Promise.resolve({
      bodyColor: pick(rng, this.pools.bodyColor),
      bodyShape: pick(rng, this.pools.bodyShape),
      size: pick(rng, this.pools.size),
      horns: pick(rng, this.pools.horns),
      wings: pick(rng, this.pools.wings),
      tail: pick(rng, this.pools.tail),
      eyes: pick(rng, this.pools.eyes),
      element: pick(rng, this.pools.element),
      confidence: this.confidence,
      notes: 'local-mock: derived from the image fingerprint, not from vision',
    });
  }
}

/**
 * Shape of the call a hosted vision model has to fulfil. The core never builds
 * the request itself, so no endpoint, header or key lives in this repository.
 */
export type VisionRequestHandler = (
  image: MonsterImage,
) => Promise<Partial<MonsterVisualAnalysis>>;

export interface RemoteAnalyzerOptions {
  /** Used for any field the model did not return. */
  readonly fallback?: MonsterAnalyzer;
  readonly pools?: AllelePools;
}

/**
 * Adapter for a future hosted analyser.
 *
 * The caller passes a `VisionRequestHandler` that it built with its own
 * credentials (read from the environment or, better, from a server-side proxy).
 * Anything the model omits or gets wrong falls back to the local mock, so the
 * game keeps working when the API is unavailable.
 */
export class RemoteMonsterAnalyzer implements MonsterAnalyzer {
  private readonly request: VisionRequestHandler;
  private readonly fallback: MonsterAnalyzer;

  constructor(request: VisionRequestHandler, options: RemoteAnalyzerOptions = {}) {
    this.request = request;
    this.fallback =
      options.fallback ??
      new LocalMockMonsterAnalyzer(options.pools ? { pools: options.pools } : {});
  }

  async analyze(image: MonsterImage): Promise<MonsterVisualAnalysis> {
    const base = await this.fallback.analyze(image);
    try {
      const partial = await this.request(image);
      return { ...base, ...stripUndefined(partial) };
    } catch {
      // A vision outage must never block monster creation.
      return base;
    }
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as Partial<T>;
}
