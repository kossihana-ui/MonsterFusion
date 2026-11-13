import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const core=await server.ssrLoadModule('/src/../../MonsterFusion-Core/src/core/index.ts');
  const game=await server.ssrLoadModule('/src/mocks/game.ts');
  const {blockingStatus,getMoveBehavior,STATUS_LABELS,STATUS_POLARITY,defaultLoadout}=core;

  // The battle screen asks core which condition stops a monster, so the two
  // have to agree about what that means.
  assert.equal(blockingStatus([{kind:'bind',turns:1}]),'bind');
  assert.equal(blockingStatus([{kind:'flinch',turns:1}]),'flinch');
  assert.equal(blockingStatus([{kind:'recoil',turns:1}]),'recoil');
  assert.equal(blockingStatus([{kind:'poison',turns:3}]),null,'poison hurts but does not stop you');
  assert.equal(blockingStatus([{kind:'blind',turns:2}]),null,'blindness makes you miss, not freeze');
  assert.equal(blockingStatus([]),null);
  assert.equal(blockingStatus([{kind:'bind',turns:0}]),null,'an expired bind holds nobody');

  // Every condition the screen can be handed has a name and a side.
  for (const kind of Object.keys(STATUS_LABELS)) {
    assert.ok(STATUS_LABELS[kind],`${kind} has no Japanese name`);
    assert.ok(['buff','debuff'].includes(STATUS_POLARITY[kind]),`${kind} has no side`);
  }

  // Both halves of the "you cannot act" message are reachable with the
  // monsters a player actually starts with: one that has a move a bind lets
  // through, and one that has none.
  const sets=game.initialMonsters.map(m=>({
    name:m.name,
    through:defaultLoadout(game.getCoreMonster(m.id)).skillIds.filter(id=>getMoveBehavior(id).usableWhileBound),
  }));
  assert.ok(sets.some(s=>s.through.length>0),
    'no starter carries a move that works while bound, so that line can never show: '+JSON.stringify(sets));
  assert.ok(sets.some(s=>s.through.length===0),
    'every starter can act through a bind, so the plain refusal can never show');

  console.log('Status UI: blocking conditions, labels, polarity, and both halves of the cannot-act message passed.');
  console.log('  ' + sets.map(s=>`${s.name}: ${s.through.length?s.through.join('/'):'(none)'}`).join('   '));
} finally {await server.close();}
