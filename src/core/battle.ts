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
  const magical = monster.phenotype.magicTendency >= monster.phenotype.attackTendency;

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
  const scaling = skill?.scaling ?? 'attack';
  const power = Math.max(1, attacker.stats[scaling]);
  const skillFactor = (skill?.power ?? 100) / 100;
  const defense = Math.max(1, defender.stats.defense * config.defenseScale);

  let damage = power * skillFactor * (power / (power + defense));

  damage *= elementMultiplier(skill?.element ?? attacker.element, defender.element, config);

  const speedEdge = Math.max(0, attacker.stats.speed - defender.stats.speed);
  const critChance = Math.min(
    config.criticalChanceCap,
    config.criticalChance + speedEdge * config.criticalChancePerSpeed,
  );
  const critical = chance(rng, critChance);
  if (critical) damage *= config.criticalMultiplier;

  if (defender.defending) damage *= config.defendDamageMultiplier;

  const variance = config.damageVariance;
  damage *= nextFloat(rng, 1 - variance, 1 + variance);

  return {
    damage: Math.max(config.minimumDamage, Math.round(damage)),
    critical,
  };
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

      const affordable = actor.skills.filter((s) => s.cost <= actor.mp);
      if (affordable.length > 0) {
        let best = affordable[0] as Skill;
        for (const skill of affordable) if (skill.power > best.power) best = skill;
        return { kind: 'skill', skillId: best.id, targetId: target.id };
      }

      return { kind: 'attack', targetId: target.id };
    },
  };
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

/** Action order for a turn: fastest first, ties broken by the injected rng. */
export function turnOrder(combatants: readonly Combatant[], rng: Random): Combatant[] {
  return shuffled(rng, combatants.filter((c) => c.hp > 0)).sort(
    (a, b) => b.stats.speed - a.stats.speed,
  );
}

/**
 * Resolves one full turn: every living combatant acts once, in speed order.
 * Returns a new state; the input state is not modified.
 */
export function stepTurn(
  state: BattleState,
  policies: BattlePolicy | readonly BattlePolicy[] | PolicyResolver,
  rng: Random,
  config: BattleConfig = DEFAULT_BATTLE_CONFIG,
): BattleState {
  if (state.outcome.status !== 'ongoing') return state;

  const resolver = toPolicyResolver(policies);
  const combatants = cloneCombatants(state.combatants);
  const byId = new Map(combatants.map((c) => [c.id, c]));
  const log: BattleLogEntry[] = [...state.log];
  const turn = state.turn + 1;

  // Defending lasts for the turn it was declared, so clear it first.
  for (const combatant of combatants) {
    combatant.defending = false;
    combatant.mp = Math.min(99, combatant.mp + config.mpRegenPerTurn);
  }

  const order = turnOrder(combatants, rng);
  const working: BattleState = { combatants, turn, log, outcome: { status: 'ongoing' } };

  for (const actorRef of order) {
    const actor = byId.get(actorRef.id);
    if (!actor || actor.hp <= 0) continue;
    if (evaluateOutcome(combatants, turn, config).status !== 'ongoing') break;

    const action = resolver(actor).chooseAction(actor, working);

    if (action.kind === 'defend') {
      actor.defending = true;
      log.push({
        turn,
        actorId: actor.id,
        kind: 'defend',
        message: `${actor.name} braces for impact.`,
      });
      continue;
    }

    const target = resolveTarget(action, actor, working, byId);
    if (!target) continue;

    let skill: Skill | undefined;
    if (action.kind === 'skill') {
      skill = actor.skills.find((s) => s.id === action.skillId) ?? actor.skills[0];
      if (!skill || skill.cost > actor.mp) {
        // Not enough MP: fall back to a plain attack rather than wasting the turn.
        skill = undefined;
      } else {
        actor.mp -= skill.cost;
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
      message: `${actor.name} ${skill ? `casts ${skill.name} on` : 'attacks'} ${target.name} for ${result.damage}${result.critical ? ' (critical!)' : ''}.`,
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
