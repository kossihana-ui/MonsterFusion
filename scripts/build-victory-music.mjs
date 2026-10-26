// MonsterFusion original fanfare: hand-composed notes, synthesized instruments.
// No third-party melodies, samples, or game RNG.
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const rate=44100, beat=.36, duration=5.3;
const left=new Float64Array(Math.ceil(rate*duration)),right=new Float64Array(left.length);
function note(midi,start,length,gain,pan=0,voice='brass') {
  const f=440*2**((midi-69)/12), release=voice==='bass'?.12:.24;
  for(let i=0;i<(length+release)*rate;i++) {
    const t=i/rate, pos=Math.round(start*rate)+i;if(pos>=left.length)break;
    const env=Math.min(1,t/.018)*Math.exp(-Math.max(0,t-length)/.065)*Math.min(1,(length+release-t)/.025);
    const p=2*Math.PI*f*t;
    // Rounded electronic brass: the upper partials soften during each note.
    const bright=Math.exp(-t*2.8);
    let s=Math.sin(p);
    if(voice==='brass')s+=bright*(.36*Math.sin(2*p)+.17*Math.sin(3*p)+.065*Math.sin(4*p));
    if(voice==='bell')s+=.16*Math.sin(3*p)*Math.exp(-t*9);
    s*=env*gain;
    left[pos]+=s*Math.sqrt((1-pan)/2);right[pos]+=s*Math.sqrt((1+pan)/2);
  }
}
// A rising answer phrase in D major, with a contrasting Gmaj7 → Asus4 → D cadence.
const melody=[[66,0,.65],[69,.75,.35],[74,1.25,1.05],[73,2.5,.45],[69,3,.7],[71,4,.7],[67,5,.45],[64,5.75,.75],[69,7,.5],[66,7.75,.5],[74,8.5,2.3]];
for(const [pitch,start,len] of melody){note(pitch,start*beat,len*beat,.24,-.12);note(pitch-12,start*beat,len*beat,.1,.15);}
for(const [start,length,chord] of [[0,2.4,[50,57,62,66]],[2.5,1.2,[49,57,61,64]],[4,2.5,[43,55,59,66]],[7,1.35,[45,57,62,64]],[8.5,3.2,[38,50,57,62,66]]]) {
  chord.forEach((pitch,i)=>note(pitch,start*beat,length*beat,.055,i%2?.55:-.55,i<2?'bass':'brass'));
}
// Quiet high accents and pitched low percussion, without a noisy cymbal tail.
for(const [pitch,start] of [[81,8.5],[78,8.8],[74,9.1]])note(pitch,start*beat,.55,.028,.4,'bell');
for(const start of [0,1.25,4,7,8.5]) {
  for(let i=0;i<rate*.18;i++){const t=i/rate,k=Math.round(start*beat*rate)+i,v=Math.sin(2*Math.PI*(48*t+2*(1-Math.exp(-t*30))))*Math.exp(-t*27)*.14;left[k]+=v;right[k]+=v;}
}
// Stereo early reflections leave a natural, finite tail.
const a=left.slice(),b=right.slice();
for(let i=0;i<left.length;i++)for(const [delay,gain] of [[.085,.16],[.163,.11],[.277,.065]]){const k=i-Math.round(delay*rate);if(k>=0){left[i]+=b[k]*gain;right[i]+=a[k]*gain;}}
let peak=0;for(let i=0;i<left.length;i++)peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
const wav=Buffer.alloc(44+left.length*4);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(left.length*4,40);
for(let i=0;i<left.length;i++)for(const [channel,data] of [left,right].entries()){const fade=Math.min(1,(left.length-1-i)/(rate*.08));const value=Math.round(data[i]/peak*.76*32767*fade);assert(Math.abs(value)<30000);wav.writeInt16LE(value,44+i*4+channel*2);}
mkdirSync('public/audio/music',{recursive:true});writeFileSync('public/audio/music/victory.wav',wav);
assert.equal(wav.readInt16LE(wav.length-2),0);
console.log(`Original victory fanfare: ${duration}s, stereo PCM, no clipping, silent ending. ${wav.length} bytes.`);
