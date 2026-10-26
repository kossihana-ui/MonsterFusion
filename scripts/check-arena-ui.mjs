import assert from 'node:assert/strict';
import { createServer } from 'vite';
const server = await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const game = await server.ssrLoadModule('/src/mocks/game.ts');
  const core = await server.ssrLoadModule('@core/core/index.ts');
  let sawReward = false, sawBoss = false, sawDrop = false;
  for (let attempt = 0; attempt < 80 && !(sawBoss && sawDrop); attempt++) {
    let state = game.enterArena(game.initialMonsters[attempt % 3].id);
    assert.equal(game.resumeArena().enemy.id, state.enemy.id);
    for (let fight = 0; fight < 6; fight++) {
      if (state.arenaRun.encounter.isBoss) { sawBoss = true; assert.equal(state.arenaRun.wins, 5); }
      const before = JSON.stringify(state.arenaRun);
      const untouched = state.arenaRun;
      while (state.status === 'active') {
        const [a,b] = state.coreState.combatants;
        const affordable = a.skills.filter(s => s.cost <= a.mp + core.DEFAULT_BATTLE_CONFIG.mpRegenPerTurn);
        const skill = affordable.sort((x,y)=>core.expectedDamage(a,b,y)-core.expectedDamage(a,b,x))[0];
        state = await game.gameAdapter.calculateBattleTurn(state, skill ? {kind:'skill',skillId:skill.id} : 'attack');
      }
      assert.equal(JSON.stringify(untouched), before);
      if (state.status !== 'won') break;
      assert.equal(game.continueArena().arenaRun.encounter.index, fight, 'cannot skip reward');
      const reward = game.receiveArenaReward(); sawReward = true;
      sawDrop ||= reward.parts.length > 0;
      const inventory = JSON.stringify(game.getPartInventory());
      game.receiveArenaReward();
      assert.equal(JSON.stringify(game.getPartInventory()), inventory, 'duplicate reward');
      if (!reward.canContinue) break;
      state = game.continueArena();
      assert.equal(state.playerHp, state.player.stats.hp);
      assert.equal(state.arenaRun.encounter.index, fight + 1);
    }
    game.leaveArena();
  }
  assert.ok(sawReward && sawDrop && sawBoss, 'real runs reach rewards, drops and boss');
  const stack = game.getPartInventory().stacks[0];
  const [a,b] = game.initialMonsters;
  const parents = JSON.stringify([game.getCoreMonster(a.id),game.getCoreMonster(b.id)]);
  assert.equal(game.previewMaterial(a,b,stack.part.id).guaranteedExpression, true);
  const child = (await game.gameAdapter.fuseMonsters(a,b,stack.part.id)).child;
  assert.equal(game.getCoreMonster(child.id).phenotype[stack.part.locus], stack.part.value);
  assert.equal(core.countOf(game.getPartInventory(), stack.part.id), stack.count - 1);
  assert.equal(JSON.stringify([game.getCoreMonster(a.id),game.getCoreMonster(b.id)]), parents);
  const inventory = JSON.stringify(game.getPartInventory());
  await assert.rejects(game.gameAdapter.fuseMonsters(a,a,stack.part.id));
  assert.equal(JSON.stringify(game.getPartInventory()),inventory);
  console.log('Arena UI: resume, reward gating, duplicate protection, drops, fifth-win boss, full heal, material expression/consumption and parent immutability passed.');
} finally { await server.close(); }
