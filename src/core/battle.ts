/**
 * Battle engine.
 *
 * It is written for N sides with N members each from the start; a 1v1 is just
 * the case where every side has one combatant. Party battles therefore need no
 * change to the engine, only more combatants and more policies.
 *
 * State is treated as immutable from the outside: `stepTurn` returns a new
 * `BattleState` with cloned combatants, so a UI can keep previous states for
 * replay or undo. Randomness always comes from the injected `Random`, so a
 * seed replays a battle exactly.
 */

import type {
  BattleAction,
  BattleLogEntry,
  BattleOutcome,
  BattlePolicy,
  BattleState,
  Combatant,
  Element,
  Monster,
  Skill,
} from '../shared/types.ts';
import type { BattleConfig } from './config.ts';
import type { BattleEffectEvent, MoveBehavior } from './effects.ts';
import type { DamageBoost } from './effects.ts';
import {
  applyStatus,
  canApplyStatus,
  blindMisses,
  BOOST_REASONS,
  statusOf,
  blockingStatus,
  conditionMultiplier,
  getMoveBehavior,
  hasStatus,
  removePolarity as stripPolarity,
  STATUS_POLARITY,
  offenceMultiplier,
  removePolarity,
  removeStatuses,
  scaleHeal,
  tickStatuses,
} from './effects.ts';
import type { MoveLoadout } from './moves.ts';
import { loadoutFor, skillsForLoadout } from './moves.ts';
import { DEFAULT_BATTLE_CONFIG } from './config.ts';
import type { Random } from './random.ts';
import { chance, nextFloat, nextInt, shuffled } from './random.ts';
import { clamp } from './util.ts';

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/**
 * The moves a monster brings when nobody chose any.
 *
 * Kept as a thin wrapper over the move catalogue so the battle and the
 * collection screen cannot disagree about what a monster knows.
 */
