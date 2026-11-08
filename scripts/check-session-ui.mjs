import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const game=await server.ssrLoadModule('/src/mocks/game.ts');
  const {createSessionAdapter}=await server.ssrLoadModule('/src/mocks/session.ts');
  let roster=[...game.initialMonsters];
  const original=JSON.stringify(roster.map(m=>game.getCoreMonster(m.id)));
  const session=createSessionAdapter(game.gameAdapter,roster,next=>{roster=next;});
  const [a,b,c]=roster;
  const result=await session.fuseMonsters(a,b);
  assert.deepEqual(roster.map(m=>m.id),[c.id,result.child.id]);
  assert.equal(JSON.stringify([a,b,c].map(m=>game.getCoreMonster(m.id))),original);
  await assert.rejects(session.fuseMonsters(a,c));
  assert.equal(roster.length,2);
  const child=(await session.fuseMonsters(c,result.child)).child;
  assert.deepEqual(roster.map(m=>m.id),[child.id]);
  let battle=game.enterArena(child.id);
  for(let i=0;i<200&&battle.status==='active';i++) battle=await session.calculateBattleTurn(battle,'defend');
  assert.equal(battle.status,'lost');
  assert.equal(roster.length,0);
  await session.calculateBattleTurn(battle,'attack');
  assert.equal(roster.length,0);
  let changed=false;
  const rejecting=createSessionAdapter({...game.gameAdapter,fuseMonsters:async()=>{throw Error('failed')}},[a,b],()=>{changed=true;});
  await assert.rejects(rejecting.fuseMonsters(a,b));
  assert.equal(changed,false,'failed fusion must retain parents');
  console.log('Session: fusion consumes parents only on success, removed parents rejected, canonical history intact, defeat reaches zero once.');
} finally {await server.close();}
