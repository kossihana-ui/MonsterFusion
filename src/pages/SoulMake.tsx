import { useState } from 'react';
import { LOCUS_LABELS, type CategoricalLocus } from '@core/core/index.ts';
import { getPartInventory } from '../mocks/game';
import { PartIcon } from '../components/LootReveal';
import '../styles/soul-make.css';

const slots: CategoricalLocus[] = ['bodyShape', 'eyes', 'jaw', 'crest', 'horns', 'wings', 'tail'];
const required: CategoricalLocus[] = ['bodyShape', 'eyes'];
const slotLabel = (locus: CategoricalLocus) => locus === 'bodyShape' ? '体' : LOCUS_LABELS[locus];
export function SoulMake() {
  const [active, setActive] = useState<CategoricalLocus>('bodyShape');
  const [selected, setSelected] = useState<Partial<Record<CategoricalLocus, string>>>({});
  const [notice, setNotice] = useState('');
  const stacks = getPartInventory().stacks.filter(s => s.count > 0);
  const choices = stacks.filter(s => s.part.locus === active);
  const partAt = (locus: CategoricalLocus) => stacks.find(s => s.part.id === selected[locus] && s.part.locus === locus)?.part;
  const place = (locus: CategoricalLocus, id: string) => {
    const stack = stacks.find(s => s.part.id === id && s.part.locus === locus);
    if (!stack) { setNotice('そのパーツはこの枠には入りません。'); return; }
    setSelected(prev => ({ ...prev, [locus]: id }));
    setNotice(`${slotLabel(locus)}に「${stack.part.name}」をセットしました。`);
  };
  const missing = required.filter(locus => !partAt(locus));
  return <>
    <div className="hero"><div><div className="eyebrow">SOUL MAKE</div><h1>ソウルメイク</h1><p>集めたパーツを組み合わせ、新しい仲間の形を考えよう。</p></div><span className="badge">組み合わせプレビュー</span></div>
    <p className="panel">準備中：今はパーツを枠にはめて試せます。モンスターの誕生と素材の消費はまだ行いません。</p>
    <div className="soul-layout">
      <section className="panel"><h2>パーツをはめる</h2><p>枠を選んで、所持パーツを押してください。ドラッグでも配置できます。</p>
        <p className="battle-help">必要なパーツの案：体＋目。ほかの部位は好みで追加します。</p>
        <div className="soul-slots">{slots.map(locus => {
          const part = partAt(locus);
          return <div className="soul-slot" key={locus} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); place(locus, e.dataTransfer.getData('application/x-monsterfusion-part')); }}>
            <button type="button" aria-pressed={active === locus} onClick={() => setActive(locus)} className={active === locus ? 'is-selected' : ''}>
              <span>{slotLabel(locus)} <small>{required.includes(locus) ? '必須（案）' : '任意'}</small></span>
              {part ? <PartIcon part={part} /> : <span className="soul-empty" aria-hidden="true">＋</span>}
              <strong>{part?.name ?? '未セット'}</strong>
            </button>
            {part && <button className="text-button" aria-label={`${slotLabel(locus)}のパーツを外す`} onClick={() => setSelected(prev => ({ ...prev, [locus]: undefined }))}>外す</button>}
          </div>;
        })}</div>
        <p role="status">{notice}</p>
      </section>
      <section className="panel"><h2>{slotLabel(active)}の所持パーツ</h2>
        {choices.length ? <div className="soul-parts">{choices.map(({part, count}) => <button type="button" key={part.id} draggable onDragStart={e => { e.dataTransfer.setData('application/x-monsterfusion-part', part.id); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => place(active, part.id)} aria-pressed={selected[active] === part.id}>
          <PartIcon part={part}/><span>{part.name}<small>所持 {count}個</small></span>
        </button>)}</div> : <p>{slotLabel(active)}のパーツはまだありません。</p>}
        {(active === 'bodyShape' || active === 'eyes') && <p className="battle-help">体と目のパーツは、今後の報酬追加を予定しています。</p>}
        <h3>誕生の準備</h3><p>{missing.length ? `足りないパーツ：${missing.map(slotLabel).join('・')}` : '体と目がセットされました。'}</p>
        <button className="primary" disabled>ソウルメイク（準備中）</button>
        <p className="battle-help">仲間が0体になるとゲームオーバーです。ソウルメイクは仲間が残っている間に使う予定です。</p>
      </section>
    </div>
  </>;
}
