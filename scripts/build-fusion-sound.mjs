// Original centrifuge-inspired synthesis. No recordings or random noise.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
const rate = 48000, duration = 2.4, length = Math.round(rate * duration);
const samples = new Float64Array(length);
const motorEnd = 1.86, birthAt = 1.88;
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
// End with the exact approved clear tone, at a restrained level.
const birth=readFileSync("public/audio/selection/clear.wav");
assert.equal(birth.toString("ascii",0,4),"RIFF");
assert.equal(birth.readUInt32LE(24),rate);
assert.equal(birth.readUInt16LE(22),1);
for(let i=0;i<(birth.length-44)/2;i++) {
  const target=Math.round(birthAt*rate)+i;
  if(target<length) samples[target]+=birth.readInt16LE(44+i*2)/32768*.85;
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
writeFileSync("public/audio/selection/fusion-motor.wav",wav);
console.log({duration,peak,motorEnd,birthAt,format:"48 kHz mono PCM16"});
