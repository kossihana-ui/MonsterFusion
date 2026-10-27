import { useEffect, useRef, useState } from 'react';
import sounds from '../mocks/battleSounds.json';
import { battleSound } from '../components/battleSound';
import { attackModes, categories, changes, elements, fields, kinds, parseDrafts, proposal, proposalText, rows, storageKey } from '../components/moveWorkshopModel';
import type { Drafts, Field } from '../components/moveWorkshopModel';
import '../styles/move-workshop.css';
const groups:Record<string,string>={all:'すべて',tail:'尻尾',horns:'角',wings:'翼',jaw:'口・顎',eyes:'目',crest:'頭飾り',bodyShape:'体型',size:'大きさ'};
function load(){try{const raw=localStorage.getItem(storageKey);return {drafts:raw?parseDrafts(raw):{},message:'このブラウザに下書きを保存します。'};}catch{return {drafts:{},message:'保存済みの下書きを読み込めませんでした。元データは保持しています。新しく編集すると上書きされます。'};}}
export function MoveWorkshop(){
  const [initial]=useState(load);
  const [drafts,setDrafts]=useState<Drafts>(initial.drafts);
  const [message,setMessage]=useState(initial.message);
  const [group,setGroup]=useState('all'),[search,setSearch]=useState(''),[onlyChanged,setOnlyChanged]=useState(false);
  const [undo,setUndo]=useState<Drafts|null>(null);
  const [exportOpen,setExportOpen]=useState(false);
  const exportPanel=useRef<HTMLElement>(null);
  useEffect(()=>{if(exportOpen){exportPanel.current?.scrollIntoView({block:'start',behavior:'instant'});exportPanel.current?.focus({preventScroll:true});}},[exportOpen]);
  const stop=useRef<()=>void>(()=>{});
  useEffect(()=>()=>stop.current(),[]);
  const save=(next:Drafts)=>{setDrafts(next);try{localStorage.setItem(storageKey,JSON.stringify({version:1,drafts:next}));setMessage('下書きを保存しました。');}catch{setMessage('ブラウザに保存できません。画面を閉じる前に変更一覧を保存してください。');}};
  const update=(id:string,field:Field,value:string)=>{
    const row=rows.find(r=>r.id===id)!;const old=drafts[id]??{base:{...row.base},value:{...row.base}};
    setUndo(drafts);save({...drafts,[id]:{base:old.base,value:{...old.value,[field]:value}}});
  };
  const reset=(id:string)=>{setUndo(drafts);const next={...drafts};delete next[id];save(next);};
  const payload=proposal(drafts),text=proposalText(drafts);
  const visible=rows.filter(r=>(group==='all'||r.source===group)&&(!onlyChanged||drafts[r.id]&&Object.keys(changes(drafts[r.id])).length)&&`${r.part} ${r.id} ${r.base.name} ${drafts[r.id]?.value.name??''}`.toLowerCase().includes(search.toLowerCase()));
  const download=()=>{const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='MonsterFusion-技変更依頼.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <div className="move-workshop" data-custom-sound>
    <div className="hero"><div><div className="eyebrow">MOVE DESIGN NOTEBOOK</div><h1>技の編集室</h1><p>パーツごとに希望を編集して、AIに渡せる変更一覧に。</p></div><span className="badge">編集案 {payload.moves.length}件</span></div>
    <section className="panel workshop-intro"><p><strong>ここは変更案を作る場所です。</strong>保存しただけではゲームの技は変わりません。「AIに渡す」で作った文章を、このチャットやClaudeに貼り付けてください。</p><p>名前・属性・技の特性・効果音をまとめて指定できます。特性は「防御中の相手に強い」など、普通の言葉で書いて大丈夫です。</p></section>
    <div className="workshop-tools"><label>パーツ<select value={group} onChange={e=>setGroup(e.target.value)}>{Object.entries(groups).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>検索<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="技名・パーツ名"/></label><label className="workshop-check"><input type="checkbox" checked={onlyChanged} onChange={e=>setOnlyChanged(e.target.checked)}/>変更した技だけ</label><button disabled={!undo} onClick={()=>{if(undo){const previous=drafts;save(undo);setUndo(previous);}}}>ひとつ戻す／戻し直す</button><button className="primary" disabled={!payload.moves.length} onClick={()=>setExportOpen(true)}>AIに渡す · {payload.moves.length}件</button></div>
    <p role="status">{message}</p>
    <div className="workshop-scroll"><table><caption>パーツ別の技一覧 · {visible.length}件</caption><thead><tr><th>パーツ・現在の技</th><th>N 技名／E 属性／K 種類</th><th>T 特性の希望</th><th>S 音／R 音の希望</th><th>M 補足</th></tr></thead><tbody>{visible.map(row=>{
      const draft=drafts[row.id],value=draft?.value??row.base,changed=!!draft&&Object.keys(changes(draft)).length>0;
      const stale=draft&&fields.some(f=>draft.base[f]!==row.base[f]);
      return <tr key={row.id} data-changed={changed}><th scope="row"><strong>{groups[row.source]} · {row.part}</strong><span>{row.base.name}</span><code>{row.id}</code><small>{elements[row.base.element]} / {kinds[row.base.kind]} / {categories[row.base.category]}</small>{changed&&<span className="badge">変更あり</span>}{stale&&<p>元の仕様が更新されています。書き出しに旧・現行の両方を含めます。</p>}<button disabled={!draft} onClick={()=>reset(row.id)}>この技を元に戻す</button></th>
        <td><label>技名<input aria-label={`${row.id} 技名`} maxLength={80} value={value.name} onChange={e=>update(row.id,'name',e.target.value)}/></label><label>属性<select aria-label={`${row.id} 属性`} value={value.element} onChange={e=>update(row.id,'element',e.target.value)}>{Object.entries(elements).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>種類<select aria-label={`${row.id} 種類`} value={value.kind} onChange={e=>update(row.id,'kind',e.target.value)}>{Object.entries(kinds).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>規模<select aria-label={`${row.id} 規模`} value={value.category} onChange={e=>update(row.id,'category',e.target.value)}>{Object.entries(categories).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label></td>
        <td><label>攻撃の扱い<select aria-label={`${row.id} 攻撃の扱い`} value={value.attackMode} onChange={e=>update(row.id,'attackMode',e.target.value)}>{Object.entries(attackModes).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><small>回復だけ・解除だけの技は「攻撃しない」を選びます。</small><label>希望する効果<textarea aria-label={`${row.id} 特性`} maxLength={2000} value={value.traits} onChange={e=>update(row.id,'traits',e.target.value)} placeholder="例：防御を貫通。相手が守っていないと威力半減。"/></label><small>追加・変更したい内容を書きます。未記入は変更なしです。</small><div className="workshop-presets">{['防御を貫通する','使用後1ターン動けない','2回攻撃する'].map(t=><button key={t} onClick={()=>update(row.id,'traits',[value.traits,t].filter(Boolean).join('。').slice(0,2000))}>＋{t}</button>)}</div></td>
        <td><label>効果音<select aria-label={`${row.id} 効果音`} value={value.sound} onChange={e=>update(row.id,'sound',e.target.value)}>{!sounds.some(s=>s.id===value.sound)&&<option value={value.sound}>未登録: {value.sound}</option>}{sounds.map(s=><option key={s.id} value={s.id}>{s.name} [{s.id}]</option>)}</select></label><button disabled={!sounds.some(s=>s.id===value.sound)} onClick={()=>{stop.current();stop.current=battleSound(value.sound,false,value.element==='self'?undefined:value.element);}}>▶ 試聴</button><button onClick={()=>stop.current()}>■ 停止</button><label>音のイメージ<textarea aria-label={`${row.id} 音の希望`} maxLength={2000} value={value.soundRequest} onChange={e=>update(row.id,'soundRequest',e.target.value)} placeholder="例：ザバーン。最後は短く切る。"/></label><small>使用者と同じ属性の音は、使用者が決まると重なります。</small></td>
        <td><label>補足<textarea aria-label={`${row.id} 補足`} maxLength={2000} value={value.note} onChange={e=>update(row.id,'note',e.target.value)} placeholder="演出や調整の希望など"/></label></td></tr>;
    })}</tbody></table>{!visible.length&&<p>条件に合う技がありません。</p>}</div>
    {exportOpen&&<section ref={exportPanel} tabIndex={-1} className="panel workshop-export" aria-label="AIに渡す変更一覧"><h2>これをAIに貼り付けてください</h2><p>N＝名前、T＝特性、S＝音などの記号と技IDで、変更した項目だけを伝えます。末尾のJSONには元の値も含みます。</p><button onClick={async()=>{try{await navigator.clipboard.writeText(text);setMessage('変更一覧をコピーしました。AIのチャットに貼り付けてください。');}catch{setMessage('コピーできませんでした。下の文章を選択するか、ファイル保存してください。');}}}>変更一覧をコピー</button><button onClick={download}>テキストファイル保存</button><button onClick={()=>setExportOpen(false)}>閉じる</button><textarea aria-label="AIへの依頼文" readOnly value={text} onFocus={e=>e.currentTarget.select()}/></section>}
  </div>;
}
