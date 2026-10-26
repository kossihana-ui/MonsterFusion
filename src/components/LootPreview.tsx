import { useRef, useState } from 'react';
import { LootReveal } from './LootReveal';
import type { GenePart } from '@core/core/index.ts';
const sample: readonly GenePart[] = [{id:'preview-wings',name:'羽根翼',locus:'wings',value:'feathered',fromMonsterName:'演出見本'}];
export function LootPreview() {
  const [playing,setPlaying] = useState(false);
  const source=useRef<HTMLDivElement>(null),destination=useRef<HTMLButtonElement>(null);
  return <section className="panel"><h2>宝箱ドロップの演出見本</h2><p>見本の羽根翼を表示します。ゲーム内の所持数は増えません。</p>
    <div ref={source} style={{height:120,display:'grid',placeItems:'center'}}>敵の位置 · 宝箱が落ちる場所</div>
    <button disabled={playing} onClick={()=>setPlaying(true)}>宝箱の演出を見る</button>
    <button ref={destination} style={{float:'right'}}>▣ アイテムボックス（見本）</button>
    {playing && <LootReveal parts={sample} source={source} destination={destination} muted={false} onDone={()=>setPlaying(false)}/>}
  </section>;
}
