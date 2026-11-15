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
  ArenaConfig,
  BattleConfig,
  FusionConfig,
  GameConfig,
  GeneticsConfig,
  GraftConfig,
  SoulMakeConfig,
  StatsConfig,
} from './config.ts';
export {
  createArenaConfig,
  createBattleConfig,
  createFusionConfig,
  createGameConfig,
  createGeneticsConfig,
  createGraftConfig,
  createSoulMakeConfig,
  createStatsConfig,
  DEFAULT_ALLELE_POOLS,
  DEFAULT_ARENA_CONFIG,
  DEFAULT_BATTLE_CONFIG,
  DEFAULT_FUSION_CONFIG,
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENETICS_CONFIG,
  DEFAULT_GRAFT_CONFIG,
  DEFAULT_SOUL_MAKE_CONFIG,
  DEFAULT_STATS_CONFIG,
} from './config.ts';

// Randomness.
export type { Random } from './random.ts';
export {
  chance,
  createSeededRandom,
  resumeSeededRandom,
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
  ContactShadow,
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
  PART_SCALES,
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

// Tags (Japanese labels for a monster's genes, for the UI to colour).
export type {
  DescribeOptions,
  FusionSummary,
  MonsterTag,
  RevealStep,
  TagKind,
} from './tags.ts';
export {
  describeAppearanceTags,
  describeFusion,
  describeMonster,
  describePhenotype,
  describeTraits,
  dominanceOf,
  labelFor,
  LOCUS_LABELS,
  traitLabel,
  TRAIT_LABELS,
} from './tags.ts';

// Effects (statuses, and what a move actually does).
export type {
  ActionMode,
  BattleEffectEvent,
  ConditionalMultiplier,
  DamageBoost,
  MoveBehavior,
  StatusApplication,
  StatusEffect,
  StatusKind,
} from './effects.ts';
export {
  applyStatus,
  canApplyStatus,
  getMoveHealing,
  scaleHeal,
  blindMisses,
  blockingStatus,
  BOOST_REASONS,
  conditionMultiplier,
  getMoveBehavior,
  hasStatus,
  MOVE_BEHAVIOURS,
  offenceMultiplier,
  pendingMoves,
  removePolarity,
  removeStatuses,
  STATUS_LABELS,
  STATUS_POLARITY,
  statusOf,
  tickStatuses,
} from './effects.ts';

// Moves (what a body teaches, and what the player chose to take in).
export type {
  LearnableMove,
  LoadoutCheck,
  MoveCategory,
  MoveDefinition,
  MoveLoadout,
} from './moves.ts';
export {
  allMoveDefinitions,
  canLearn,
  defaultLoadout,
  getLearnableMoves,
  loadoutFor,
  MAX_MOVE_SLOTS,
  MOVE_CATALOGUE,
  MOVE_TIERS,
  reconcileLoadout,
  skillsForLoadout,
  validateMoveLoadout,
} from './moves.ts';

// Gene parts (what a defeated monster leaves behind, and spending it).
export type {
  GenePart,
  PartFusionPreview,
  PartFusionResult,
  PartInventory,
  PartStack,
} from './parts.ts';
export {
  addPart,
  countOf,
  createPartInventory,
  fuseWithPart,
  hasCompleted,
  partFromFeature,
  partIdFor,
  partsOf,
  rememberRequest,
  pinnableLoci,
  previewPartFusion,
  removePart,
  REQUEST_LEDGER_LIMIT,
} from './parts.ts';

// Arena (five fights, then a boss).
export type {
  ArenaEncounter,
  ArenaPhase,
  ArenaRewardResult,
  ArenaRun,
} from './arena.ts';
export {
  advanceArenaTurn,
  arenaRules,
  arenaStrengthAt,
  BOSS_TEMPLATE,
  FINAL_BOSS_NAME,
  FINAL_BOSS_TEMPLATE,
  finalBossIndex,
  isFinalBossIndex,
  claimArenaReward,
  createArenaEnemy,
  isArenaOver,
  nextArenaEncounter,
  startArena,
} from './arena.ts';

// Starters.
export type { StarterSpec, TendencySpec } from './starters.ts';
export {
  createStarterMonster,
  createStarterMonsters,
  findStarterSpec,
  STARTER_SPECS,
} from './starters.ts';

// Battle.
export type {
  CombatantOptions,
  DamageResult,
  DeclaredAction,
  PolicyResolver,
} from './battle.ts';
export {
  computeDamage,
  createBasicPolicy,
  createBattle,
  createCombatant,
  createBattleWithLoadouts,
  createDuel,
  createDuelWithLoadouts,
  createScriptedPolicy,
  declareActions,
  deriveSkills,
  elementMultiplier,
  expectedDamage,
  offensivePower,
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
export type { Migration, MonsterSaveFile, SessionSave, ValidationResult } from './storage.ts';
export {
  createSaveFile,
  danglingParentIds,
  deserializeMonster,
  deserializeSaveFile,
  indexById,
  MIGRATIONS,
  migrateToCurrent,
  normalizeMonster,
  restoreSession,
  serializeMonster,
  serializeSaveFile,
  sessionSaveOf,
  validateMonster,
} from './storage.ts';

// Consumables, and ドクロゲソ: taking the opponent home.
export type {
  Consumable,
  ConsumableId,
  ItemInventory,
  ItemStack,
} from './items.ts';
export {
  addItem,
  CONSUMABLES,
  consumableById,
  createItemInventory,
  DOKURO_GESO,
  itemCount,
  listItems,
  removeItem,
} from './items.ts';
export type {
  CapturePreview,
  CaptureRefusal,
  CaptureResult,
  SessionReward,
} from './capture.ts';
export {
  CAPTURE_ITEM_ID,
  captureArenaMonster,
  claimArenaRewardInSession,
  giveSessionItem,
  giveSessionPart,
  previewCapture,
} from './capture.ts';

// The seeds everybody shares.
export type { ArenaSeason, SeasonKind } from './seasons.ts';
export {
  allTimeSeason,
  freeSeason,
  isoWeek,
  practiceSeason,
  rankedSeasons,
  seasonIsOpen,
  seasons,
  weeklySeason,
  weekEndsAt,
} from './seasons.ts';

// ソウルメイク: building a monster from collected parts.
export type {
  PlacedPart,
  SoulMakePreview,
  SoulMakeRecipe,
  SoulMakeResult,
  SoulMakeSelection,
} from './soulmake.ts';
export {
  getSoulMakeRecipe,
  previewSoulMake,
  soulMake,
  soulMakeLoci,
} from './soulmake.ts';

// The run: what is owned, what was lost, and when it is over.
export type {
  CreateSessionOptions,
  GameSession,
  SessionFusion,
  SessionRefusal,
  SessionSoulMake,
  SessionStatus,
  SettledBattle,
} from './session.ts';
export {
  createGameSession,
  deployMonsters,
  fuseOwnedMonsters,
  isDeployed,
  getConsumables,
  isGameOver,
  ownedMonster,
  SESSION_LEDGER_LIMIT,
  settleBattleLoss,
  soulMakeInSession,
} from './session.ts';
