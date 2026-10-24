// Original centrifuge, latch and pneumatic-door synthesis. No recordings.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const rate = 48000, duration = 3.6, length = Math.round(rate * duration);
const samples = new Float64Array(length);
const motorEnd = 1.86, latchAt = 1.89, doorAt = 2.08, ventAt = 2.17;
const smooth = x => { x=Math.max(0,Math.min(1,x)); return x*x*(3-2*x); };
let shaft = 0, pulse = 0, housing = 0;
for (let i=0; i<Math.round(motorEnd*rate); i++) {
  const t=i/rate, acceleration=smooth(t/1.65);
  const frequency=78+242*acceleration;
  shaft += 2*Math.PI*frequency/rate;
  pulse += 2*Math.PI*(7+65*acceleration)/rate;
  housing += 2*Math.PI*(49+19*acceleration)/rate;
  // The low rotor pulse becomes a smooth fast vibration. Soft harmonic layers
  // suggest a sealed motor without hiss, percussion or sharp high frequencies.
  const ripple=1-(.27-.13*acceleration)*(1-Math.cos(pulse))*.5;
  const rotor=Math.sin(shaft)+.24*Math.sin(shaft*2)+.075*Math.sin(shaft*3);
  const envelope=smooth(t/.16)*(1-smooth((t-1.74)/.12));
  samples[i]=envelope*(.095+.055*acceleration)*
    (rotor*ripple+.23*Math.sin(housing));
}
// Reproducible filtered noise is intentional here: metal contact and escaping air.
let seed=1927, contact=0, airLow=0, airBass=0;
for(let i=0;i<length;i++) {
  const t=i/rate;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/2147483648-1;
  contact+=.25*(noise-contact);
  airLow+=.19*(noise-airLow);
  airBass+=.018*(noise-airBass);
  for(const [start,weight,frequencies] of [
    [latchAt,.66,[173,379,613]], [doorAt,1,[67,113,241]],
  ]) {
    const age=t-start;
    if(age<0 || age>.85) continue;
    const onset=smooth(age/.002);
    const modes=frequencies.reduce((sum,f,j)=>sum+
      Math.sin(2*Math.PI*f*age)*Math.exp(-age/(.14-j*.035))/(j+1),0);
    samples[i]+=weight*onset*(.28*modes+.5*contact*Math.exp(-age/.023));
  }
  const age=t-ventAt;
  if(age>=0) {
    const pressure=smooth(age/.025)*Math.exp(-age/.42)*
      (1-smooth((age-.9)/.35));
    samples[i]+=.6*(airLow-airBass)*pressure;
    // Low mechanical sliding resonance under the air release.
    samples[i]+=.045*Math.sin(2*Math.PI*(83*age-7*age*age))*pressure;
  }
  samples[i]*=1-smooth((t-3.35)/.2);
}
const peak=samples.reduce((p,x)=>Math.max(p,Math.abs(x)),0);
assert.ok(peak<.65);
assert.equal(samples[0],0);
assert.equal(samples[length-1],0);
const wav=Buffer.alloc(44+length*2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length-8,4); wav.write("WAVEfmt ",8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*2,28);
wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
wav.write("data",36); wav.writeUInt32LE(length*2,40);
for(let i=0;i<length;i++) wav.writeInt16LE(Math.round(samples[i]*32767),44+i*2);
writeFileSync("public/audio/selection/fusion-motor-door.wav",wav);
console.log({duration,peak,motorEnd,latchAt,doorAt,ventAt,format:"48 kHz mono PCM16"});
