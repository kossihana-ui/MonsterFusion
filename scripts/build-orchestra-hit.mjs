import { mkdirSync, writeFileSync } from 'node:fs';
// Original sample-style orchestral stab: brass formants, bowed ensemble,
// low orchestral impact and short stereo room. No borrowed recordings.
const rate = 44100, seconds = .72, count = Math.round(rate * seconds);
const dry = [new Float64Array(count), new Float64Array(count)];
const tau = 2 * Math.PI;
const sharp = process.argv.includes('--sharp');
const notes = sharp ? [73.416,146.832,220,293.664,587.328,1174.656] : [65.4064, 130.8128, 196, 261.6256, 311.127, 392, 523.251];
for (let n = 0; n < notes.length; n++) {
  for (let voice = 0; voice < 3; voice++) {
    const frequency = notes[n] * 2 ** ((voice - 1) * 7 / 1200);
    const pan = (voice - 1) * .48 + (n % 2 ? .12 : -.12);
    const gain = [Math.sqrt((1-pan)/2), Math.sqrt((1+pan)/2)];
    const delay = (n % 3) * .0018 + voice * .0011;
    for (let i = Math.ceil(delay * rate); i < count; i++) {
      const t = i/rate-delay;
      // Small pitch settling and independent phases avoid organ-like alignment.
      const phase = tau * frequency * (t + (sharp ? .0038 : .0007) * (1-Math.exp(-t*80)));
      const env = Math.min(1,t/.003) * Math.exp(-t*(sharp ? 11 : 7.5)) * Math.min(1,Math.max(0,((sharp ? .32 : .44)-t)/.14));
      let brass = 0, strings = 0;
      for (let h = 1; h <= 30 && frequency*h < 11000; h++) {
        const hz = frequency*h;
        const formant = .28 + 1.7*Math.exp(-(((hz-900)/650)**2)) + .85*Math.exp(-(((hz-2100)/1000)**2));
        const brightness = Math.exp(-hz/((sharp ? 8500 : 4400)*Math.exp(-t*(sharp ? 18 : 5))+1000));
        brass += Math.sin(phase*h + voice*.39) * formant * brightness / h ** .85;
        strings += Math.sin(phase*h*1.002 + n*.7 + voice) * Math.exp(-hz/6500) / h ** 1.2;
      }
      const value = env * (brass*(sharp ? .28 : .16) + strings*.045) * (n===0 ? 1.25 : 1);
      for (let c=0;c<2;c++) dry[c][i] += value*gain[c];
    }
  }
}
for(let i=0;i<count;i++) {
  const t=i/rate;
  // Pitched low impact, not a noisy cymbal tail.
  const impact = Math.sin(tau*(63*t + 1.8*(1-Math.exp(-t*45)))) * Math.exp(-t*26) * Math.min(1,t/.002)*.65;
  for(let c=0;c<2;c++) dry[c][i] += impact;
}
const samples = [new Float64Array(count),new Float64Array(count)];
let peak=0;
for(let c=0;c<2;c++) for(let i=0;i<count;i++) {
  let value=dry[c][i];
  for(const [ms,level] of [[23,.18],[41,.12],[67,.085],[103,.05],[149,.025]]) {
    const offset=Math.round((ms+c*4)*rate/1000);
    if(i>=offset) value+=dry[1-c][i-offset]*level;
  }
  value = Math.tanh(value*.9) * Math.min(1,(count-1-i)/(rate*.045));
  samples[c][i]=value; peak=Math.max(peak,Math.abs(value));
}
const wav = Buffer.alloc(44 + count * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22);
wav.writeUInt32LE(rate,24); wav.writeUInt32LE(rate*4,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34);
wav.write('data',36); wav.writeUInt32LE(count*4,40);
for(let i=0;i<count;i++) for(let c=0;c<2;c++) wav.writeInt16LE(Math.round(samples[c][i]/peak*27000),44+i*4+c*2);
const output = sharp ? 'orchestra-hit-sharp.wav' : 'orchestra-hit.wav';
mkdirSync('public/sounds', {recursive:true}); writeFileSync(`public/sounds/${output}`,wav);
console.log(`${output}: 0.72 seconds, peak 27000, PCM stereo.`);
