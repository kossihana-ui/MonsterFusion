import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
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
