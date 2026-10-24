// Original oscillator synthesis: no samples, random values or external dependencies.
import { mkdirSync, writeFileSync } from "node:fs";
const rate = 48000, length = Math.round(rate * .64);
const root = "public/audio/selection";
mkdirSync(root, { recursive: true });
const variants = [
  { id: "round", pitch: 440, harmonic: .20, breath: .16 },
  { id: "clear", pitch: 554, harmonic: .14, breath: .22 },
  { id: "machine", pitch: 392, harmonic: .32, breath: .12 },
];
const metrics = [];
for (const v of variants) {
  const dry = new Float64Array(length), output = new Float64Array(length);
  let phase = 0, seed = 731, low = 0, high = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    // Almost level pitch: no large upward scoop that makes the sound bounce.
    const f = v.pitch * (1 + .008 * Math.exp(-t / .10));
    phase += 2 * Math.PI * f / rate;
    const attack = Math.sin(Math.min(1, t / .035) * Math.PI / 2) ** 2;
    const envelope = attack * Math.exp(-Math.max(0, t - .105) / .115);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    low += .18 * (noise - low);
    high += .035 * (noise - high);
    const air = (low - high) * Math.exp(-t / .095);
    const tone = Math.sin(phase) + v.harmonic * Math.sin(phase * 2)
      + .07 * Math.sin(phase * 3) + .08 * Math.sin(phase * 1.003);
    dry[i] = envelope * (tone + v.breath * air * 3);
  }
  for (let i = 0; i < length; i++) {
    output[i] = dry[i];
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
