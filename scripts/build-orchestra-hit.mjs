import { mkdirSync, writeFileSync } from 'node:fs';
// Original synthesized brass/string chord. No sampled recordings or randomness.
const rate = 44100, seconds = .65, count = Math.round(rate * seconds);
const samples = new Float64Array(count);
for (let i = 0; i < count; i++) {
  const t = i / rate;
  const envelope = Math.min(1, t / .005) * Math.exp(-t * 7) * Math.min(1, (seconds - t) / .08);
  for (const frequency of [130.8128, 196, 261.6256, 329.6276, 392]) {
    for (let h = 1; h <= 9; h++) {
      const brass = Math.sin(2 * Math.PI * frequency * h * t) / h ** 1.65 * Math.exp(-t * h * 1.5);
      const strings = (Math.sin(2 * Math.PI * frequency * 1.003 * h * t) + Math.sin(2 * Math.PI * frequency * .997 * h * t)) / h ** 2;
      samples[i] += envelope * (brass * .75 + strings * .125);
    }
  }
}
const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
wav.write('data',36); wav.writeUInt32LE(count*2,40);
samples.forEach((sample,i) => wav.writeInt16LE(Math.round(sample / peak * 24000),44+i*2));
mkdirSync('public/sounds', {recursive:true}); writeFileSync('public/sounds/orchestra-hit.wav',wav);
console.log('Original orchestra hit: 0.65 seconds, peak 24000, PCM mono.');
