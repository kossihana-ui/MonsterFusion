# 特徴タグと融合演出

モンスターの特徴を日本語タグで色分け表示するためのAPIと、融合演出に必要なデータです。

core側は**何を表示するか**だけを返します。色・レイアウト・音・タイミングはUI側の担当です。

## 1. 特徴タグ

```ts
import { describeMonster, describeTraits } from '@core/core/index.ts';

const tags = describeMonster(monster);
```

```ts
{
  locus: 'element',
  locusLabel: '属性',
  kind: 'dominant',      // ← これで色を決めてください
  value: 'fire',         // 生の値。アイコンやツールチップのキーに
  label: '炎',
  expressed: true,       // 実際に見た目に出ているか
  codominant: false,     // 2つのアレルが拮抗して混ざったか
}
```

### 色の対応

| `kind` | 色 | 意味 |
|---|---|---|
| `dominant` | **赤** | 発現している優性アレル |
| `recessive` | **青** | 発現していない劣性アレル（持っているが出ていない） |
| `hidden` | **紫枠**（または点線など区別できる表現） | 隠し遺伝子。発現せず、子孫に渡ることがある |
| `mutation` | **紫** | この個体が生まれたときに突然変異した遺伝子 |

`mutation` は `dominant` / `recessive` より優先されます。変異した遺伝子は、優性か劣性かより「変異である」ことのほうが重要だからです。

### 実際の出力例

```
mutation   体色:黄*  体色:赤  体型:飛行型*  体型:魚型  大きさ:巨大*  尻尾:蔓の尻尾*  頭飾り:花*
dominant   角:角なし*  翼:翼なし*  目:丸い目*  口:大顎*  属性:土*
recessive  角:立ち角  翼:霊翼  目:光る目  口:牙
hidden     体色:紫  体型:細身  大きさ:極小  角:立ち角  翼:羽根翼  目:丸い目  口:牙  属性:無属性
```

（`*` は `expressed: true`）

### オプション

```ts
describeMonster(monster, {
  includeHidden: false,      // 隠し遺伝子を省く（カード表示などコンパクトな場面）
  includeTendencies: true,   // 攻撃傾向などの数値も含める（既定は含めない）
});

describeAppearanceTags(monster);   // 発現しているものだけ
```

### 特徴タグ（traits）

遺伝子そのものではなく、そこから導かれる説明です。

```ts
describeTraits(monster);
// [{ trait: 'floral', label: '花持ち' }, { trait: 'mutant', label: '変異体' }, ...]
```

`変異体` `不安定` `先祖返り` `王種` などが含まれます。こちらは別枠で並べるのが良いと思います。

## 2. 融合演出用のデータ

```ts
import { fuseDetailed, describeFusion } from '@core/core/index.ts';

const result = fuseDetailed(parentA, parentB, context);
const summary = describeFusion(result.child, result.evolution.willEvolve);
```

```ts
{
  steps: [
    { kind: 'inherited', locus: 'horns',  locusLabel: '角',   label: '角なし',   note: '親から受け継いだ' },
    { kind: 'atavism',   locus: 'jaw',    locusLabel: '口',   label: '大顎',     note: '隠れていた遺伝子が現れた' },
    { kind: 'mutation',  locus: 'crest',  locusLabel: '頭飾り', label: '花',      note: '突然変異' },
    { kind: 'evolution', label: 'King Moss', note: '進化した（ランク 2）' },
  ],
  mutationCount: 5,
  atavismCount: 3,
  evolved: true,
}
```

**`steps` は演出の順番どおりに並んでいます。** 普通の継承 → 隔世遺伝 → 突然変異 → 進化。盛り上がる要素が後に来るようにしてあります。UIは先頭から順に出せば自然な流れになります。

## 3. 演出の依頼文（GPT等に渡す用）

core側のデータは上記で揃っています。以下はそのまま依頼文として使えます。

```
MonsterFusionの「融合」演出を実装してください。React + Canvas、64×64の
ドット絵スプライトを拡大表示しています。

【前提】
ロジックは完成しており、以下のデータが取れます。UI側は演出だけを担当します。

  const result = fuseDetailed(parentA, parentB, context);
  const summary = describeFusion(result.child, result.evolution.willEvolve);

  summary.steps        演出の順番に並んだ配列（下記）
  summary.mutationCount 突然変異した遺伝子の数
  summary.evolved       進化したか

  各stepの形:
    kind       'inherited' | 'atavism' | 'mutation' | 'evolution'
    locusLabel '角' '翼' '属性' など（日本語）
    label      '巻き角' '炎' など（日本語）
    note       '親から受け継いだ' '隠れていた遺伝子が現れた' '突然変異'

【演出の流れ】
1. 2体のスプライトが中央に寄る。気が広がるような粒子エフェクト
2. 重なった瞬間に一瞬ホワイトアウト（2〜3フレーム）
3. 白から新しいモンスターのシルエットが浮かび上がる
4. summary.steps を順に、タグが「ぽこっ」と音付きで出現
     inherited  小さく静かに。音も控えめ
     atavism    少し溜めてから。やや大きい音
     mutation   強調。紫に光らせ、画面を軽く揺らす
     evolution  最大の演出。光の柱、名前の表示、専用の音
5. 全タグが出揃ったら完成形を表示

【要件】
- スキップ可能にしてください（クリックで即座に完成形へ）
- 音はミュート可能に
- summary.steps が10件を超えることがあります。多い場合は間隔を詰めるか、
  mutation と evolution 以外をまとめて表示してください
- ドット絵なので imageSmoothingEnabled = false を維持してください
- 画面の揺れは軽めに。酔う演出は避けてください

【色の対応】
  inherited 白〜灰
  atavism   青
  mutation  紫
  evolution 金
```

## 4. 注意点

**schemaVersion が 4 に上がりました。** `mutatedLoci` と `atavismLoci` をモンスターに保存するようにしたためです（どの遺伝子が変異したかを表示するのに必要）。旧セーブは自動で空配列が補完されるので壊れませんが、**バージョン3以前に作られたモンスターは突然変異タグが出ません**（どの遺伝子が変異したかを記録していなかったため、復元できません）。`mutationCount` は残っているので「変異体」という traits タグは出ます。

**ラベルは全てcore側にあります。** 新しいアレル値を追加したとき、ラベルを足し忘れるとテストが落ちます。UI側で日本語を持たないでください。
