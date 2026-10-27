import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const g=await server.ssrLoadModule('/src/mocks/game.ts');
  for(const m of g.initialMonsters) {
    const before=JSON.stringify(g.getCoreMonster(m.id));
    const features=g.getFeatureMoves(m.id);
    const ids=g.getMoveLoadout(m.id).skillIds;
    assert.ok(ids.length<=3);
    assert.ok(ids.every(id=>features.some(f=>f.skill.id===id)));
    assert.equal(g.setMoveLoadout(m.id,['strike']).ok,false);
    assert.equal(g.setMoveLoadout(m.id,[...ids,...ids]).ok,false);
    const battle=g.enterArena(m.id);
    assert.ok(battle.coreState.combatants.find(c=>c.side===0).skills.every(s=>ids.includes(s.id)));
    g.leaveArena();
    assert.equal(JSON.stringify(g.getCoreMonster(m.id)),before);
  }
  console.log('All starters: feature-only defaults, <=3 slots, common/duplicate rejection, arena connection and immutable monsters passed.');
} finally {await server.close();}
