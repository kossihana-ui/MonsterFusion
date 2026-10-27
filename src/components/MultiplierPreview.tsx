import { useEffect, useRef, useState } from 'react';
import { MultiplierEffect, orchestraHit } from './MultiplierEffect';
export function MultiplierPreview() {
  const [factor, setFactor] = useState<number | null>(null);
  const stop = useRef<() => void>(() => {});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { stop.current(); clearTimeout(timer.current); }, []);
  return <section className="panel" data-custom-sound>
    <h2>倍率アップ · オーケストラ・ヒット</h2>
    <p>低音と鋭い金管・弦を重ねた、厚い「ジャン！」。0.72秒。倍率ごとに音の高さと音量が少し変わります。</p>
    <div style={{position:'relative',height:180}}>
      {factor && <MultiplierEffect key={factor} value={{factor,critical:false,reason:factor === 3 ? '攻撃力上昇 ×2 / 種 ×1.5' : factor === 2 ? '攻撃力上昇' : '種'}} />}
    </div>
    {[1.5,2,3].map(value => <button key={value} onClick={() => {
      stop.current(); clearTimeout(timer.current); setFactor(value);
      stop.current = orchestraHit(value);
      timer.current = setTimeout(() => setFactor(null),700);
    }}>▶ ×{value}倍を試す</button>)}
  </section>;
}
