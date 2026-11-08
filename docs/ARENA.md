# アリーナ連戦・パーツ報酬・素材融合

[ARENA_PARTS_HANDOFF.md](../../MonsterFusion-UI/src/mocks/ARENA_PARTS_HANDOFF.md) への対応です。

## 1. まず仕様6の判断について

依頼にあった「投入部位が子に発現するモード」を実装しました。`graftGene`（隠し枠専用）は使っていません。

**保証の内容**: 投入した部位は**必ず子に発現します**。50回の融合で50回とも発現することをテストで検証しています。

実装は、投入値を**優性の活性アレルとして固定**し、その locus を突然変異の対象から外す形です。**相手から受け継いだアレルは劣性として残ります**（消えません）。進化の `locked` は活性アレルを両方固定しますが、素材では片方だけにしてあります。両方上書きすると、素材を使うたびに遺伝子が1つ失われてしまうためです。

UIが「必ず生える」と表示してよいかは `previewPartFusion()` の `guaranteedExpression` で判定してください。coreが返す値を使い、UI側で判断しないでください。

```ts
previewPartFusion(a, b, part, inventory);
// { ok: true, message: '子の尻尾は必ず「棘の尻尾」になります。',
//   locus: 'tail', value: 'spiked', guaranteedExpression: true, cost: 1 }
```

## 2. API

```ts
// アリーナ
startArena(player, loadout, context, { id? }): ArenaRun
advanceArenaTurn(run, action, context): ArenaRun
claimArenaReward(run, inventory, context): ArenaRewardResult
nextArenaEncounter(run, context): ArenaRun
arenaRules(config?): string[]          // ルール説明文（日本語）
isArenaOver(run): boolean

// パーツ
createPartInventory(stacks?): PartInventory
addPart / removePart / countOf
partFromFeature(monster, locus): GenePart | null
partsOf(monster): GenePart[]

// 素材融合
previewPartFusion(a, b, part, inventory?): PartFusionPreview
fuseWithPart(a, b, part, inventory, context, requestId): PartFusionResult
```

`ArenaRun` は値です。**すべての関数が新しい run を返し、モジュール側に状態を持ちません。** 保存・復元がそのまま動きます。

## 3. 進行

```
第1戦 … 第5戦（通常）→ 第6戦（ボス）→ cleared
敗北・引き分け → failed
```

- `phase` は `'battle' | 'reward' | 'cleared' | 'failed'`
- 各戦の間に**全回復**します
- **報酬を受け取るまで次の戦闘に進めません**（`nextArenaEncounter` が拒否します）。画面遷移でドロップを飛ばせません
- 引き分けも連勝終了です（連勝とは勝ち続けることなので）

## 4. 敵の生成

**run の id と戦闘番号から決まります。** 同じ対戦を表示し直しても再抽選されません。別の run なら別の敵です。

能力は出場者と進行度に応じて調整されます。

```
出場者 Ignis 合計379

第1戦  合計335   第4戦  合計406
第2戦  合計357   第5戦  合計402
第3戦  合計380   第6戦【ボス】合計525  tier2
```

**傾向遺伝子を倍率でいじるだけでは曲線になりませんでした。** 見た目由来の能力補正のほうが振れ幅が大きく、第4戦が第5戦より強い、ということが起きます。そのため**合計値を目標に収束させる**実装にしてあります。曲線が単調に上がることはテストで検証しています。

遺伝子→見た目→能力の整合性は生成時に保証されます（UIで `stats` を加工しないでください）。

## 5. ボス

外見テンプレートを固定しています。

```ts
BOSS_TEMPLATE
// bodyShape: 'muscular', size: 'giant', horns: 'spiral',
// wings: 'membrane', tail: 'long', jaw: 'maw', eyes: 'glowing', crest: 'crown'
```

体色と属性だけランダムです。**ドラゴンの輪郭を保ちます。**

「強い遺伝子」は、複数の能力傾向が高いことと `tier: 2` で表現しています。優性/劣性の別は強さと無関係です（劣性だから弱い、ではありません）。

## 6. 報酬

**倒した相手が実際に身に着けていた特徴からのみ抽選されます。** 持っていないパーツは絶対に落ちません。

- 対象部位: 体型・目・角・翼・尻尾・口・頭飾り（`dropLoci` で設定）
  - 体型と目は2026-11-08に追加しました。ソウルメイクの必須素材で、落ちないと画面が永久に開かないためです（[SESSION_AND_SOULMAKE.md](SESSION_AND_SOULMAKE.md) の7章に測定値）
  - 代わりに既存5部位の割合が20%→約14%に下がっています。狙い撃ちは約1.3倍かかります
- 「なし」の部位（角なし等）は落ちません
- 落ちなかった場合も**結果として返ります**（`empty: true`、メッセージ付き）
- **二重取得は防止されます**。2回目は `duplicate: true` で在庫が増えません

```ts
claimArenaReward(run, inventory, context);
// { run, inventory, parts, empty, duplicate, canContinue, message }
```

## 7. 素材融合の原子性

```ts
fuseWithPart(a, b, part, inventory, context, requestId);
```

- **成功時のみ1個消費**します。失敗・在庫不足・自分同士の融合では消費しません
- **同じ `requestId` の再送では二重消費も二重生成もしません**（`duplicate: true` を返します）
- 親と渡した inventory は**変更されません**
- 子の習得技は既存APIで再評価されます（`getLearnableMoves(child)`）

requestId の記録は直近64件です。二重クリックや再送はその範囲で防げます。

## 8. 保存

既存の `MonsterSaveFile` に統合しました。

```ts
serializeSaveFile(monsters, { loadouts, inventory, arena });
const save = deserializeSaveFile(json).value;
save.inventory;   // PartInventory
save.arena;       // ArenaRun | null
```

**壊れたデータは落とします。拒否しません。**

- 不正なパーツ在庫 → その項目だけ落とす
- 復元できない run → `null`（アリーナ入口に戻る）

1つの壊れた項目でコレクション全体が読めなくなる事態を避けるためです。

## 9. 検証済み

依頼にあった項目をすべてテストにしています（225件中、アリーナ関連25件）。

- 5勝の次に一度だけボス
- 敗北・引き分けの進行
- 同seed再現（同じ run は同じ敵）
- 二重報酬防止
- 敵の実在パーツだけ落ちること
- 素材消費の原子性（成功時のみ・requestId重複防止）
- 在庫不足
- 親不変
- 遺伝子・外見・能力・技の整合性
- 保存と復元（壊れたデータの扱いを含む）
- 難易度曲線が単調に上がること

## 10. 設定

```ts
DEFAULT_ARENA_CONFIG
// normalWins: 5, bossTier: 2,
// firstStrength: 0.85, lastStrength: 1.1, bossStrength: 1.35,
// dropChance: 0.35, bossDropChance: 0.75,
// dropCount: 1, bossDropCount: 2,
// dropLoci: ['bodyShape','eyes','horns','wings','tail','jaw','crest'],
// partsPerFusion: 1
```

`createGameConfig({ arena: { ... } })` で上書きできます。ドロップ率や連勝数の調整はこちらで。

## 11. 未実装

- 能力傾向を変える素材（見た目のパーツとは別のルールが要ります）
- 1回の融合で複数素材（`partsPerFusion` は定義済みですが、現在は1個固定）
