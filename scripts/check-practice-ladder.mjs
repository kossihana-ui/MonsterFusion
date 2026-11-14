// 「はじめての挑戦」: the practice ladder, played through the UI adapter.
//
// Three promises are made at the gate, and all three are load-bearing: the
// opponents are weaker, a defeat takes nobody, and nothing is won. The last
// one is what stops a risk-free ladder becoming the best way to farm parts.
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const game = await server.ssrLoadModule('/src/mocks/game.ts');
  const core = await server.ssrLoadModule('@core/core/index.ts');

  const practice = core.practiceSeason();
  assert.equal(practice.practice, true);
  assert.equal(core.seasons()[0].id, practice.id, 'practice is offered first');
  assert.ok(
    core.rankedSeasons().every(s => s.id !== practice.id),
    'practice is not a ladder a streak is ranked on',
  );

  async function fight(state) {
    for (let turn = 0; turn < 300 && state.status === 'active'; turn++) {
      const [me, foe] = state.coreState.combatants;
      const options = [{ action: { kind: 'attack' }, damage: core.expectedDamage(me, foe) }];
      for (const skill of me.skills) {
        if (skill.cost > me.mp) continue;
        options.push({
          action: { kind: 'skill', skillId: skill.id },
          damage: core.getMoveBehavior(skill.id).heal ? 0 : core.expectedDamage(me, foe, skill),
        });
      }
      options.sort((a, b) => b.damage - a.damage);
      state = await game.gameAdapter.calculateBattleTurn(state, options[0].action);
    }
    return state;
  }

  let sawDefeat = false, sawReward = false, wins = 0;
  for (let attempt = 0; attempt < 12 && !(sawDefeat && sawReward); attempt++) {
    game.restartGame(4242 + attempt);
    const owned = game.getGameSession().owned;
    const chosen = owned.find(m => m.id === 'starter-ignis') ?? owned[0];
    const before = owned.length;

    let state = game.enterArena(chosen.id, practice.id);
    assert.equal(state.arenaRun.practice, true, 'the run knows it is practice');

    for (let n = 0; n < 12; n++) {
      state = await fight(state);
      if (state.status !== 'won') break;
      wins++;
      const reward = game.receiveArenaReward();
      sawReward = true;
      assert.deepEqual(reward.parts, [], 'practice drops no parts');
      assert.equal(game.getPartInventory().stacks.length, 0, 'and the box stays empty');
      assert.equal(game.getItems().reduce((n2, i) => n2 + i.count, 0), 0, 'and no ドクロゲソ');
      state = game.continueArena();
    }

    if (state.status === 'lost') {
      sawDefeat = true;
      const session = game.getGameSession();
      assert.equal(session.status, 'playing', 'a practice defeat is not a game over');
      assert.equal(session.owned.length, before, 'nobody was taken');
      assert.ok(session.owned.some(m => m.id === chosen.id), `${chosen.name} came home`);
    }
    game.leaveArena();
  }

  assert.ok(sawDefeat, 'the run never ended in a defeat, so nothing was proven');
  assert.ok(sawReward, 'the run never reached a reward screen');

  // And the ordinary ladder is untouched: there, a defeat still costs.
  let lostOne = false;
  for (let attempt = 0; attempt < 12 && !lostOne; attempt++) {
    game.restartGame(99 + attempt);
    const owned = game.getGameSession().owned;
    const chosen = owned[0];
    const before = owned.length;
    let state = game.enterArena(chosen.id, core.freeSeason(`real-${attempt}`).id);
    assert.notEqual(state.arenaRun.practice, true);
    state = await fight(state);
    if (state.status === 'lost') {
      lostOne = true;
      assert.equal(game.getGameSession().owned.length, before - 1, 'a real defeat still takes the monster');
    }
    game.leaveArena();
  }
  assert.ok(lostOne, 'never lost an ordinary fight, so the comparison is untested');

  console.log(`Practice ladder: ${wins} practice wins with no drops, a defeat that took nobody, and an ordinary defeat that did.`);
} finally {
  await server.close();
}
