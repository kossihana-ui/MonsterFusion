import { useRef, useState } from 'react';
import { LOCUS_LABELS, getSoulMakeRecipe, soulMakeLoci, previewSoulMake, type CategoricalLocus } from '@core/core/index.ts';
import { getPartInventory, makeSoul } from '../mocks/game';
import type { Monster } from '../shared/ui';
import { Portrait } from '../components/MonsterView';
import { PartIcon } from '../components/LootReveal';
import '../styles/soul-make.css';

const slots = soulMakeLoci();
const required = getSoulMakeRecipe().requiredLoci;
const slotLabel = (locus: CategoricalLocus) => locus === 'bodyShape' ? '体' : LOCUS_LABELS[locus];
export function SoulMake() {
  const [active, setActive] = useState<CategoricalLocus>('bodyShape');
  const [selected, setSelected] = useState<Partial<Record<CategoricalLocus, string>>>({});
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [created, setCreated] = useState<Monster | null>(null);
  const pending = useRef(false);
  const request = useRef<string | null>(null);
  const stacks = getPartInventory().stacks.filter(s => s.count > 0);
  const choices = stacks.filter(s => s.part.locus === active);
  const partAt = (locus: CategoricalLocus) => stacks.find(s => s.part.id === selected[locus] && s.part.locus === locus)?.part;
  const place = (locus: CategoricalLocus, id: string) => {
    const stack = stacks.find(s => s.part.id === id && s.part.locus === locus);
    if (!stack) { setNotice('そのパーツはこの枠には入りません。'); return; }
    request.current = null;
    setSelected(prev => ({ ...prev, [locus]: id }));
    setNotice(`${slotLabel(locus)}に「${stack.part.name}」をセットしました。`);
  };
  const selection = { partIds: slots.flatMap(locus => selected[locus] ? [selected[locus]!] : []), name: name.trim() || undefined };
  const preview = previewSoulMake(selection, getPartInventory());
  function create() {
    if (pending.current || !preview.ok) return;
    pending.current = true;
    request.current ??= crypto.randomUUID();
    try {
      const result = makeSoul(selection, request.current);
      setNotice(result.message);
      if (result.ok && result.monster) {
        setCreated(result.monster); setSelected({}); setName(''); request.current = null;
      }
    } catch { setNotice('誕生できませんでした。素材を確認してもう一度お試しください。'); }
    finally { pending.current = false; }
  }
  return <>
    <div className="hero"><div><div className="eyebrow">SOUL MAKE</div><h1>ソウルメイク</h1><p>集めたパーツを組み合わせ、新しい仲間を生み出そう。</p></div><span className="badge">パーツから誕生</span></div>
    <p className="panel">セットしたパーツを各1個使い、新しい仲間を1体迎えます。選んだパーツは必ず姿に現れます。</p>
    <div className="soul-layout">
      <section className="panel"><h2>パーツをはめる</h2><p>枠を選んで、所持パーツを押してください。ドラッグでも配置できます。</p>
        <p className="battle-help">必須：{required.map(slotLabel).join("・")}。ほかの部位は好みで追加します。</p>
        <div className="soul-slots">{slots.map(locus => {
          const part = partAt(locus);
          return <div className="soul-slot" key={locus} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={e => { e.preventDefault(); place(locus, e.dataTransfer.getData('application/x-monsterfusion-part')); }}>
            <button type="button" aria-pressed={active === locus} onClick={() => setActive(locus)} className={active === locus ? 'is-selected' : ''}>
              <span>{slotLabel(locus)} <small>{required.includes(locus) ? '必須' : '任意'}</small></span>
              {part ? <PartIcon part={part} /> : <span className="soul-empty" aria-hidden="true">＋</span>}
              <strong>{part?.name ?? '未セット'}</strong>
            </button>
            {part && <button className="text-button" aria-label={`${slotLabel(locus)}のパーツを外す`} onClick={() => { request.current = null; setSelected(prev => ({ ...prev, [locus]: undefined })); }}>外す</button>}
          </div>;
        })}</div>
        <p role="status">{notice}</p>
      </section>
      <section className="panel"><h2>{slotLabel(active)}の所持パーツ</h2>
        {choices.length ? <div className="soul-parts">{choices.map(({part, count}) => <button type="button" key={part.id} draggable onDragStart={e => { e.dataTransfer.setData('application/x-monsterfusion-part', part.id); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => place(active, part.id)} aria-pressed={selected[active] === part.id}>
          <PartIcon part={part}/><span>{part.name}<small>所持 {count}個</small></span>
        </button>)}</div> : <p>{slotLabel(active)}のパーツはまだありません。</p>}
        {(active === 'bodyShape' || active === 'eyes') && <p className="battle-help">体と目もアリーナの勝利報酬で手に入ります。</p>}
        <h3>誕生の準備</h3><p>{preview.message}</p>
        <p>使用するパーツ：{preview.cost}個</p>
        <label>仲間の名前（任意）<input value={name} maxLength={30} onChange={e => { request.current = null; setName(e.target.value); }} placeholder="空欄ならおまかせ" /></label>
        <p className="battle-help">色・大きさ・属性は誕生時に決まります。</p>
        <button className="primary" disabled={!preview.ok} onClick={create}>ソウルメイクする</button>
        <p className="battle-help">仲間が0体になるとゲームオーバーです。仲間が残っている間に使いましょう。</p>
        {created && <div className="soul-born" role="status"><h3>{created.name}が誕生！</h3><Portrait monster={created} large /><p>図鑑に加わりました。第0世代の新しい仲間です。</p></div>}
      </section>
    </div>
  </>;
}
