/**
 * Public API of the MonsterFusion game core.
 *
 * The UI layer should import from here only:
 *
 *   import { createRootMonster, fuse, simulateDuel } from '../core/index.ts';
 *
 * Nothing in this package touches the DOM, the network, or a clock it was not
 * handed, so every entry point below is testable and UI-agnostic.
 */

export type * from '../shared/types.ts';
export {
  CATEGORICAL_LOCI,
  NUMERIC_LOCI,
  SCHEMA_VERSION,
  SIZE_LADDER,
  STAT_KEYS,
} from '../shared/types.ts';

// Configuration (every probability and coefficient lives here).
export type {
  AllelePools,
  BattleConfig,
  FusionConfig,
  GameConfig,
  GeneticsConfig,
  StatsConfig,
} from './config.ts';
export {
  createBattleConfig,
  createFusionConfig,
  createGameConfig,
  createGeneticsConfig,
  createStatsConfig,
  DEFAULT_ALLELE_POOLS,
  DEFAULT_BATTLE_CONFIG,
  DEFAULT_FUSION_CONFIG,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENETICS_CONFIG,
  DEFAULT_STATS_CONFIG,
} from './config.ts';

// Randomness.
export type { Random } from './random.ts';
export {
  chance,
  createSeededRandom,
  createSystemRandom,
  nextFloat,
  nextInt,
  pick,
  seedFromString,
  shuffled,
} from './random.ts';

// Genetics.
export type { InheritanceOptions, InheritanceResult } from './genetics.ts';
export {
  allelesAt,
  createGenesFromAnalysis,
  createRandomGenes,
  deriveTraits,
  expressGenes,
  inheritGenes,
  isCarrier,
} from './genetics.ts';

// Stats.
export type { StatBreakdown } from './stats.ts';
export {
  computeStatBreakdown,
  computeStats,
  maxPossibleStats,
  statCapsForTier,
  statTotal,
  withinCaps,
} from './stats.ts';

// Fusion.
export type {
  CreateMonsterOptions,
  EvolutionPreview,
  FusionCheck,
  FusionResult,
  MonsterContext,
} from './fusion.ts';
export {
  ancestorIds,
  appearanceSimilarity,
  applyTierTitle,
  canFuse,
  createIdFromRandom,
  createMonsterFromAnalysis,
  createMonsterName,
  createRootMonster,
  fuse,
  fuseDetailed,
  parentIdsOf,
  previewEvolution,
} from './fusion.ts';

// Starters.
export type { StarterSpec, TendencySpec } from './starters.ts';
export {
  createStarterMonster,
  createStarterMonsters,
  findStarterSpec,
  STARTER_SPECS,
} from './starters.ts';

// Battle.
export type { CombatantOptions, DamageResult, PolicyResolver } from './battle.ts';
export {
  computeDamage,
  createBasicPolicy,
  createBattle,
  createCombatant,
  createDuel,
  createScriptedPolicy,
  deriveSkills,
  elementMultiplier,
  livingAllies,
  livingOpponents,
  runBattle,
  simulateDuel,
  stepTurn,
  toPolicyResolver,
  turnOrder,
} from './battle.ts';

// Visual analysis.
export type {
  LocalMockAnalyzerOptions,
  RemoteAnalyzerOptions,
  VisionRequestHandler,
} from './analyzer.ts';
export {
  fingerprintImage,
  LocalMockMonsterAnalyzer,
  RemoteMonsterAnalyzer,
} from './analyzer.ts';

// Storage.
export type { Migration, MonsterSaveFile, ValidationResult } from './storage.ts';
export {
  createSaveFile,
  danglingParentIds,
  deserializeMonster,
  deserializeSaveFile,
  indexById,
  MIGRATIONS,
  migrateToCurrent,
  normalizeMonster,
  serializeMonster,
  serializeSaveFile,
  validateMonster,
} from './storage.ts';
