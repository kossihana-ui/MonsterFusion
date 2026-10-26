// Original deterministic synthesis. No sampled game audio or game RNG.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { MOVE_CATALOGUE } = await server.ssrLoadModule('@core/core/index.ts');
  const extras = [['attack','通常攻撃'],['defend','守る'],['strike','基本技'],['sig-neutral','インパクト'],['sig-fire','フレアバースト'],['sig-water','アクアランス'],['sig-earth','ストーンクラッシュ'],['sig-wind','ゲイルスラッシュ'],['sig-light','レイディアンス'],['sig-dark','アンブラルファング'],['chest','宝箱が開く'],['collect','パーツ獲得']];
  const sounds = [...MOVE_CATALOGUE.map(m => ({id:m.id,name:m.name,major:m.category==='finisher'})), ...extras.map(([id,name])=>({id,name,major:false}))];
  await mkdir('public/audio/battle',{recursive:true});
  for (const [index, sound] of sounds.entries()) {
    const id=sound.id, sr=32000, duration=sound.major?1.18:.68, count=Math.ceil(sr*duration);
    const out=new Float64Array(count); let seed=149+index*701, smooth=0;
    const magic=/eye|gaze|ray|crystal|soul|royal|pulse|pollen|sig|collect/.test(id);
    const sweep=/tail|lash|whip|wing|slash|wind|fin/.test(id);
    const double=/twin|double|multi|rush/.test(id);
    const base=magic?135+index*4:65+index*2;
    for(let i=0;i<count;i++) {
      const t=i/sr; seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      smooth=.84*smooth+.16*(seed/2147483648-1);
      const attack=Math.min(1,t/.012), release=Math.pow(1-t/duration,2);
      let v=0;
      for(let hit=0;hit<(double?2:1);hit++) {
        const u=t-hit*.17;if(u<0)continue;
        const phase=2*Math.PI*(base*u+(magic?65:-25)*u*u);
        v+=Math.sin(phase+ (magic?1.8:.5)*Math.sin(2*Math.PI*(base*.5)*u))*Math.exp(-u*(magic?4:10))*.45;
        v+=Math.sin(2*Math.PI*(45*u+2*(1-Math.exp(-u*30))))*Math.exp(-u*18)*.3;
      }
      if(sweep) v+=smooth*.65*Math.sin(Math.PI*Math.min(1,t/.4));
      else v+=smooth*(magic?.08:.35)*Math.exp(-t*22);
      if(magic) v+=Math.sin(2*Math.PI*base*1.5*t)*.18*Math.exp(-t*4)*( .65+.35*Math.cos(t*(18+index)));
      if(id==='chest') v+=Math.sin(2*Math.PI*310*t)*Math.exp(-Math.abs(t-.22)*35)*.4;
      if(id==='collect') v+=Math.sin(2*Math.PI*(220*t+150*t*t))*.25*Math.exp(-t*4);
      out[i]=v*attack*release;
    }
    // Quiet, dark short reflections; fade ends and normalize with headroom.
    for(let i=count-1;i>=0;i--) if(i>sr*.09)out[i]+=out[i-Math.floor(sr*.09)]*.16;
    const peak=Math.max(...out.map(Math.abs));
    const wav=Buffer.alloc(44+count*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
    out.forEach((v,i)=>wav.writeInt16LE(Math.round(v/peak*.72*32767*Math.min(1,(count-i)/320)),44+i*2));
    await writeFile(`public/audio/battle/${id}.wav`,wav);
  }
  await writeFile('src/mocks/battleSounds.json',JSON.stringify(sounds,null,2)+'\n');
  console.log(`Generated ${sounds.length} original battle and loot sounds.`);
} finally {await server.close();}
