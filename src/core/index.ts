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
  GraftConfig,
  StatsConfig,
} from './config.ts';
export {
  createBattleConfig,
  createFusionConfig,
  createGameConfig,
  createGeneticsConfig,
  createGraftConfig,
  createStatsConfig,
  DEFAULT_ALLELE_POOLS,
  DEFAULT_BATTLE_CONFIG,
  DEFAULT_FUSION_CONFIG,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENETICS_CONFIG,
  DEFAULT_GRAFT_CONFIG,
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

// Gene graft (slipping a recessive allele into the carrier slot).
export type { GraftOptions, GraftRecord, GraftResult } from './graft.ts';
export {
  graftGene,
  graftGeneDetailed,
  graftRandomRecessive,
  graftRandomRecessiveDetailed,
} from './graft.ts';

// Appearance (sprite composition: which part, where, how big, what colour).
export type {
  AnchorName,
  AppearanceConfig,
  BodyRig,
  ColorMapping,
  HidePalette,
  LayerKind,
  Palette,
  PaletteOptions,
  Point,
  Ramp,
  SpriteComposition,
  SpriteLayer,
} from './appearance.ts';
export {
  appearanceKey,
  BODY_PALETTES,
  BODY_RIGS,
  CANVAS_SIZE,
  colorMappings,
  composeAppearance,
  createAppearanceConfig,
  DEFAULT_APPEARANCE_CONFIG,
  ELEMENT_ACCENTS,
  EYE_RAMP,
  KERATIN_RAMP,
  paletteFor,
  REFERENCE_PALETTE,
  referenceColors,
  requiredPartKeys,
  SIZE_SCALES,
} from './appearance.ts';

// Animation (where each layer sits at a given moment).
export type {
  AnimationConfig,
  AnimationName,
  LayerMotion,
  Pose,
  PosedLayer,
  PoseOptions,
  PoseTransform,
} from './animation.ts';
export {
  animationDuration,
  createAnimationConfig,
  DEFAULT_ANIMATION_CONFIG,
  DEFAULT_LAYER_MOTION,
  isBlinking,
  poseAt,
  REST_TRANSFORM,
  restPose,
} from './animation.ts';

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
