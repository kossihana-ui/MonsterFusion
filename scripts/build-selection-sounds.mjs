// Original oscillator synthesis: no samples, random values or external dependencies.
import { mkdirSync, writeFileSync } from "node:fs";
const rate = 48000;
const root = "public/audio/selection";
mkdirSync(root, { recursive: true });
const variants = [
  { id: "round", pitch: 220, harmonic: .16 },
  { id: "clear", pitch: 262, harmonic: .08 },
  { id: "machine", pitch: 196, harmonic: .24 },
  { id: "clear-layered", pitch: 262, harmonic: .08, duration: .84, upper: .24 },
];
const metrics = [];
for (const v of variants) {
  const length = Math.round(rate * (v.duration ?? .48));
  const dry = new Float64Array(length), output = new Float64Array(length);
  let phase = 0;
  for (let i = 0; i < length; i++) {
    const t = i / rate;
    // Almost level pitch: no large upward scoop that makes the sound bounce.
    const f = v.pitch;
    phase += 2 * Math.PI * f / rate;
    const attack = Math.sin(Math.min(1, t / .025) * Math.PI / 2) ** 2;
    const release = Math.min(1, Math.max(0, (t - (v.upper ? .16 : .09)) / (v.upper ? .62 : .33)));
    const envelope = attack * Math.cos(release * Math.PI / 2) ** 4;
    // Stable harmonic tones only: no noise, detuning, echo or metallic FM tail.
    // Higher partials disappear first, leaving a clean, dark release.
    // A quiet perfect fifth adds height without bringing back noisy breath or beating.
    const upper = (v.upper ?? 0) * Math.exp(-Math.max(0, t - .16) / .28) * Math.sin(phase * 1.5);
    const tone = Math.sin(phase) + upper + v.harmonic * Math.exp(-t / .075) * Math.sin(phase * 2);
    dry[i] = envelope * tone;
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
