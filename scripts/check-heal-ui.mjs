import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const g=await server.ssrLoadModule('/src/mocks/game.ts');
  const c=await server.ssrLoadModule('@core/core/index.ts');
  const {healText}=await server.ssrLoadModule('/src/components/HealEffect.tsx');
  const {moveHelp}=await server.ssrLoadModule('/src/shared/moveHelp.ts');
  const {battleLogLabel}=await server.ssrLoadModule('/src/shared/battlePresentation.ts');
  const starterSnapshot=JSON.stringify(g.initialMonsters.map(m=>g.getCoreMonster(m.id)));
  const estimates=g.initialMonsters.map(m=>{
    const caster=g.getCoreMonster(m.id);
    const expected=c.getMoveHealing('hydro-ram',caster);
    assert.ok(moveHelp({id:'hydro-ram'},caster).summary.includes(`HPを${expected}回復`));
    return expected;
  });
  assert.ok(new Set(estimates).size>1,'different magic produces distinct displayed recovery');
  const aqua=g.initialMonsters[2];
  assert.ok(g.setMoveLoadout(aqua.id,['hydro-ram']).ok);
  for(const missing of [40,5,0]) {
    const state=structuredClone(g.createBattle(aqua,g.initialMonsters[0]).coreState);
    state.combatants[0].hp-=missing; // isolated test fixture, never a canonical Monster
    const snapshot=JSON.stringify(state);
    const policies=[c.createScriptedPolicy([{kind:'skill',skillId:'hydro-ram'}]),c.createScriptedPolicy([{kind:'defend'}])];
    const rng=c.createSeededRandom(42);
    const next=c.stepTurn(state,policies,rng);
    const effects=next.log.flatMap(e=>e.effects??[]).filter(e=>e.actorId===state.combatants[0].id);
    const heal=effects.find(e=>e.type==='heal');
    assert.ok(heal);
    assert.equal(heal.amount,next.combatants[0].hp-state.combatants[0].hp);
    assert.equal(heal.amount,Math.min(missing,c.getMoveHealing('hydro-ram',g.getCoreMonster(aqua.id))));
    assert.equal(healText(heal.amount),heal.amount>0?`＋${heal.amount}`:'HP満タン');
    if(missing<=5) assert.equal(heal.amount,missing);
    assert.ok(!effects.some(e=>e.type==='damage'));
    assert.equal(JSON.stringify(state),snapshot);
    const blocked=c.stepTurn(next,policies,rng);
    const newEffects=blocked.log.slice(next.log.length).flatMap(e=>e.effects??[]);
    assert.ok(newEffects.some(e=>e.type==='blocked'&&e.reason==='consecutive'));
    assert.ok(!newEffects.some(e=>e.type==='heal'));
  }
  const mpState=g.createBattle(aqua,g.initialMonsters[0]).coreState;
  const id=mpState.combatants[0].id;
  const mpLog=battleLogLabel({actorId:id,kind:'skill',effects:[{type:'mp',actorId:id,targetId:id,amount:10}]},mpState,{});
  assert.match(mpLog,/MPが10回復/);
  assert.doesNotMatch(mpLog,/HP|満タン/);
  assert.equal(JSON.stringify(g.initialMonsters.map(m=>g.getCoreMonster(m.id))),starterSnapshot);
  console.log('Heal UI: actual HP delta, capped recovery, full HP, no damage, consecutive-use block and immutable input passed.');
} finally {await server.close();}
