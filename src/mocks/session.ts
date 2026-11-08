import type { GameAdapter, Monster } from '../shared/ui';

// Temporary UI session ownership. Canonical monsters stay in core unchanged.
// Replace this wrapper with the core session API when available.
export function createSessionAdapter(base: GameAdapter, initial: Monster[], onChange: (owned: Monster[]) => void): GameAdapter {
  let owned = [...initial];
  let fusing = false;
  const has = (id: string) => owned.some(monster => monster.id === id);
  const publish = () => onChange([...owned]);
  return {
    async fuseMonsters(a, b, partId) {
      if (fusing || a.id === b.id || !has(a.id) || !has(b.id)) throw new Error('所持している別々の2体を選んでください。');
      fusing = true;
      try {
        const result = await base.fuseMonsters(a, b, partId);
        owned = [...owned.filter(m => m.id !== a.id && m.id !== b.id), result.child];
        publish();
        return result;
      } finally { fusing = false; }
    },
    async calculateBattleTurn(state, action) {
      if (state.status !== 'active') return state;
      if (!has(state.player.id)) throw new Error('このモンスターは所持していません。');
      const next = await base.calculateBattleTurn(state, action);
      // Settle before animation, so leaving the screen cannot undo a defeat.
      if (next.status === 'lost') {
        owned = owned.filter(m => m.id !== next.player.id);
        publish();
      }
      return next;
    },
  };
}
