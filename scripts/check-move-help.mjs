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
  const {MOVE_CATALOGUE}=await server.ssrLoadModule('@core/core/index.ts');
  for(const move of MOVE_CATALOGUE) assert.ok(describe(move.id).lines.length);
  console.log('Move help: healing, cleanse, recoil, guard conditions, multi-hit and source mapping passed.');
} finally {await server.close();}
