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
import { DEFAULT_BATTLE_CONFIG } from './config.ts';
import type { Random } from './random.ts';
import { chance, nextFloat, shuffled } from './random.ts';
import { clamp } from './util.ts';

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const ELEMENT_SKILL_NAMES: Record<Element, string> = {
  neutral: 'Impact',
  fire: 'Flame Burst',
  water: 'Tide Lance',
  earth: 'Stone Crush',
  wind: 'Gale Edge',
  light: 'Radiance',
  dark: 'Umbral Fang',
};

/**
 * Gives a monster its skill list from its element and its strongest tendency.
 * Pure: the same monster always has the same skills.
 */
export function deriveSkills(monster: Monster): Skill[] {
  const element = monster.phenotype.element;
  // Decided by the stats, not by the tendency genes that fed them. A monster
  // whose visual traits pushed its magic past its attack was still swinging
  // off the weaker of the two, which made a fusion that should have been an
  // upgrade come out worse.
  const magical = monster.stats.magic >= monster.stats.attack;

  const signature: Skill = {
    id: `sig-${element}`,
    name: ELEMENT_SKILL_NAMES[element],
    power: 140,
    scaling: magical ? 'magic' : 'attack',
    element,
    cost: 6,
  };

  const basic: Skill = {
    id: 'strike',
    name: magical ? 'Mana Bolt' : 'Heavy Strike',
    power: 100,
    scaling: magical ? 'magic' : 'attack',
    element: 'neutral',
    cost: 2,
  };

  return [signature, basic];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export interface CombatantOptions {
  readonly id?: string;
  readonly skills?: readonly Skill[];
  readonly startingMp?: number;
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
    skills: options.skills ?? deriveSkills(monster),
    defending: false,
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
  options: { skill?: Skill } = {},
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): DamageResult {
  const skill = options.skill;
  const power = offensivePower(attacker, skill, config);
  const skillFactor = (skill?.power ?? 100) / 100;
  const defense = Math.max(1, defender.stats.defense * config.defenseScale);

  const elementMultiplier = elementMultiplierFor(skill, attacker, defender, config);

  // power/(power + defense) flattens the curve at high numbers, so a capped
  // monster is strong without being unanswerable. damageScale then sets how
  // many hits a fight takes, which is the pacing dial.
  let damage =
    power * skillFactor * (power / (power + defense)) * elementMultiplier * config.damageScale;

  const speedEdge = Math.max(0, attacker.stats.speed - defender.stats.speed);
  const critChance = Math.min(
    config.criticalChanceCap,
    config.criticalChance + speedEdge * config.criticalChancePerSpeed,
  );
  const critical = chance(rng, critChance);
  if (critical) damage *= config.criticalMultiplier;

  const raw = damage;
  if (defender.defending) damage *= config.defendDamageMultiplier;

  const variance = config.damageVariance;
  const spread = nextFloat(rng, 1 - variance, 1 + variance);
  damage *= spread;

  const final = Math.max(config.minimumDamage, Math.round(damage));
  const unguarded = Math.max(config.minimumDamage, Math.round(raw * spread));

  return {
    damage: final,
    critical,
    raw: Math.round(raw),
    mitigated: defender.defending ? Math.max(0, unguarded - final) : 0,
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
  const scaling = skill?.scaling ?? 'attack';
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
 */
export function expectedDamage(
  attacker: Combatant,
  defender: Combatant,
  skill?: Skill,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): number {
  const power = offensivePower(attacker, skill, config);
  const defense = Math.max(1, defender.stats.defense * config.defenseScale);
  const matchup = elementMultiplier(
    skill?.element ?? attacker.element,
    defender.element,
    config,
  );
  return (
    power * ((skill?.power ?? 100) / 100) * (power / (power + defense))
    * matchup * config.damageScale
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
  return combatants.map((c) => ({ ...c, stats: { ...c.stats }, skills: c.skills }));
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
    combatant.mp = Math.min(99, combatant.mp + config.mpRegenPerTurn);
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
    actor.mp = Math.min(99, actor.mp + config.defendMpBonus);
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

    const target = resolveTarget(action, actor, working, byId);
    if (!target) continue;

    let skill: Skill | undefined;
    let mpSpent = 0;
    if (action.kind === 'skill') {
      skill = actor.skills.find((s) => s.id === action.skillId) ?? actor.skills[0];
      if (!skill || skill.cost > actor.mp) {
        // Not enough MP: fall back to a plain attack rather than wasting the turn.
        skill = undefined;
      } else {
        actor.mp -= skill.cost;
        mpSpent = skill.cost;
      }
    }

    const result = computeDamage(actor, target, skill ? { skill } : {}, rng, config);
    target.hp = clamp(target.hp - result.damage, 0, target.maxHp);

    log.push({
      turn,
      actorId: actor.id,
      kind: skill ? 'skill' : 'attack',
      targetId: target.id,
      damage: result.damage,
      critical: result.critical,
      elementMultiplier: result.elementMultiplier,
      mitigated: result.mitigated,
      ...(skill ? { skillId: skill.id } : {}),
      ...(mpSpent ? { mpSpent } : {}),
      message: `${actor.name} ${skill ? `casts ${skill.name} on` : 'attacks'} ${target.name} for ${result.damage}${result.critical ? ' (critical!)' : ''}${result.mitigated > 0 ? ` (${result.mitigated} guarded)` : ''}.`,
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
