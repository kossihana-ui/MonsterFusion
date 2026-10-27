import { MOVE_CATALOGUE, labelFor } from '@core/core/index.ts';
export const storageKey='monsterfusion-move-proposals-v1';
export const fields=['name','element','kind','category','attackMode','traits','sound','soundRequest','note'] as const;
export type Field=typeof fields[number];
export type Values=Record<Field,string>;
export type Draft={base:Values;value:Values};
export type Drafts=Record<string,Draft>;
export const symbols:Record<Field,string>={name:'N 技名',element:'E 属性',kind:'K 物理／魔法',category:'C 通常／大技',attackMode:'A 攻撃の扱い',traits:'T 特性の希望',sound:'S 効果音ID',soundRequest:'R 音の希望',note:'M 補足'};
export const attackModes:Record<string,string>={unchanged:'変更しない',none:'攻撃しない（回復・補助のみ）',damage:'攻撃する（追加効果ありも含む）',reflect:'反射のみ（通常の攻撃なし）'};
export const elements:Record<string,string>={self:'使用者と同じ',neutral:'無',fire:'炎',water:'水',earth:'土・石',wind:'風',light:'光',dark:'闇'};
export const kinds:Record<string,string>={physical:'物理',magical:'魔法'};
export const categories:Record<string,string>={normal:'通常技',finisher:'大技'};
export const rows=MOVE_CATALOGUE.map(m=>({id:m.id,source:m.source,part:labelFor(m.source,m.value),reason:m.reason,base:{name:m.name,element:m.element,kind:m.kind,category:m.category,attackMode:'unchanged',traits:'',sound:m.id,soundRequest:'',note:''} as Values}));
export function changes(draft:Draft){return Object.fromEntries(fields.filter(f=>draft.base[f]!==draft.value[f]).map(f=>[f,draft.value[f]]));}
export function parseDrafts(raw:string):Drafts {
  const data=JSON.parse(raw);
  if(data?.version!==1 || !data.drafts || typeof data.drafts!=='object' || Array.isArray(data.drafts))throw new Error('Invalid draft');
  const result:Drafts={};
  for(const [id,d] of Object.entries(data.drafts)) {
    if(!rows.some(r=>r.id===id))throw new Error('Unknown move');
    const old=d as Draft;
    // Existing version-1 drafts predate A. Preserve every edited field during migration.
    const draft={base:old?.base ? {...old.base,attackMode:old.base.attackMode ?? 'unchanged'} : null,value:old?.value ? {...old.value,attackMode:old.value.attackMode ?? 'unchanged'} : null};
    for(const v of [draft?.base,draft?.value]) {
      if(!v || fields.some(f=>typeof v[f]!=='string'||v[f].length>2000)||!Object.hasOwn(elements,v.element)||!Object.hasOwn(kinds,v.kind)||!Object.hasOwn(categories,v.category)||!Object.hasOwn(attackModes,v.attackMode))throw new Error('Invalid fields');
    }
    result[id]={base:Object.fromEntries(fields.map(f=>[f,draft.base![f]])) as Values,value:Object.fromEntries(fields.map(f=>[f,draft.value![f]])) as Values};
  }
  return result;
}
export function proposal(drafts:Drafts){
  return {schema:'monsterfusion.move-proposal',version:1,mode:'proposal-only',legend:symbols,moves:rows.filter(r=>drafts[r.id]&&Object.keys(changes(drafts[r.id])).length).map(r=>({id:r.id,part:r.part,source:r.source,base:drafts[r.id].base,current:r.base,changes:changes(drafts[r.id])}))};
}
const display=(f:Field,v:string)=>f==='element'?elements[v]:f==='kind'?kinds[v]:f==='category'?categories[v]:f==='attackMode'?attackModes[v]:v;
export function proposalText(drafts:Drafts){
  const p=proposal(drafts);
  const lines=['MonsterFusion 技変更依頼 / MF-MOVE-1',
    '以下はユーザーの編集案です。技IDで対象を特定し、baseとcurrentが異なる場合は現行仕様を確認してください。',
    'Tは希望する挙動です。未実装の特性を実装済みと扱わないでください。coreのルール変更はClaude Code、表示・音はUI担当で対応してください。',
    '回復のみ・解除のみの技は攻撃しません。A=noneでは通常攻撃・ダメージ・会心・相性計算を行いません。攻撃と解除が併記されている技は攻撃も行います。',
    '記号: N=技名 / E=属性 / K=物理・魔法 / C=通常・大技 / A=攻撃の扱い / T=特性 / S=効果音ID / R=音の希望 / M=補足',
    `変更: ${p.moves.length}件`];
  for(const move of p.moves){
    lines.push('',`[${move.id}] ${move.part} / ${move.base.name}`);
    for(const f of fields)if(Object.hasOwn(move.changes,f))lines.push(`${symbols[f]}: ${JSON.stringify(display(f,move.base[f])||'未指定')} → ${JSON.stringify(display(f,move.changes[f]!)||'未指定')}`);
  }
  lines.push('','--- 機械読み取り用JSON（こちらを正本にしてください） ---',JSON.stringify(p,null,2));
  return lines.join('\n');
}
