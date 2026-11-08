import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const game=await server.ssrLoadModule('/src/mocks/game.ts');
  const core=await server.ssrLoadModule('@core/core/index.ts');
  let sawBoss=false, made=false, sawDrop=false;
  for(let attempt=0;attempt<100&&!(made&&sawBoss);attempt++) {
    game.restartGame(12345+attempt);
    for(let run=0;run<12&&game.getGameSession().status==='playing';run++) {
      const owned=game.getGameSession().owned;
      const chosen=owned.find(m=>m.id==='starter-ignis')??owned[0];
      let state=game.enterArena(chosen.id);
      for(let fight=0;fight<6;fight++) {
        sawBoss ||= state.arenaRun.encounter.isBoss;
        const snapshot=JSON.stringify(state.arenaRun), old=state.arenaRun;
        for(let turn=0;turn<200&&state.status==='active';turn++) {
          const [a,b]=state.coreState.combatants;
          const actions=[{action:'attack',damage:core.expectedDamage(a,b)},...a.skills.filter(s=>s.cost<=a.mp+core.DEFAULT_BATTLE_CONFIG.mpRegenPerTurn).map(s=>({action:{kind:'skill',skillId:s.id},damage:core.getMoveBehavior(s.id).heal?0:core.expectedDamage(a,b,s)}))];
          actions.sort((x,y)=>y.damage-x.damage);
          state=await game.gameAdapter.calculateBattleTurn(state,actions[0].action);
        }
        assert.equal(JSON.stringify(old),snapshot);
        if(state.status!=='won')break;
        assert.equal(game.continueArena().arenaRun.encounter.index,fight,'reward cannot be skipped');
        const reward=game.receiveArenaReward();sawDrop ||= reward.parts.length>0;
        assert.equal(game.getPartInventory(),game.getGameSession().inventory);
        const inventory=JSON.stringify(game.getPartInventory());game.receiveArenaReward();
        assert.equal(JSON.stringify(game.getPartInventory()),inventory);
        const stacks=game.getPartInventory().stacks;
        const ids=core.getSoulMakeRecipe().requiredLoci.map(locus=>stacks.find(s=>s.count>0&&s.part.locus===locus)?.part.id);
        if(!made&&ids.every(Boolean)) {
          const selection={partIds:ids,name:'ソウルテスト'};
          const preview=core.previewSoulMake(selection,game.getPartInventory());assert.equal(preview.ok,true);
          const before=game.getGameSession(), request='soul-test-'+attempt;
          const result=game.makeSoul(selection,request);assert.equal(result.ok,true);
          assert.equal(game.getGameSession().owned.length,before.owned.length+1);
          const monster=game.getCoreMonster(result.monster.id);
          for(const placed of preview.placed) {
            assert.equal(monster.phenotype[placed.locus],placed.value);
            assert.equal(core.countOf(game.getPartInventory(),placed.part.id),core.countOf(before.inventory,placed.part.id)-1);
          }
          const after=game.getGameSession();assert.equal(game.makeSoul(selection,request).duplicate,true);assert.equal(game.getGameSession(),after);
          const saved=core.deserializeSaveFile(core.serializeSaveFile([],{session:after}));assert.equal(saved.ok,true);
          const restored=core.restoreSession(saved.value);assert.deepEqual(restored.owned.map(m=>m.id),after.owned.map(m=>m.id));
          made=true;
        }
        if(!reward.canContinue)break;
        state=game.continueArena();assert.equal(state.playerHp,state.player.stats.hp);
      }
      game.leaveArena();
    }
  }
  assert.ok(sawDrop&&sawBoss&&made,JSON.stringify({sawDrop,sawBoss,made}));
  console.log('Arena/Soul UI: actual wins, rewards, duplicate protection, shared inventory, boss, soul creation, part expression/consumption and save compatibility passed.');
}finally{await server.close();}
