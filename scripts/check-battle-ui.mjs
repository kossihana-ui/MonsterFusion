import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { initialMonsters, createBattle, gameAdapter } = await server.ssrLoadModule('/src/mocks/game.ts');
  const { DEFAULT_BATTLE_CONFIG: config } = await server.ssrLoadModule('@core/core/index.ts');
  for (const skillIndex of [0, 1]) {
    const before = createBattle(initialMonsters[0], initialMonsters[1]);
    const snapshot = JSON.stringify(before);
    const player = before.coreState.combatants.find(c => c.side === 0);
    const skill = player.skills[skillIndex];
    const after = await gameAdapter.calculateBattleTurn(before, { kind: 'skill', skillId: skill.id });
    assert.equal(JSON.stringify(before), snapshot, 'input state must stay immutable');
    const action = after.coreState.log.find(e => e.actorId === player.id && e.kind === 'skill');
    assert.ok(action?.message.includes(skill.name), 'the selected skill must be used');
    assert.equal(after.coreState.combatants.find(c => c.side === 0).mp, player.mp + config.mpRegenPerTurn - skill.cost);
    assert.ok(after.logs.some(line => line.includes(`MP消費 ${skill.cost}`)));
  }
  const before = createBattle(initialMonsters[0], initialMonsters[1]);
  const after = await gameAdapter.calculateBattleTurn(before, 'defend');
  assert.ok(after.coreState.log.some(e => e.kind === 'defend' && e.actorId === before.coreState.combatants[0].id));
  assert.equal(after.coreState.combatants[0].mp, Math.min(99, before.coreState.combatants[0].mp + config.mpRegenPerTurn + config.defendMpBonus));
  assert.ok(after.coreState.log.some(e => e.targetId === before.coreState.combatants[0].id && e.mitigated > 0));
  assert.ok(after.logs.some(line => line.includes('守りで') && line.includes('軽減')));
  assert.ok(after.logs.some(line => line.includes(`MP回復 +${config.defendMpBonus}`)));
  await assert.rejects(gameAdapter.calculateBattleTurn(before, { kind: 'skill', skillId: 'missing' }));
  console.log('Battle UI adapter: both skills, MP cost, defend, invalid skill and immutability passed.');
} finally {
  await server.close();
}