export function deriveSkills(monster: Monster): Skill[] {
  return skillsForLoadout(monster);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface CombatantOptions {
  readonly id?: string;
  readonly skills?: readonly Skill[];
  readonly startingMp?: number;
  /** The moves this monster takes in. Falls back to its default set. */
  readonly loadout?: MoveLoadout | readonly string[];
}

export function createCombatant(
  monster: Monster,
  side: number,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
  options: CombatantOptions = {},
): Combatant {
  return {
    id: options.id ?? `${side}:${monster.id}`,
    monsterId: monster.id,
    name: monster.name,
    side,
    maxHp: monster.stats.hp,
    hp: monster.stats.hp,
    mp: options.startingMp ?? config.startingMp,
    stats: { ...monster.stats },
    element: monster.phenotype.element,
    skills: options.skills ?? skillsForLoadout(monster, options.loadout),
    defending: false,
    statuses: [],
  };
}

/**
 * Builds the opening state. `teams[i]` is side `i`, so `[[a], [b]]` is a 1v1
 * and `[[a, b, c], [d, e, f]]` is a 3v3.
 */
export function createBattle(
  teams: readonly (readonly Monster[])[],
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  const combatants: Combatant[] = [];
  teams.forEach((team, side) => {
    team.forEach((monster, index) => {
      combatants.push(
        createCombatant(monster, side, config, { id: `${side}-${index}:${monster.id}` }),
      );
    });
  });

  const log: BattleLogEntry[] = [
    {
      turn: 0,
      actorId: '',
      kind: 'start',
      message: `Battle start: ${teams.map((t) => t.map((m) => m.name).join(', ')).join(' vs ')}`,
    },
  ];

  return { combatants, turn: 0, log, outcome: { status: 'ongoing' } };
}

/**
 * Builds the opening state with each monster using its chosen moves.
 *
 * A monster with no loadout, or one naming moves it cannot learn any more -
 * a fused child wearing a different body to the parent whose set was saved -
 * falls back to its default rather than going in unable to act.
 */
export function createBattleWithLoadouts(
  teams: readonly (readonly Monster[])[],
  loadouts: readonly MoveLoadout[] = [],
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  const combatants: Combatant[] = [];
  teams.forEach((team, side) => {
    team.forEach((monster, index) => {
      combatants.push(
        createCombatant(monster, side, config, {
          id: `${side}-${index}:${monster.id}`,
          ...(loadoutFor(monster, loadouts) ? { loadout: loadoutFor(monster, loadouts) } : {}),
        }),
      );
    });
  });

  const log: BattleLogEntry[] = [
    {
      turn: 0,
      actorId: '',
      kind: 'start',
      message: `Battle start: ${teams.map((t) => t.map((m) => m.name).join(', ')).join(' vs ')}`,
    },
  ];

  return { combatants, turn: 0, log, outcome: { status: 'ongoing' } };
}

/** The one-on-one case, with chosen moves. */
export function createDuelWithLoadouts(
  a: Monster,
  b: Monster,
  loadouts: readonly MoveLoadout[] = [],
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  return createBattleWithLoadouts([[a], [b]], loadouts, config);
}

/** Convenience wrapper for the common one-on-one case. */
export function createDuel(
  a: Monster,
  b: Monster,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  return createBattle([[a], [b]], config);
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

export function elementMultiplier(
  attacker: Element,
  defender: Element,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  return config.elementChart[attacker]?.[defender] ?? 1;
}

export interface DamageResult {
  readonly damage: number;
  readonly critical: boolean;
  /** Before the guard and the random spread, for the UI to explain a hit. */
  readonly raw: number;
  /** Damage the target's guard absorbed. 0 when it was not defending. */
  readonly mitigated: number;
  readonly elementMultiplier: number;
}

/**
 * Damage for one connecting hit.
 *
 * `power/(power + defense)` keeps the curve flat at high numbers, so a monster
 * with capped stats is strong but not unbeatable.
 */
export function computeDamage(
  attacker: Combatant,
  defender: Combatant,
  options: {
    skill?: Skill;
    /** 防御貫通: ignore the guard. The defence stat still applies. */
    pierce?: boolean;
    /** 砕牙: ignore the defence stat. The guard still applies. */
    shatter?: boolean;
    /** The move's own power, when it overrides the catalogue's. */
    power?: number;
    /** Conditional multiplier, already resolved by the caller. */
    factor?: number;
  } = {},
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): DamageResult {
  const skill = options.skill;
  // A buff multiplies the offence before anything else sees it.
  const power = offensivePower(attacker, skill, config) * offenceMultiplier(attacker.statuses);
  const skillFactor = (options.power ?? skill?.power ?? 100) / 100;
  // 砕牙 ignores the defence stat. 防御貫通 is about the guard, below.
  const defense = options.shatter
    ? 1
    : Math.max(1, defender.stats.defense * config.defenseScale);

  const elementMultiplier = elementMultiplierFor(skill, attacker, defender, config);

  // power/(power + defense) flattens the curve at high numbers, so a capped
  // monster is strong without being unanswerable. damageScale then sets how
  // many hits a fight takes, which is the pacing dial.
  let damage =
    power * skillFactor * (power / (power + defense)) * elementMultiplier
    * config.damageScale * (options.factor ?? 1);

  const speedEdge = Math.max(0, attacker.stats.speed - defender.stats.speed);
  const critChance = Math.min(
    config.criticalChanceCap,
    config.criticalChance + speedEdge * config.criticalChancePerSpeed,
  );
  const critical = chance(rng, critChance);
  if (critical) damage *= config.criticalMultiplier;

  const raw = damage;
  if (defender.defending && !options.pierce) damage *= config.defendDamageMultiplier;

  const variance = config.damageVariance;
  const spread = nextFloat(rng, 1 - variance, 1 + variance);
  damage *= spread;

  const final = Math.max(config.minimumDamage, Math.round(damage));
  const unguarded = Math.max(config.minimumDamage, Math.round(raw * spread));

  return {
    damage: final,
    critical,
    raw: Math.round(raw),
    mitigated: defender.defending && !options.pierce ? Math.max(0, unguarded - final) : 0,
    elementMultiplier,
  };
}

/**
 * The offence behind a hit: the stat the skill scales off, plus a share of the
 * other one. See `offhandFactor`.
 */
export function offensivePower(
  attacker: Combatant,
  skill: Skill | undefined,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  // A plain attack is the monster swinging with what it has, so it uses
  // whichever offence is actually higher. That used to be the job of the
  // shared `strike`; with moves coming only from body parts, a magic-heavy
  // monster whose features are all physical would otherwise have nothing that
  // reads off its magic - and the plain attack is what everyone falls back to
  // when the MP runs out.
  const scaling = skill?.scaling
    ?? (attacker.stats.magic > attacker.stats.attack ? 'magic' : 'attack');
  const primary = attacker.stats[scaling];
  const offhand = attacker.stats[scaling === 'attack' ? 'magic' : 'attack'];
  return Math.max(1, primary + offhand * config.offhandFactor);
}

/** The matchup a hit is subject to: a skill brings its own element. */
function elementMultiplierFor(
  skill: Skill | undefined,
  attacker: Combatant,
  defender: Combatant,
  config: BattleConfig,
): number {
  return elementMultiplier(skill?.element ?? attacker.element, defender.element, config);
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export function livingOpponents(state: BattleState, actor: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.side !== actor.side && c.hp > 0);
}

export function livingAllies(state: BattleState, actor: Combatant): Combatant[] {
  return state.combatants.filter((c) => c.side === actor.side && c.hp > 0);
}

/**
 * Default opponent AI: use the signature skill when the MP is there, defend
 * when badly hurt, otherwise attack the weakest living opponent.
 */
export function createBasicPolicy(
  rng: Random,
  options: { readonly defendBelowHpRatio?: number; readonly defendChance?: number } = {},
): BattlePolicy {
  const defendBelow = options.defendBelowHpRatio ?? 0.25;
  const defendChance = options.defendChance ?? 0.4;

  return {
    chooseAction(actor: Combatant, state: BattleState): BattleAction {
      const targets = livingOpponents(state, actor);
      if (targets.length === 0) return { kind: 'defend' };

      if (actor.hp / actor.maxHp <= defendBelow && chance(rng, defendChance)) {
        return { kind: 'defend' };
      }

      let target = targets[0] as Combatant;
      for (const candidate of targets) {
        if (candidate.hp < target.hp) target = candidate;
      }

      // Pick by what the hit is actually worth against THIS target, so the
      // element chart is something the opponent uses too, not just a number
      // shown in the UI.
      const affordable = actor.skills.filter((s) => s.cost <= actor.mp);
      let best: Skill | undefined;
      let bestValue = expectedDamage(actor, target, undefined);
      for (const skill of affordable) {
        const value = expectedDamage(actor, target, skill);
        if (value > bestValue) {
          best = skill;
          bestValue = value;
        }
      }

      if (best) return { kind: 'skill', skillId: best.id, targetId: target.id };
      return { kind: 'attack', targetId: target.id };
    },
  };
}

/**
 * What a hit is worth on average, with no randomness: the figure a policy
 * compares options with, and the one a UI can show next to a skill.
 *
 * Reads the move's behaviour, not just its catalogue power, so the number
 * agrees with what the move actually does: a move that does not attack is
 * worth nothing, the spec's power override wins over the tier's, every hit of
 * a multi-hit move counts, and a move that only lands some of the time is
 * discounted by how often.
 */
export function expectedDamage(
  attacker: Combatant,
  defender: Combatant,
  skill?: Skill,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  const behavior = getMoveBehavior(skill?.id ?? 'attack');
  // A heal, a cleanse or a guard-up deals no damage, whatever power its tier
  // happens to carry. Valuing it as an attack is how an AI ends up spending
  // every turn on テールスイープ.
  if (skill && !behavior.attacks) return 0;

  const power = offensivePower(attacker, skill, config);
  const defense = behavior.shattersDefense
    ? 1
    : Math.max(1, defender.stats.defense * config.defenseScale);
  const matchup = elementMultiplier(
    skill?.element ?? attacker.element,
    defender.element,
    config,
  );
  const movePower = behavior.power ?? skill?.power ?? 100;

  return (
    power * (movePower / 100) * (power / (power + defense))
    * matchup * config.damageScale * behavior.hits * behavior.successChance
  );
}

/** A policy that always replays a fixed script. Handy for deterministic tests. */
export function createScriptedPolicy(actions: readonly BattleAction[]): BattlePolicy {
  let index = 0;
  return {
    chooseAction(): BattleAction {
      const action = actions[Math.min(index, actions.length - 1)] ?? { kind: 'defend' };
      index++;
      return action;
    },
  };
}

// ---------------------------------------------------------------------------
// Turn resolution
// ---------------------------------------------------------------------------

export type PolicyResolver = (actor: Combatant) => BattlePolicy;

/** Accepts a single policy, a per-side list, or a resolver function. */
export function toPolicyResolver(
  policies: BattlePolicy | readonly BattlePolicy[] | PolicyResolver,
): PolicyResolver {
  if (typeof policies === 'function') return policies;
  if (Array.isArray(policies)) {
    const list = policies as readonly BattlePolicy[];
    return (actor) => {
      const policy = list[actor.side] ?? list[0];
      if (!policy) throw new Error(`No policy for side ${actor.side}`);
      return policy;
    };
  }
  const single = policies as BattlePolicy;
  return () => single;
}

function cloneCombatants(combatants: readonly Combatant[]): Combatant[] {
  return combatants.map((c) => ({
    ...c,
    stats: { ...c.stats },
    skills: c.skills,
    statuses: (c.statuses ?? []).map((status) => ({ ...status })),
  }));
}

function evaluateOutcome(
  combatants: readonly Combatant[],
  turn: number,
  config: BattleConfig,
): BattleOutcome {
  const sides = new Set(combatants.map((c) => c.side));
  const alive = [...sides].filter((side) =>
    combatants.some((c) => c.side === side && c.hp > 0),
  );

  if (alive.length === 1) return { status: 'win', winningSide: alive[0] as number };
  if (alive.length === 0) return { status: 'draw' };

  if (turn >= config.maxTurns) {
    // Time out: decide on remaining HP fraction so a battle always terminates.
    let bestSide = -1;
    let bestRatio = -1;
    let tied = false;
    for (const side of alive) {
      const members = combatants.filter((c) => c.side === side);
      const hp = members.reduce((sum, c) => sum + Math.max(0, c.hp), 0);
      const maxHp = members.reduce((sum, c) => sum + c.maxHp, 0);
      const ratio = maxHp > 0 ? hp / maxHp : 0;
      if (ratio > bestRatio + 1e-9) {
        bestRatio = ratio;
        bestSide = side;
        tied = false;
      } else if (Math.abs(ratio - bestRatio) <= 1e-9) {
        tied = true;
      }
    }
    if (tied || bestSide < 0) return { status: 'draw' };
    return { status: 'win', winningSide: bestSide };
  }

  return { status: 'ongoing' };
}

/**
 * Action order for a turn: fastest first, but rolled rather than decided.
 *
 * Each combatant rolls its speed with `initiativeVariance` of spread, so a
 * small edge leans the order without settling it. With a flat sort, speed won
 * the battle outright: it bought the first move every single turn.
 */
export function turnOrder(
  combatants: readonly Combatant[],
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): Combatant[] {
  const variance = Math.max(0, config.initiativeVariance);
  return shuffled(rng, combatants.filter((c) => c.hp > 0))
    .map((combatant) => ({
      combatant,
      roll: variance > 0
        ? combatant.stats.speed * nextFloat(rng, 1 - variance, 1 + variance)
        : combatant.stats.speed,
    }))
    .sort((a, b) => b.roll - a.roll)
    .map((entry) => entry.combatant);
}

/**
 * Resolves one full turn: every living combatant acts once, in speed order.
 * Returns a new state; the input state is not modified.
 */
/**
 * One declaration from one combatant, made before anybody acts.
 *
 * Exposed because a UI that wants to show intentions - a telegraphed attack,
 * an enemy visibly bracing - needs the same list the resolver works from.
 */
export interface DeclaredAction {
  readonly actorId: string;
  readonly action: BattleAction;
}

/**
 * Asks every living combatant what it intends to do this turn.
 *
 * Each policy is called exactly once, against the state as it stands at the
 * start of the turn, so a decision never depends on where its owner sits in
 * the speed order.
 */
export function declareActions(
  state: BattleState,
  policies: BattlePolicy | readonly BattlePolicy[] | PolicyResolver,
): DeclaredAction[] {
  const resolver = toPolicyResolver(policies);
  return state.combatants
    .filter((c) => c.hp > 0)
    .map((actor) => ({ actorId: actor.id, action: resolver(actor).chooseAction(actor, state) }));
}

/**
 * Resolves one full turn.
 *
 * Two phases, and the order matters:
 *
 *   1. every living combatant declares, and anyone guarding raises its guard
 *      immediately - so a slow defender is protected from the fast attacker
 *      that would otherwise have hit it before it braced;
 *   2. the rest act in speed order.
 *
 * Returns a new state; the input is not modified.
 */
export function stepTurn(
  state: BattleState,
  policies: BattlePolicy | readonly BattlePolicy[] | PolicyResolver,
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  if (state.outcome.status !== 'ongoing') return state;

  const combatants = cloneCombatants(state.combatants);
  const byId = new Map(combatants.map((c) => [c.id, c]));
  const log: BattleLogEntry[] = [...state.log];
  const turn = state.turn + 1;

  // A guard lasts for the turn it was declared, so last turn's is cleared
  // before anyone declares a new one.
  for (const combatant of combatants) {
    combatant.defending = false;
    combatant.mp = Math.min(config.maxMp, combatant.mp + config.mpRegenPerTurn);
  }

  const atTurnStart: BattleState = {
    combatants: cloneCombatants(combatants),
    turn,
    log,
    outcome: { status: 'ongoing' },
  };

  // Phase 1: declare. Guards go up now, before anything is resolved.
  const declared = declareActions(atTurnStart, policies);
  const intents = new Map(declared.map((d) => [d.actorId, d.action]));

  for (const { actorId, action } of declared) {
    if (action.kind !== 'defend') continue;
    const actor = byId.get(actorId);
    if (!actor) continue;
    actor.defending = true;
    actor.mp = Math.min(config.maxMp, actor.mp + config.defendMpBonus);
    log.push({
      turn,
      actorId: actor.id,
      kind: 'defend',
      message: `${actor.name} braces for impact.`,
      ...(config.defendMpBonus > 0 ? { mpSpent: -config.defendMpBonus } : {}),
    });
  }

  // Phase 2: resolve, fastest first.
  const working: BattleState = { combatants, turn, log, outcome: { status: 'ongoing' } };

  for (const actorRef of turnOrder(combatants, rng, config)) {
    const actor = byId.get(actorRef.id);
    if (!actor || actor.hp <= 0) continue;
    const action = intents.get(actor.id);
    if (!action || action.kind === 'defend') continue;
    if (evaluateOutcome(combatants, turn, config).status !== 'ongoing') break;

    const chosen = action.kind === 'skill'
      ? actor.skills.find((s) => s.id === action.skillId) ?? actor.skills[0]
      : undefined;
    const behavior = getMoveBehavior(chosen?.id ?? 'attack');

    // Bound or recoiling: the turn is spent, unless the move says otherwise.
    const blocked = blockingStatus(actor.statuses);
    if (blocked && !behavior.usableWhileBound) {
      log.push({
        turn,
        actorId: actor.id,
        kind: 'status',
        effects: [{ type: 'skip', actorId: actor.id, reason: blocked }],
        message: `${actor.name} cannot move (${blocked}).`,
      });
      continue;
    }

    // A move that cannot be used twice running.
    if (behavior.noConsecutiveUse && actor.lastSkillId === behavior.skillId) {
      log.push({
        turn,
        actorId: actor.id,
        kind: 'status',
        ...(chosen ? { skillId: chosen.id } : {}),
        effects: [
          { type: 'blocked', actorId: actor.id, ...(chosen ? { skillId: chosen.id } : {}), reason: 'consecutive' },
        ],
        message: `${actor.name} cannot use ${chosen?.name ?? 'that'} twice in a row.`,
      });
      continue;
    }

    const target = behavior.target === 'self'
      ? actor
      : resolveTarget(action, actor, working, byId);
    if (!target) continue;

    let skill: Skill | undefined;
    let mpSpent = 0;
    if (action.kind === 'skill' && chosen) {
      if (chosen.cost > actor.mp) {
        // Not enough MP: fall back to a plain attack rather than wasting the
        // turn - but only for a move that attacks at all.
        if (!behavior.attacks) {
          log.push({
            turn,
            actorId: actor.id,
            kind: 'status',
            skillId: chosen.id,
            effects: [{ type: 'blocked', actorId: actor.id, skillId: chosen.id, reason: 'mp' }],
            message: `${actor.name} lacks the MP for ${chosen.name}.`,
          });
          continue;
        }
      } else {
        skill = chosen;
        actor.mp -= chosen.cost;
        mpSpent = chosen.cost;
      }
    }

    const effects: BattleEffectEvent[] = [];
    const resolved = skill ? behavior : getMoveBehavior('attack');
    const logSkillId = skill?.id;

    // --- damage -----------------------------------------------------------
    //
    // Conditions are read BEFORE anything is removed: coil-crush doubles
    // against a bound target and then frees it, so asking afterwards would
    // always find it unbound.
    const boosts: DamageBoost[] = [];
    const factor = conditionMultiplier(
      resolved.conditions,
      {
        targetDefending: target.defending,
        targetStatuses: target.statuses ?? [],
        selfStatuses: actor.statuses ?? [],
        ...(skill ? { element: skill.element } : {}),
      },
      boosts,
    );

    // A buff is a multiplier the player chose to set up, so it is the one
    // they most want announced.
    const buff = offenceMultiplier(actor.statuses);
    if (buff !== 1) {
      boosts.unshift({ source: 'attackUp', reason: BOOST_REASONS.attackUp, factor: buff });
    }

    // The seed pays off only for whoever planted it, and only once. Read
    // before the hit, because the hit spends it.
    const seed = statusOf(target.statuses, 'seed');
    const seedIsMine = Boolean(seed && seed.sourceId === actor.id);
    const attackElement = skill?.element ?? actor.element;
    const seedBoosts =
      seedIsMine && attackElement === config.seedPayoff.boostElement;
    const seedBinds =
      seedIsMine && attackElement === config.seedPayoff.bindElement;
    const seedFactor = seedBoosts ? config.seedPayoff.boostFactor : 1;
    if (seedBoosts) {
      boosts.push({ source: 'seed', reason: BOOST_REASONS.seed, factor: seedFactor });
    }

    let dealt = 0;
    let anyCritical = false;
    let connected = true;

    if (resolved.attacks) {
      // A move that can miss outright, and one that is weaker the second
      // turn running.
      const repeat = resolved.repeatSuccessChance !== undefined
        && actor.lastSkillId === resolved.skillId;
      const successChance = repeat
        ? resolved.repeatSuccessChance ?? resolved.successChance
        : resolved.successChance;
      if (successChance < 1 && !chance(rng, successChance)) {
        connected = false;
        effects.push({
          type: 'miss',
          actorId: actor.id,
          targetId: target.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          reason: 'chance',
        });
      }
    }

    if (resolved.attacks && connected && resolved.instantDeathChance > 0
        && chance(rng, resolved.instantDeathChance)) {
      // Felled outright: no damage roll, no guard, no element.
      const lost = target.hp;
      target.hp = 0;
      dealt = lost;
      effects.push({
        type: 'damage',
        actorId: actor.id,
        targetId: target.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        amount: lost,
        critical: true,
        elementMultiplier: 1,
        mitigated: 0,
        hit: 1,
        hits: 1,
        pierced: true,
      });
      connected = false;
    }

    if (resolved.attacks && connected) {
      const physical = (skill?.scaling ?? 'attack') === 'attack';
      const repeats = hasStatus(actor.statuses, 'doubleStrike') ? 2 : 1;
      const swings = Math.max(1, resolved.hits) * repeats;

      for (let hit = 1; hit <= swings; hit++) {
        if (target.hp <= 0) break;

        if (blindMisses(actor.statuses, physical, rng.next(), config)) {
          effects.push({
            type: 'miss',
            actorId: actor.id,
            targetId: target.id,
            ...(logSkillId ? { skillId: logSkillId } : {}),
            reason: 'blind',
          });
          continue;
        }

        const evasion = statusOf(target.statuses, 'evasion');
        if (evasion && chance(rng, evasion.magnitude ?? 0)) {
          effects.push({
            type: 'miss',
            actorId: actor.id,
            targetId: target.id,
            ...(logSkillId ? { skillId: logSkillId } : {}),
            reason: 'chance',
          });
          continue;
        }

        const result = computeDamage(
          actor,
          target,
          {
            ...(skill ? { skill } : {}),
            ...(resolved.piercesDefense ? { pierce: true } : {}),
            ...(resolved.shattersDefense ? { shatter: true } : {}),
            ...(resolved.power !== undefined ? { power: resolved.power } : {}),
            ...(factor * seedFactor !== 1 ? { factor: factor * seedFactor } : {}),
          },
          rng,
          config,
        );

        // A guard that reflects throws the hit back instead of taking it.
        if (hasStatus(target.statuses, 'reflect')) {
          actor.hp = clamp(actor.hp - result.damage, 0, actor.maxHp);
          effects.push({
            type: 'damage',
            actorId: target.id,
            targetId: actor.id,
            ...(logSkillId ? { skillId: logSkillId } : {}),
            amount: result.damage,
            critical: result.critical,
            elementMultiplier: result.elementMultiplier,
            mitigated: 0,
            hit,
            hits: swings,
            pierced: true,
          });
          continue;
        }

        target.hp = clamp(target.hp - result.damage, 0, target.maxHp);
        dealt += result.damage;
        anyCritical = anyCritical || result.critical;
        // Element goes on the end: the UI shows it beside the matchup line
        // it already draws, and the rest are the ones worth announcing.
        const allBoosts = result.elementMultiplier !== 1
          ? [...boosts, {
              source: 'element' as const,
              reason: BOOST_REASONS.element,
              factor: result.elementMultiplier,
            }]
          : boosts;
        const boostTotal = allBoosts.reduce((product, b) => product * b.factor, 1);

        effects.push({
          type: 'damage',
          actorId: actor.id,
          targetId: target.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          amount: result.damage,
          critical: result.critical,
          elementMultiplier: result.elementMultiplier,
          mitigated: result.mitigated,
          hit,
          hits: swings,
          pierced: resolved.piercesDefense || resolved.shattersDefense,
          ...(allBoosts.length > 0
            ? { boosts: allBoosts, boostTotal: Math.round(boostTotal * 100) / 100 }
            : {}),
        });
      }
    }

    // --- the seed pays out, and is spent --------------------------------
    if (resolved.attacks && connected && (seedBoosts || seedBinds)) {
      target.statuses = removeStatuses(target.statuses ?? [], ['seed']).statuses;
      effects.push({
        type: 'cleanse',
        actorId: actor.id,
        targetId: target.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        removed: ['seed'],
      });
      if (seedBinds && !canApplyStatus(target.statuses, 'bind')) {
        effects.push({
          type: 'noEffect',
          actorId: actor.id,
          targetId: target.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          status: 'bind',
          reason: 'alreadyActive',
        });
      } else if (seedBinds) {
        target.statuses = applyStatus(target.statuses ?? [], {
          kind: 'bind',
          turns: config.statusTurns.bind,
          appliedTurn: turn,
          sourceId: actor.id,
        });
        effects.push({
          type: 'status',
          actorId: actor.id,
          targetId: target.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          status: 'bind',
          turns: config.statusTurns.bind,
        });
      }
    }

    // --- heal -------------------------------------------------------------
    if (resolved.heal > 0) {
      const receiver = resolved.target === 'enemy' ? target : actor;
      const before = receiver.hp;
      // The caster's magic decides the offer; the receiver's HP cap decides
      // how much of it lands, and the event reports the second one.
      const offered = scaleHeal(resolved.heal, actor.stats.magic, config);
      receiver.hp = clamp(receiver.hp + offered, 0, receiver.maxHp);
      effects.push({
        type: 'heal',
        actorId: actor.id,
        targetId: receiver.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        amount: receiver.hp - before,
      });
    }

    // --- cleanse ----------------------------------------------------------
    for (const entry of resolved.cleanse) {
      const subject = entry.target === 'self' ? actor : target;
      const { statuses, removed } = removePolarity(subject.statuses ?? [], entry.polarity);
      subject.statuses = statuses;
      effects.push({
        type: 'cleanse',
        actorId: actor.id,
        targetId: subject.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        removed,
      });
    }
    for (const entry of resolved.cure) {
      const subject = entry.target === 'self' ? actor : target;
      const { statuses, removed } = removeStatuses(subject.statuses ?? [], entry.statuses);
      subject.statuses = statuses;
      effects.push({
        type: 'cleanse',
        actorId: actor.id,
        targetId: subject.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        removed,
      });
    }

    // --- MP ---------------------------------------------------------------
    if (resolved.restoreMp > 0) {
      const before = actor.mp;
      actor.mp = Math.min(config.maxMp, actor.mp + resolved.restoreMp);
      effects.push({
        type: 'mp',
        actorId: actor.id,
        targetId: actor.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        amount: actor.mp - before,
      });
    }

    // --- debuff transfer ----------------------------------------------------
    if (resolved.transfersDebuffs) {
      const mine = (actor.statuses ?? []).filter(
        (status) => STATUS_POLARITY[status.kind] === 'debuff',
      );
      const stripped = stripPolarity(actor.statuses ?? [], 'debuff');
      actor.statuses = stripped.statuses;
      for (const status of mine) {
        // Already carrying it: the debuff comes off the actor either way, but
        // it does not stack onto what the target is already living with.
        if (!canApplyStatus(target.statuses, status.kind)) {
          effects.push({
            type: 'noEffect',
            actorId: actor.id,
            targetId: target.id,
            ...(logSkillId ? { skillId: logSkillId } : {}),
            status: status.kind,
            reason: 'alreadyActive',
          });
          continue;
        }
        target.statuses = applyStatus(target.statuses ?? [], {
          ...status,
          appliedTurn: turn,
          sourceId: actor.id,
        });
        effects.push({
          type: 'status',
          actorId: actor.id,
          targetId: target.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          status: status.kind,
          turns: status.turns,
        });
      }
      if (stripped.removed.length > 0) {
        effects.push({
          type: 'cleanse',
          actorId: actor.id,
          targetId: actor.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          removed: stripped.removed,
        });
      }
    }

    // --- statuses ---------------------------------------------------------
    for (const application of resolved.applies) {
      if (application.chance < 1 && rng.next() >= application.chance) continue;
      const subject = application.target === 'self' ? actor : target;
      if (!canApplyStatus(subject.statuses, application.status)) {
        effects.push({
          type: 'noEffect',
          actorId: actor.id,
          targetId: subject.id,
          ...(logSkillId ? { skillId: logSkillId } : {}),
          status: application.status,
          reason: 'alreadyActive',
        });
        continue;
      }
      subject.statuses = applyStatus(subject.statuses ?? [], {
        kind: application.status,
        turns: application.turns,
        ...(application.magnitude !== undefined ? { magnitude: application.magnitude } : {}),
        appliedTurn: turn,
        sourceId: actor.id,
      });
      effects.push({
        type: 'status',
        actorId: actor.id,
        targetId: subject.id,
        ...(logSkillId ? { skillId: logSkillId } : {}),
        status: application.status,
        turns: application.turns,
      });
    }

    // The extra action is spent by the turn that took it.
    if (hasStatus(actor.statuses, 'doubleStrike') && resolved.attacks) {
      actor.statuses = removeStatuses(actor.statuses ?? [], ['doubleStrike']).statuses;
    }

    actor.lastSkillId = skill?.id ?? 'attack';

    // The existing fields stay on the entry: the handoff asked for events to
    // be added, not for the shape the UI already reads to change. For a move
    // that hits more than once they summarise, and `effects` has each hit.
    const firstHit = effects.find((e) => e.type === 'damage');
    log.push({
      turn,
      actorId: actor.id,
      kind: resolved.attacks ? (skill ? 'skill' : 'attack') : 'status',
      ...(resolved.attacks
        ? {
            targetId: target.id,
            damage: dealt,
            critical: anyCritical,
            elementMultiplier: firstHit?.type === 'damage' ? firstHit.elementMultiplier : 1,
            mitigated: effects.reduce(
              (sum, e) => sum + (e.type === 'damage' ? e.mitigated : 0),
              0,
            ),
          }
        : {}),
      ...(logSkillId ? { skillId: logSkillId } : {}),
      ...(mpSpent ? { mpSpent } : {}),
      effects,
      message: describeAction(actor, target, skill, resolved, dealt, anyCritical),
    });

    if (target.hp === 0) {
      log.push({
        turn,
        actorId: target.id,
        kind: 'faint',
        message: `${target.name} is defeated.`,
      });
    }
  }

  // --- end of turn: poison, then statuses age -------------------------------
  for (const combatant of combatants) {
    if (combatant.hp <= 0) continue;
    const poison = (combatant.statuses ?? []).find((s) => s.kind === 'poison' && s.turns > 0);
    if (poison) {
      const [low, high] = config.poisonDamage;
      const amount = nextInt(rng, low, high);
      combatant.hp = clamp(combatant.hp - amount, 0, combatant.maxHp);
      log.push({
        turn,
        actorId: combatant.id,
        kind: 'status',
        damage: amount,
        effects: [
          {
            type: 'damage',
            actorId: combatant.id,
            targetId: combatant.id,
            amount,
            critical: false,
            elementMultiplier: 1,
            mitigated: 0,
            hit: 1,
            hits: 1,
            pierced: true,
          },
        ],
        message: `${combatant.name} takes ${amount} from poison.`,
      });
      if (combatant.hp === 0) {
        log.push({
          turn,
          actorId: combatant.id,
          kind: 'faint',
          message: `${combatant.name} is defeated.`,
        });
      }
    }
    combatant.statuses = tickStatuses(combatant.statuses ?? [], turn);
  }

  const outcome = evaluateOutcome(combatants, turn, config);
  if (outcome.status !== 'ongoing') {
    log.push({
      turn,
      actorId: '',
      kind: 'end',
      message:
        outcome.status === 'win'
          ? `Side ${outcome.winningSide} wins on turn ${turn}.`
          : `The battle ends in a draw on turn ${turn}.`,
    });
  }

  return { combatants, turn, log, outcome };
}

/** The English fallback line. The UI builds its own text from `effects`. */
function describeAction(
  actor: Combatant,
  target: Combatant,
  skill: Skill | undefined,
  behavior: MoveBehavior,
  damage: number,
  critical: boolean,
): string {
  if (!behavior.attacks) {
    const name = skill?.name ?? 'an effect';
    return `${actor.name} uses ${name}.`;
  }
  const verb = skill ? `casts ${skill.name} on` : 'attacks';
  return `${actor.name} ${verb} ${target.name} for ${damage}${critical ? ' (critical!)' : ''}.`;
}

function resolveTarget(
  action: BattleAction,
  actor: Combatant,
  state: BattleState,
  byId: Map<string, Combatant>,
): Combatant | undefined {
  if (action.targetId) {
    const explicit = byId.get(action.targetId);
    if (explicit && explicit.hp > 0 && explicit.side !== actor.side) return explicit;
  }
  return livingOpponents(state, actor)[0];
}

/** Runs turns until the battle is decided. Always terminates (`maxTurns`). */
export function runBattle(
  state: BattleState,
  policies: BattlePolicy | readonly BattlePolicy[] | PolicyResolver,
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  let current = state;
  // +1 so the turn that hits the limit is still resolved and judged.
  for (let i = 0; i < config.maxTurns + 1; i++) {
    if (current.outcome.status !== 'ongoing') break;
    current = stepTurn(current, policies, rng, config);
  }
  return current;
}

/** Runs a complete 1v1 with the default AI on both sides. */
export function simulateDuel(
  a: Monster,
  b: Monster,
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  const policy = createBasicPolicy(rng);
  return runBattle(createDuel(a, b, config), policy, rng, config);
}
