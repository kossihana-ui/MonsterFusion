// Estimated from the user's two hummed recordings. Timing stays explicit in seconds;
// no extra syncopation, accompaniment or automatic rhythmic quantization.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const scores=JSON.parse(readFileSync('src/mocks/hummedVictory.json','utf8'));
const sr=44100;
mkdirSync('public/audio/music',{recursive:true});
for(const score of scores){
  const duration=Math.max(...score.notes.map(([,s,d])=>s+d),score.endTom ?? 0)+.45;
  const pcm=new Float64Array(Math.ceil(duration*sr));
  for(const [pitch,start,length] of score.notes){
    const short=score.shortEnding && start === score.notes.at(-1)[1];
    const tail=short ? .008 : .09;
    const f=440*2**((pitch+12+(score.transpose ?? 0)-69)/12);
    for(let i=0;i<(length+tail)*sr;i++){
      const t=i/sr,k=Math.round((start+.05)*sr)+i;if(k>=pcm.length)break;
      const attack=score.soft ? Math.sin(Math.min(1,t/(short ? .005 : .018))*Math.PI/2)**2 : Math.min(1,t/.009),release=t<length?1:Math.max(0,1-(t-length)/tail)**2;
      const p=2*Math.PI*f*t;
      const brass=Math.sin(p)+(score.soft ? .10 : .27)*Math.sin(2*p)+(score.soft ? .015 : .1)*Math.sin(3*p)*Math.exp(-t*5);
      pcm[k]+=brass*attack*release*.45;
    }
  }
  if (score.endTom !== undefined) {
    // One original high electronic tom: a fast pitch fall and damped membrane modes.
    // No noise burst or sampled game sound; keep the attack rounded rather than metallic.
    for(let i=0;i<.3*sr;i++) {
      const t=i/sr,k=Math.round((score.endTom+.05)*sr)+i;
      if(k>=pcm.length)break;
      // The deeper revision avoids the chirpy, large pitch sweep and metallic mode.
      const base=score.deepTom ? 155 : 300, sweep=score.deepTom ? 45 : 260;
      const phase=2*Math.PI*(base*t+sweep*.022*(1-Math.exp(-t/.022)));
      const env=Math.sin(Math.min(1,t/(score.deepTom ? .005 : .003))*Math.PI/2)**2*Math.exp(-t/(score.deepTom ? .085 : .055))*Math.max(0,1-t/.3);
      pcm[k]+=(score.deepTom ? .48 : .42)*env*(Math.sin(phase)+(score.deepTom ? .04 : .18)*Math.sin(phase*1.58)*Math.exp(-t/ .025));
    }
  }
  const dry=pcm.slice();
  for(let i=Math.round(.065*sr);i<pcm.length;i++) {
    if(score.shortEnding && i/sr >= score.notes.at(-1)[1]+.05) continue;
    pcm[i]+=dry[i-Math.round(.065*sr)]*.065;
  }
  let peak=0;for(const value of pcm)peak=Math.max(peak,Math.abs(value));
  assert(peak>0);
  const wav=Buffer.alloc(44+pcm.length*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length*2,40);
  pcm.forEach((v,i)=>{const sample=Math.round(v/peak*(score.soft ? .6 : .7)*32767);assert(Math.abs(sample)<30000);wav.writeInt16LE(sample,44+i*2);});
  assert.equal(wav.readInt16LE(wav.length-2),0);
  writeFileSync(`public/audio/music/${score.id}.wav`,wav);
  console.log(`${score.id}: ${duration.toFixed(2)} seconds, ${score.notes.length} notes, unclipped PCM.`);
}
