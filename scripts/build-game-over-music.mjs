import {mkdirSync,writeFileSync} from 'node:fs';
// Original, soft electronic game-over phrase. No samples or borrowed melody.
const rate=44100,seconds=7,n=rate*seconds;
const channels=[new Float64Array(n),new Float64Array(n)];
function note(midi,start,duration,gain,pan=0) {
  const hz=440*2**((midi-69)/12);
  for(let i=Math.floor(start*rate);i<Math.min(n,(start+duration)*rate);i++){
    const t=i/rate-start,remaining=duration-t;
    const env=Math.min(1,t/.035)*Math.min(1,remaining/.55)*Math.exp(-t*.65);
    const phase=2*Math.PI*hz*t;
    const wave=Math.sin(phase)+.16*Math.sin(phase*2)+.055*Math.sin(phase*3);
    for(let c=0;c<2;c++)channels[c][i]+=wave*gain*env*(c===0?1-pan:1+pan);
  }
}
[[64,0],[62,.75],[59,1.5],[57,2.25],[52,3]].forEach(([pitch,start])=>note(pitch,start,start===3?2.5:1.35,.17));
[[45,0,3],[52,0,3],[57,0,3],[40,3,3.4],[47,3,3.4],[55,3,3.4]].forEach(([pitch,start,length],i)=>note(pitch,start,length,.035,i%2?.25:-.25));
for(let c=0;c<2;c++) for(let i=n-1;i>=0;i--) for(const [delay,gain] of [[.16,.13],[.31,.08]]){
  const j=i-Math.round((delay+c*.009)*rate);if(j>=0)channels[c][i]+=channels[c][j]*gain;
}
let peak=0;for(const channel of channels)for(const v of channel)peak=Math.max(peak,Math.abs(v));
const out=Buffer.alloc(44+n*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(2,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(n*4,40);
for(let i=0;i<n;i++)for(let c=0;c<2;c++)out.writeInt16LE(Math.round(channels[c][i]/peak*.72*32767*Math.min(1,(n-i)/(rate*.25))),44+i*4+c*2);
mkdirSync('public/audio/music',{recursive:true});writeFileSync('public/audio/music/game-over.wav',out);
console.log('game-over.wav: 7 seconds, stereo PCM, peak 0.72');
