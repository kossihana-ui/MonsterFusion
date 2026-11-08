import { useEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { GenePart } from '@core/core/index.ts';
import { partUrls } from '../mocks/assets/parts-detailed/manifest';
import { battleSound } from './battleSound';
import '../styles/loot.css';

export function TreasureChestIcon() { return <svg viewBox="0 0 32 32" shapeRendering="crispEdges"><g className="chest-lid"><path fill="#6c4035" stroke="#edc36e" strokeWidth="2" d="M3 15V8h3V5h20v3h3v7Z"/><path fill="#dba75e" d="M8 6h3v9H8zm13 0h3v9h-3z"/></g><path fill="#6c4035" stroke="#edc36e" strokeWidth="2" d="M3 16h26v13H3z"/><path fill="#dba75e" d="M8 17h3v11H8zm13 0h3v11h-3z"/><path fill="#fff0a5" d="M14 14h5v7h-5z"/></svg>; }

export function PartIcon({ part }: { part: GenePart }) {
  const key = `${part.locus === 'bodyShape' ? 'body' : part.locus}/${part.value}${part.locus === 'wings' ? '-near' : ''}`;
  return partUrls[key] ? <img className="part-icon" src={partUrls[key]} alt={part.name} /> : <span aria-label={part.name}>✦</span>;
}

export function LootReveal({ parts, source, destination, muted, onDone }: {
  parts: readonly GenePart[]; source: RefObject<HTMLDivElement | null>;
  destination: RefObject<HTMLButtonElement | null>; muted: boolean; onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useRef(onDone); done.current = onDone;
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame=0;
    const started=performance.now();
    const update = () => {
      const a = source.current?.getBoundingClientRect(), b = destination.current?.getBoundingClientRect();
      if (!ref.current || !a || !b) return;
      const x = Math.max(60, Math.min(innerWidth-60,a.x+a.width/2));
      const y = Math.max(100, Math.min(innerHeight-160,a.y+a.height/2));
      const endX=b.x+b.width/2,endY=b.y+b.height/2;
      ref.current.style.setProperty('--loot-x',`${x}px`);
      ref.current.style.setProperty('--loot-y',`${y}px`);
      ref.current.style.setProperty('--loot-path',`path("M ${x} ${y} Q ${Math.max(40,x-230)} ${Math.max(40,y-240)} ${endX} ${endY}")`);
    };
    const tick = () => {
      update();
      const t=performance.now()-started, root=ref.current;
      if(root && !reduced.matches) {
        const chest=root.querySelector<HTMLElement>('.loot-chest');
        const lid=root.querySelector<SVGElement>('.chest-lid');
        if(chest){const p=Math.min(1,t/650);chest.style.opacity=String(Math.min(1,p*4));chest.style.transform=`translate(-50%,calc(-50% + ${-90*(1-p)+Math.sin(p*Math.PI*3)*12*(1-p)}px))`;}
        if(lid) lid.style.transform=`translateY(${-5*Math.min(1,Math.max(0,t-700)/450)}px) rotate(${-18*Math.min(1,Math.max(0,t-700)/450)}deg)`;
        root.querySelectorAll<HTMLElement>('.loot-flying-part').forEach((el,i)=>{
          const p=Math.min(1,Math.max(0,(t-1100-i*280)/1550));
          el.style.offsetDistance=`${Math.max(0,(p-.2)/.8)**1.5*100}%`;
          el.style.opacity=String(Math.min(1,p*8,(1-p)*8));
          el.style.transform=`scale(${p<.2?.3+p*4:1.1-p*.8})`;
        });
      }
      frame=requestAnimationFrame(tick);
    };
    update(); frame=requestAnimationFrame(tick); window.addEventListener('resize',update);window.addEventListener('scroll',update,true);
    const stops: (()=>void)[]=[];
    const timers=[window.setTimeout(()=>stops.push(battleSound('chest',muted)),reduced.matches?0:650),
      ...parts.map((_,i)=>window.setTimeout(()=>stops.push(battleSound('collect',muted)),reduced.matches?100:2200+i*280)),
      window.setTimeout(()=>done.current(),reduced.matches?650:2900+parts.length*280)];
    const skip=()=>done.current(); reduced.addEventListener('change',skip);
    return ()=>{cancelAnimationFrame(frame);timers.forEach(clearTimeout);stops.forEach(stop=>stop());window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);reduced.removeEventListener('change',skip);};
  },[parts,source,destination,muted]);
  return <div className="loot-overlay" ref={ref}>
    <div className="loot-chest" aria-hidden="true"><span className="loot-rays"/><TreasureChestIcon /></div>
    {parts.map((part,i)=><div key={`${part.id}-${i}`} className="loot-flying-part" style={{'--loot-delay':`${1100+i*280}ms`} as CSSProperties}><PartIcon part={part}/><span className="loot-spark">✦</span></div>)}
    <div className="loot-caption" role="status">{parts.map(p=>p.name).join('・')} を獲得！<button onClick={onDone}>演出をスキップ</button></div>
  </div>;
}
