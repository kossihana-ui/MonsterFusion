// Original deterministic synthesis. No sampled game audio or game RNG.
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true } });
try {
  const { MOVE_CATALOGUE } = await server.ssrLoadModule('@core/core/index.ts');
  const extras = [['attack','通常攻撃'],['defend','守る'],['strike','基本技'],['sig-neutral','インパクト'],['sig-fire','フレアバースト'],['sig-water','アクアランス'],['sig-earth','ストーンクラッシュ'],['sig-wind','ゲイルスラッシュ'],['sig-light','レイディアンス'],['sig-dark','アンブラルファング'],['chest','宝箱が開く'],['collect','パーツ獲得']];
  const elements=['fire','water','earth','wind','light','dark'];
  const labels=['炎の燃焼','水の奔流','岩の連続衝撃','風の斬撃','光の閃光','闇のうなり'];
  const sounds = [...MOVE_CATALOGUE.map(m => ({id:m.id,name:m.name,major:m.category==='finisher',element:m.element})), ...extras.map(([id,name])=>({id,name,major:false,element:id.startsWith('sig-')?id.slice(4):'neutral'})), ...elements.map((element,i)=>({id:`element-${element}`,name:labels[i],element,major:false}))];
  await mkdir('public/audio/battle',{recursive:true});
  for (const [index, sound] of sounds.entries()) {
    const id=sound.id, sr=32000, duration=sound.major?1.18:elements.includes(sound.element)?1.05:.68, count=Math.ceil(sr*duration);
    const out=new Float64Array(count); let seed=149+index*701, smooth=0, low=0, crack=0;
    const magic=/eye|gaze|ray|crystal|soul|royal|pulse|pollen|sig|collect/.test(id);
    const sweep=/tail|lash|whip|wing|slash|wind|fin/.test(id);
    const double=/twin|double|multi|rush/.test(id);
    const base=magic?135+index*4:65+index*2;
    for(let i=0;i<count;i++) {
      const t=i/sr; seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      smooth=.84*smooth+.16*(seed/2147483648-1);
      const noise=seed/2147483648-1;
      low=.985*low+.015*noise;
      crack=crack*.82+(noise>.991 ? .7 : 0);
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
      // Distinct material acoustics instead of transposing the same electronic tone.
      const hitTone=(u,f,decay)=>u<0?0:Math.sin(2*Math.PI*(f*u+2*(1-Math.exp(-u*40))))*Math.exp(-u*decay)*Math.min(1,u/.004);
      const variant=1+(index%5)*.035;
      switch(sound.element) {
        case 'fire':
          // Air-fed roar, a low ignition thump and sparse bright embers.
          v=(smooth*2.6+low*3)*( .7+.22*Math.sin(t*39)+.08*Math.sin(t*107))*Math.exp(-t*1.1)+crack*noise*.6+hitTone(t,55,15)*.45;
          break;
        case 'earth':
          // Three separate stone impacts, rubble between each strike.
          v=0;
          for(const onset of [0,.19/variant,.4/variant]){const u=t-onset;if(u>=0)v+=hitTone(u,48*variant,11)*.85+(smooth*1.6+noise*.15)*Math.exp(-u*20);}
          v+=low*.8*Math.exp(-t*2);
          break;
        case 'light': {
          // Brief "sha" onset followed by a stable, clear "peen" tail.
          const u=Math.max(0,t-.065),env=Math.min(1,u/.012)*Math.exp(-u*3);
          v=(noise-smooth)*.22*Math.exp(-t*32)+env*(Math.sin(2*Math.PI*784*variant*u)*.38+Math.sin(2*Math.PI*1176*variant*u)*.17+Math.sin(2*Math.PI*1568*variant*u)*.04);
          break;
        }
        case 'water': {
          // One broad breaking wave: rushing approach, heavy splash, receding wash.
          const crash=Math.max(0,t-.075);
          const surge=Math.min(1,t/.09)*Math.exp(-crash*2.9);
          const spray=Math.exp(-crash*8)*Math.min(1,crash/.008);
          v=(smooth*2.9+low*4.5)*surge+noise*.36*spray+hitTone(crash,58,13)*.38;
          v+=smooth*.65*Math.exp(-t*2)*( .65+.35*Math.sin(t*48));
          break;
        }
        case 'wind':
          // Two separate airy whistles, descending smoothly: pyuu / pyuu.
          v=0;
          for(const onset of [0,.47]) {
            const u=t-onset;
            if(u<0 || u>.37)continue;
            const env=Math.max(0,Math.sin(Math.PI*u/.37))**1.4;
            const phase=2*Math.PI*variant*(740*u-420*u*u);
            v+=env*(Math.sin(phase)*.34+Math.sin(phase*2)*.025+smooth*.38+(noise-smooth)*.045);
          }
          break;
        case 'dark':
          v=(Math.sin(2*Math.PI*74*t+2*Math.sin(2*Math.PI*37*t))*.4+Math.sin(2*Math.PI*111*t)*.18)*( .7+.3*Math.sin(t*26))*Math.exp(-t*2)+low*1.3;
          break;
      }
      if(elements.includes(sound.element) && !id.startsWith('sig-') && !id.startsWith('element-')) {
        // Feature moves retain a physical gesture under their element.
        v+=hitTone(t,double?85:base,14)*.18;
        if(double)v+=hitTone(t-.17,base,15)*.16;
        if(sweep)v+=smooth*.4*Math.exp(-(((t-.12)/.08)**2));
      }
      out[i]=v*attack*(sound.element==='wind' || sound.element==='water' ? Math.min(1,(duration-t)/.12) : release);
    }
    // Quiet, dark short reflections; fade ends and normalize with headroom.
    for(let i=count-1;i>=0;i--) if(i>sr*.09)out[i]+=out[i-Math.floor(sr*.09)]*.16;
    if(!out.every(Number.isFinite)) throw new Error(`${id}: invalid synthesis sample`);
    const peak=Math.max(...out.map(Math.abs));
    const wav=Buffer.alloc(44+count*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(sr,24);wav.writeUInt32LE(sr*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
    out.forEach((v,i)=>wav.writeInt16LE(Math.round(v/peak*.72*32767*Math.min(1,(count-i)/320)),44+i*2));
    await writeFile(`public/audio/battle/${id}.wav`,wav);
  }
  await writeFile('src/mocks/battleSounds.json',JSON.stringify(sounds,null,2)+'\n');
  console.log(`Generated ${sounds.length} original battle and loot sounds.`);
} finally {await server.close();}
