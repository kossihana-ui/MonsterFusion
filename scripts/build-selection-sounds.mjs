// Original oscillator synthesis: no samples, random values or external dependencies.
import { mkdirSync, writeFileSync } from "node:fs";
const rate = 48000, length = Math.round(rate * .48);
const root = "public/audio/selection";
mkdirSync(root, { recursive: true });
const variants = [
  { id: "round", start: 340, end: 590, sweep: .034, fm: .32, ratio: 2, decay: .075 },
  { id: "clear", start: 490, end: 810, sweep: .025, fm: .55, ratio: 3, decay: .085 },
  { id: "machine", start: 290, end: 560, sweep: .018, fm: 1.25, ratio: 2, decay: .065 },
];
const metrics = [];
for (const v of variants) {
  const dry = new Float64Array(length), output = new Float64Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    const f = v.end + (v.start - v.end) * Math.exp(-t / v.sweep);
    phase += 2 * Math.PI * f / rate;
    const attack = 1 - Math.exp(-t / .007);
    const envelope = attack * Math.exp(-t / v.decay);
    const modulation = v.fm * Math.exp(-t / .055) * Math.sin(phase * v.ratio);
    dry[i] = envelope * (Math.sin(phase + modulation) + .16 * Math.sin(phase * .5));
  }
  for (let i = 0; i < length; i++) {
    const delay = Math.round(.047 * rate);
    output[i] = dry[i] + (i >= delay ? .14 * dry[i-delay] : 0)
      + (i >= delay*2 ? .055 * dry[i-delay*2] : 0);
    // Fade the tail to exact silence and avoid a cut-off click.
    output[i] *= Math.min(1, (length - 1 - i) / (rate * .035));
  }
  const rms = Math.sqrt(output.reduce((n,x)=>n+x*x,0)/length);
  const peak = output.reduce((n,x)=>Math.max(n,Math.abs(x)),0);
  const gain = Math.min(.12 / rms, .65 / peak);
  output[0] = 0;
  const wav = Buffer.alloc(44 + length*2);
  wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
  wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
  wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28);
  wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
  wav.write("data",36); wav.writeUInt32LE(length*2,40);
  for(let i=0;i<length;i++) wav.writeInt16LE(Math.round(output[i]*gain*32767),44+i*2);
  writeFileSync(root+"/"+v.id+".wav",wav);
  metrics.push({name:v.id,durationSeconds:length/rate,peak:peak*gain,rms:rms*gain});
}
writeFileSync(root+"/measurements.json",JSON.stringify(metrics,null,2)+"\n");
console.log(metrics);
