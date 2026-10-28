import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const g=await server.ssrLoadModule('/src/mocks/game.ts');
  const core=await server.ssrLoadModule('@core/core/index.ts');
  const {battleLogLabel}=await server.ssrLoadModule('/src/shared/battlePresentation.ts');
  const {moveHelp}=await server.ssrLoadModule('/src/shared/moveHelp.ts');
  for(const m of g.initialMonsters) {
    const before=JSON.stringify(g.getCoreMonster(m.id));
    const features=g.getFeatureMoves(m.id);
    const ids=g.getMoveLoadout(m.id).skillIds;
    assert.deepEqual(ids,core.defaultLoadout(g.getCoreMonster(m.id)).skillIds);
    assert.ok(features.filter(f=>ids.includes(f.skill.id)&&f.category==='finisher').length<=1);
    assert.ok(ids.length<=3);
    assert.ok(ids.every(id=>features.some(f=>f.skill.id===id)));
    assert.equal(g.setMoveLoadout(m.id,['strike']).ok,false);
    assert.equal(g.setMoveLoadout(m.id,[...ids,...ids]).ok,false);
    const battle=g.enterArena(m.id);
    assert.ok(battle.coreState.combatants.find(c=>c.side===0).skills.every(s=>ids.includes(s.id)));
    assert.ok(battle.coreState.combatants.every(c=>c.skills.length<=core.MAX_MOVE_SLOTS&&c.skills.every(s=>s.id!=='strike'&&!s.id.startsWith('sig-'))));
    g.leaveArena();
    assert.equal(g.setMoveLoadout(m.id,[]).ok,true);
    assert.deepEqual(g.getMoveLoadout(m.id).skillIds,[]);
    assert.deepEqual(g.enterArena(m.id).coreState.combatants.find(c=>c.side===0).skills,[]);
    g.leaveArena();
    assert.equal(g.setMoveLoadout(m.id,ids).ok,true);
    assert.deepEqual(core.reconcileLoadout(g.getCoreMonster(m.id),['strike','sig-earth']).skillIds,ids);
    assert.equal(JSON.stringify(g.getCoreMonster(m.id)),before);
  }
  const aqua=g.initialMonsters[2];
  assert.ok(g.setMoveLoadout(aqua.id,['magic-eye']).ok);
  let state=g.createBattle(aqua,g.initialMonsters[0]).coreState;
  const rng=core.createSeededRandom(42);
  const policies=[core.createScriptedPolicy([{kind:'skill',skillId:'magic-eye',targetId:state.combatants[1].id}]),core.createScriptedPolicy([{kind:'defend'}])];
  state=core.stepTurn(state,policies,rng);
  const snapshot=JSON.stringify(state);
  const next=core.stepTurn(state,policies,rng);
  const entry=next.log.slice(state.log.length).find(e=>e.effects?.some(f=>f.type==='noEffect'&&f.status==='blind'));
  assert.ok(entry,'repeated blind produces an authoritative noEffect event');
  assert.match(battleLogLabel(entry,next,{}),/すでに暗闇/);
  assert.equal(JSON.stringify(state),snapshot);
  assert.match(moveHelp({id:'magic-eye'}).lines.join(' '),/50%/);
  assert.match(moveHelp({id:'magic-eye'}).lines.join(' '),/延長はできない/);
  console.log('All starters: feature-only defaults, <=3 slots, common/duplicate rejection, arena connection and immutable monsters passed.');
} finally {await server.close();}
