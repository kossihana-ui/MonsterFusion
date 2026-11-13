import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const game=await server.ssrLoadModule('/src/mocks/game.ts');
  const core=await server.ssrLoadModule('/src/../../MonsterFusion-Core/src/core/index.ts');
  const api=game.gameAdapter;

  // Nothing held: the card has nothing to offer and the button stays off.
  assert.deepEqual(game.getItems(),[],'a new run starts with no items');
  assert.equal(game.previewEnemyCapture().ok,false,'no fight, nothing to capture');

  const [a]=game.initialMonsters;
  game.enterArena(a.id);
  let preview=game.previewEnemyCapture();
  assert.equal(preview.ok,false);
  assert.equal(preview.refusal,'noItem');
  assert.match(preview.message,/ドクロゲソ/);
  const before=game.getGameSession();
  const refused=game.captureEnemy('no-item');
  assert.equal(refused.ok,false);
  assert.equal(refused.captured,null);
  assert.equal(game.getGameSession(),before,'a refusal changes nothing');
  game.leaveArena();

  // The only way to get one is to beat the boss, which a starter does about
  // one run in a hundred. Bend the ladder and the drop so the rest of the
  // chain - drop, item box, use - can be checked in a second.
  const arena=core.DEFAULT_ARENA_CONFIG;
  const saved={...arena};
  Object.assign(arena,{firstStrength:.15,lastStrength:.2,bossStrength:.25,bossCaptureItemChance:1});
  try {
    game.restartGame();
    const [me]=game.initialMonsters;
    let battle=game.enterArena(me.id);
    for (let fight=0;fight<=arena.normalWins;fight++) {
      for (let turn=0;turn<200&&battle.status==='active';turn++) battle=await api.calculateBattleTurn(battle,'attack');
      assert.equal(battle.status,'won',`fight ${fight+1} was not won`);
      const reward=game.receiveArenaReward();
      if (fight===arena.normalWins) {
        assert.ok(reward.items.some(i=>i.id==='dokuro-geso'),'the boss should have left one');
        assert.match(reward.message,/ドクロゲソ/,'and the message should say so');
        break;
      }
      battle=game.continueArena();
    }
    assert.deepEqual(game.getItems().map(i=>[i.id,i.count]),[['dokuro-geso',1]],'it is in the item box');
    game.leaveArena();

    // Use it on the next run.
    const owned=game.getGameSession().owned.length;
    game.enterArena(game.getGameSession().owned[0].id);
    preview=game.previewEnemyCapture();
    assert.equal(preview.ok,true,preview.message);
    assert.ok(preview.target&&preview.target.name,'it names who would join');

    const caught=game.captureEnemy('cap-ui');
    assert.equal(caught.ok,true,caught.message);
    assert.ok(caught.captured&&caught.captured.name,'the UI gets a presented monster back');
    assert.equal(game.getGameSession().owned.length,owned+1,'it joined');
    assert.deepEqual(game.getItems(),[],'and cost the one item');
    assert.equal(game.getGameSession().deployed.length,0,'the run is over, nobody is in the ring');

    const again=game.captureEnemy('cap-ui');
    assert.equal(again.ok,false,'the same press does not catch a second');
    assert.equal(game.getGameSession().owned.length,owned+1);

    // What was caught is an ordinary monster: it can be fused like any other.
    game.leaveArena();
    const roster=game.getGameSession().owned;
    assert.ok(roster.length>=2);
    assert.ok(await api.fuseMonsters(game.presentSessionMonster(roster[0]),game.presentSessionMonster(roster[1])));
  } finally {
    Object.assign(arena,saved);
  }

  game.restartGame();
  assert.deepEqual(game.getItems(),[],'a fresh run holds no items');
  console.log('Capture UI: refusal without one, boss drop into the item box, preview, capture, single spend, double press, fusing what was caught, and restart passed.');
} finally {await server.close();}
