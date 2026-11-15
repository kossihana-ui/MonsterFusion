import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const {moveHelp,highlightPart}=await server.ssrLoadModule('/src/shared/moveHelp.ts');
  const describe=id=>moveHelp({id});
  assert.equal(describe('hydro-ram').attacks,false);
  assert.match(describe('hydro-ram').lines.join(' '),/HPを魔力に応じて回復/);
  assert.equal(describe('crystal-ray').attacks,false);
  assert.match(describe('crystal-ray').lines.join(' '),/強化.*解除/);
  assert.match(describe('final-tail').summary,/反動で動けなくなる/);
  assert.match(describe('pierce-beak').lines.join(' '),/1.6倍.*0.5倍/);
  assert.match(describe('impact-horn').summary,/「守る」を無視/);
  assert.match(describe('twin-lash').lines.join(' '),/2回攻撃.*防御力を無視/);
  assert.equal(highlightPart({source:'bodyShape'}),'body');
  assert.equal(highlightPart({source:'tail'}),'tail');
  assert.equal(highlightPart({source:null}),undefined);
  const core=await server.ssrLoadModule('@core/core/index.ts');
  const {MOVE_CATALOGUE,getMoveBehavior}=core;
  for(const move of MOVE_CATALOGUE) assert.ok(describe(move.id).lines.length);

  // Every number the engine rolls against has to appear, as a number, in
  // what the player reads. 「確率で」 was being used for a 60% bind, a 30%
  // flinch and a 40% miss alike, which is how a move ends up feeling
  // different from what it said.
  const pct = chance => {
    const value = chance * 100;
    return `${value < 1 ? value.toFixed(1) : String(Math.round(value))}%`;
  };
  let odds = 0;
  for (const move of MOVE_CATALOGUE) {
    const b = getMoveBehavior(move.id);
    const text = describe(move.id).lines.join(' ');

    const groups = new Map();
    for (const applied of b.applies) {
      const key = `${applied.target}:${applied.status}`;
      groups.set(key, [...(groups.get(key) ?? []), applied]);
    }
    for (const group of groups.values()) {
      const entries = [...group].sort((x, y) => y.chance - x.chance);
      const best = entries[0];
      if (best.chance < 1) {
        odds++;
        assert.ok(text.includes(pct(best.chance)),
          `${move.name}: ${best.status} lands ${pct(best.chance)} of the time, unsaid — ${text}`);
      }
      if (entries.length > 1) {
        // Two entries for one status is "sometimes it lasts longer", not two
        // separate effects, and it has to read that way.
        const longer = entries[1];
        odds++;
        assert.ok(text.includes(pct(longer.chance / best.chance)),
          `${move.name}: the longer ${best.status} is unsaid — ${text}`);
        assert.ok(text.includes(`${longer.turns}ターン続く`),
          `${move.name}: does not say it can last ${longer.turns} turns`);
      }
    }
    if (b.successChance < 1) {
      odds++;
      assert.ok(text.includes(pct(1 - b.successChance)),
        `${move.name}: misses ${pct(1 - b.successChance)} of the time, unsaid — ${text}`);
    }
    if (b.instantDeathChance > 0) {
      odds++;
      assert.ok(text.includes(pct(b.instantDeathChance)),
        `${move.name}: kills outright ${pct(b.instantDeathChance)} of the time, unsaid — ${text}`);
    }
    if (b.repeatSuccessChance !== undefined) {
      odds++;
      assert.ok(text.includes(pct(b.repeatSuccessChance)),
        `${move.name}: repeated success is ${pct(b.repeatSuccessChance)}, unsaid — ${text}`);
    }
    assert.ok(!text.includes('確率で発動'), `${move.name}: still softens a number into 「確率で発動」`);

    // The flat claims were already right; they have to stay right.
    assert.equal(text.includes('相手の「守る」を無視して攻撃する'), b.piercesDefense, `${move.name}: 防御貫通`);
    assert.equal(text.includes('相手の防御力を無視する'), b.shattersDefense, `${move.name}: 砕牙`);
    assert.equal(text.includes('攻撃しない補助技'), !b.attacks, `${move.name}: attacks`);
    if (b.hits > 1) assert.ok(text.includes(`${b.hits}回攻撃`), `${move.name}: hit count`);
    if (b.restoreMp > 0) assert.ok(text.includes(`MPを${b.restoreMp}回復`), `${move.name}: MP`);
    for (const condition of b.conditions) {
      assert.ok(text.includes(`${condition.factor}倍`), `${move.name}: a ${condition.factor}x case is unsaid`);
    }
  }
  console.log(`Move help: healing, cleanse, recoil, guard conditions, multi-hit and source mapping passed.`);
  console.log(`技の説明：${MOVE_CATALOGUE.length}技ぶんの確率 ${odds}件が、すべて数字で書かれています。`);
} finally {await server.close();}
