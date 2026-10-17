import {
  createStarterMonsters, createSeededRandom, findStarterSpec,
  createMonsterFromAnalysis, canFuse, fuse, createDuel, stepTurn,
  createBasicPolicy,
} from '@core/core/index.ts';
import type { Monster as CoreMonster, BattleState as CoreBattleState } from '@core/core/index.ts';
import type { Monster, BattleState, GameAdapter } from '../shared/ui';

// UI presentation adapter. Core objects are kept intact and never edited here.
const context = { rng: createSeededRandom(12345) };
const records = new Map<string, CoreMonster>();
const art = new Map<string, string>();
const starterArt: Record<string,string> = {
  'moss-v2-64.png': new URL('./assets/starters/moss-v2-64.png', import.meta.url).href,
  'ignis-v2-64.png': new URL('./assets/starters/ignis-v2-64.png', import.meta.url).href,
  'aqua-v2-64.png': new URL('./assets/starters/aqua-v2-64.png', import.meta.url).href,
};
const names: Record<string,string> = {'starter-moss':'モス','starter-ignis':'イグニス','starter-aqua':'アクア'};
const elements: Record<string,string> = {earth:'森',fire:'炎',water:'水',neutral:'無',wind:'風',light:'光',dark:'闇'};
const bodies: Record<string,string> = {round:'丸型',muscular:'筋肉質',finned:'魚型',slim:'細身',serpentine:'蛇型',winged:'翼型'};
export function getCoreMonster(id: string): CoreMonster {
  const monster = records.get(id);
  if (!monster) throw new Error('モンスターが見つかりません。');
  return monster;
}
function present(monster: CoreMonster, image: string): Monster {
  records.set(monster.id, monster);
  art.set(monster.id, image);
  return {
    id:monster.id, name:names[monster.id] ?? monster.name, image,
    generation:monster.generation, stats:monster.stats,
    genes:{element:elements[monster.phenotype.element],body:bodies[monster.phenotype.bodyShape],potential:`進化ランク ${monster.tier} / 隠れ遺伝子あり`},
    traits:monster.traits.map(tag=>({id:tag,name:tag,description:tag})),
    parentIds:[monster.parentAId,monster.parentBId].filter((id): id is string=>id!==null),
  };
}
export const initialMonsters = createStarterMonsters(context).map(monster => {
  const spec = findStarterSpec(monster.id)!;
  return present(monster,starterArt[spec.art]);
});
export function registerUploadedMonster(name:string,image:string): Monster {
  // Uploaded art has not been analysed. Creation and stat consistency belong to core.
  return present(createMonsterFromAnalysis({confidence:0,notes:'Uploaded image; visual analysis pending'},context,{name}),image);
}
function presentBattle(coreState:CoreBattleState,player:Monster,enemy:Monster):BattleState {
  const outcome=coreState.outcome;
  return {player,enemy,coreState,playerHp:coreState.combatants.find(c=>c.side===0)!.hp,
    enemyHp:coreState.combatants.find(c=>c.side===1)!.hp,turn:coreState.turn+1,
    logs:coreState.log.map(entry=>entry.message),
    status:outcome.status==='ongoing'?'active':outcome.status==='draw'?'draw':outcome.winningSide===0?'won':'lost'};
}
export function createBattle(player:Monster,enemy:Monster):BattleState {
  return presentBattle(createDuel(getCoreMonster(player.id),getCoreMonster(enemy.id)),player,enemy);
}
export const gameAdapter:GameAdapter = {
  async fuseMonsters(a,b) {
    const parentA=getCoreMonster(a.id),parentB=getCoreMonster(b.id);
    const check=canFuse(parentA,parentB);
    if(!check.ok) throw new Error(check.message);
    const child=fuse(parentA,parentB,context);
    // Composite phenotype rendering is pending; keep the parent illustration as a preview.
    return {child:present(child,art.get(a.id)!),parents:[a,b]};
  },
  async calculateBattleTurn(state,action) {
    if(state.status!=='active')return state;
    const coreState=state.coreState;
    if(!coreState)throw new Error('バトル状態がありません。');
    const enemyPolicy=createBasicPolicy(context.rng);
    const next=stepTurn(coreState, actor=>actor.side===0?{
      chooseAction(current,battle) {
        const target=battle.combatants.find(c=>c.side!==current.side&&c.hp>0);
        if(action==='defend'||!target)return {kind:'defend'};
        const skill=current.skills.find(s=>s.cost<=current.mp);
        if(action==='skill'&&skill)return {kind:'skill',skillId:skill.id,targetId:target.id};
        return {kind:'attack',targetId:target.id};
      }
    }:enemyPolicy,context.rng);
    return presentBattle(next,state.player,state.enemy);
  }
};
