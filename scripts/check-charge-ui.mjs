import assert from 'node:assert/strict';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
  const core=await server.ssrLoadModule('/src/../../MonsterFusion-Core/src/core/index.ts');
  const mash=await server.ssrLoadModule('/src/components/ChargeMash.tsx');
  const {looksAutomated}=mash;
  const perSecond=core.DEFAULT_BATTLE_CONFIG.maxChargePressesPerSecond;
  const behavior=core.getMoveBehavior('final-tail');
  const seconds=behavior.chargeSeconds;
  const cap=Math.round(seconds*perSecond);
  assert.equal(perSecond,15);
  assert.equal(cap,75,'five seconds at fifteen a second');

  // A seeded wobble, so this test does not flake.
  let seed=12345;
  const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const human=(mean,wobble,n)=>Array.from({length:n},()=>mean*(1+(rand()*2-1)*wobble));

  // Nobody playing by hand is ever accused.
  assert.equal(looksAutomated(human(140,.35,30),30,seconds,cap),false,'a steady player');
  assert.equal(looksAutomated(human(75,.3,60),60,seconds,cap),false,'a fast player');
  assert.equal(looksAutomated(human(70,.18,70),70,seconds,cap),false,'a very even player');
  assert.equal(looksAutomated(human(90,.4,12),12,seconds,cap),false,'too few presses to tell');
  assert.equal(looksAutomated([],0,seconds,cap),false,'and nobody who pressed nothing');

  // A timer is a timer.
  assert.equal(looksAutomated(Array(60).fill(50),60,seconds,cap),true,'perfectly regular');
  assert.equal(looksAutomated(human(50,.01,60),60,seconds,cap),true,'regular to the millisecond');
  assert.equal(looksAutomated(Array(200).fill(10),200,seconds,cap),true,'and far too many of them');

  // Whatever is sent, core pays out at most the ceiling.
  const tailed=core.createMonsterFromAnalysis({tail:'spiked',confidence:1},{rng:core.createSeededRandom(5),now:()=>0},{name:'T'});
  const damage=(charge)=>{
    const state=core.createDuelWithLoadouts(tailed,tailed,[{monsterId:tailed.id,skillIds:['final-tail']}]);
    for(const c of state.combatants){c.mp=99;c.hp=99999;}
    const next=core.stepTurn(state,core.createScriptedPolicy([{kind:'skill',skillId:'final-tail',charge}]),core.createSeededRandom(9));
    return next.log.flatMap(e=>e.effects??[]).filter(e=>e.type==='damage').map(e=>e.amount)[0];
  };
  const most=cap*behavior.chargeDamage;
  assert.equal(damage(cap),most);
  assert.equal(damage(1_000_000),most,'a macro buys nothing past the ceiling');
  assert.equal(damage(20),40,'and an honest twenty is still forty');

  console.log(`Charge UI: ${cap}-press ceiling enforced by core, and the automation check clears five human patterns while catching three machines.`);
} finally {await server.close();}
