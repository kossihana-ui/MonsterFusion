import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
const manifest=JSON.parse(await readFile('src/mocks/battleSounds.json','utf8'));
const hashes=new Set();
for(const {id} of manifest){
  const wav=await readFile(`public/audio/battle/${id}.wav`);
  assert.equal(wav.toString('ascii',0,4),'RIFF');
  assert.equal(wav.readUInt32LE(40),wav.length-44);
  assert.equal(wav.readUInt32LE(24),32000);
  let peak=0,energy=0;
  for(let i=44;i<wav.length;i+=2){const v=wav.readInt16LE(i);peak=Math.max(peak,Math.abs(v));energy+=v*v;}
  assert(peak>1000 && peak<30000,`${id}: clipping or silent`);
  assert(energy>0);
  assert(Math.abs(wav.readInt16LE(44))<20 && Math.abs(wav.readInt16LE(wav.length-2))<20,`${id}: abrupt edge`);
  const hash=createHash('sha256').update(wav).digest('hex');
  assert(!hashes.has(hash),`${id}: duplicate sound`);hashes.add(hash);
}
console.log(`${manifest.length} distinct WAV files: headers, non-silence, headroom and faded edges passed.`);
const server=await createServer({server:{middlewareMode:true}});
try {
  const {battleSoundLayers}=await server.ssrLoadModule('/src/components/battleSound.ts');
  assert.deepEqual(battleSoundLayers('sig-fire','fire'),['battle/sig-fire']);
  assert.deepEqual(battleSoundLayers('death-bite','fire'),['battle/death-bite','battle/element-fire']);
  assert.deepEqual(battleSoundLayers('death-bite','water'),['battle/death-bite','battle/element-water']);
  assert.deepEqual(battleSoundLayers('death-bite','neutral'),['battle/death-bite']);
  assert.deepEqual(battleSoundLayers('future-move','light'),['battle/attack','battle/element-light']);
  console.log('Element routing: fixed, inherited, neutral and unknown moves passed.');
} finally {await server.close();}
const shortEnding=await readFile('public/audio/music/victory-hum-8.wav');
const rate=shortEnding.readUInt32LE(24);
for(let i=Math.ceil(2.54*rate);i<(shortEnding.length-44)/2;i++)assert.equal(shortEnding.readInt16LE(44+i*2),0,'Ending has an unwanted tail');
console.log('Victory closing note is silent after its short release.');
