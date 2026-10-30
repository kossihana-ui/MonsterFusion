import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const g=await server.ssrLoadModule('/src/mocks/game.ts');
  const c=await server.ssrLoadModule('@core/core/index.ts');
  const {healText}=await server.ssrLoadModule('/src/components/HealEffect.tsx');
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
    assert.equal(healText(heal.amount),heal.amount>0?`＋${heal.amount}`:'HP満タン');
    if(missing<=5) assert.equal(heal.amount,missing);
    assert.ok(!effects.some(e=>e.type==='damage'));
    assert.equal(JSON.stringify(state),snapshot);
    const blocked=c.stepTurn(next,policies,rng);
    const newEffects=blocked.log.slice(next.log.length).flatMap(e=>e.effects??[]);
    assert.ok(newEffects.some(e=>e.type==='blocked'&&e.reason==='consecutive'));
    assert.ok(!newEffects.some(e=>e.type==='heal'));
  }
  console.log('Heal UI: actual HP delta, capped recovery, full HP, no damage, consecutive-use block and immutable input passed.');
} finally {await server.close();}
