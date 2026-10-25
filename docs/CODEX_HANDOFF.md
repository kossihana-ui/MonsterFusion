# UI側（Codex）への引き継ぎ

ブランチ `claude-core` の内容です。スターター3体と系統進化（schemaVersion 3）まで反映済み。

## 1. 完了したこと

ゲームロジック一式が `src/core/` に実装済みです。型チェック（`tsc --noEmit`）エラーなし、テスト105件すべて成功。

- モンスターデータ構造 / 無限世代の融合
- 遺伝（優性・劣性・隠れ遺伝子・隔世遺伝・突然変異・混合・能力傾向）
- 遺伝子付与（劣性アレルを hidden 枠へ忍ばせる。見た目・能力は不変）
- 能力値（上限あり、融合でインフレしない）
- バトル（ターン制・1対1、N対N対応済み）
- 保存形式（schemaVersion・検証・マイグレーション）
- 画像解析インターフェース（API不要のローカル仮実装付き）

## 2. import は1箇所だけ

```ts
import { ... } from '../core/index.ts';
```

`src/core/index.ts` が公開APIです。`genetics.ts` や `stats.ts` を直接importしないでください（内部実装の変更で壊れます）。型も同じ場所から取れます。

```ts
import type { Monster, MonsterStats, BattleState, BattleLogEntry } from '../core/index.ts';
```

## 3. 最小の使い方

```ts
import {
  createRootMonster, fuse, canFuse,
  createDuel, stepTurn, simulateDuel, createBasicPolicy,
  createSeededRandom, createSystemRandom,
  serializeSaveFile, deserializeSaveFile,
} from '../core/index.ts';

// ゲームセッションごとに1つ。開発中は seed 固定が楽です。
const context = { rng: createSeededRandom(12345) };

// モンスター生成
const a = createRootMonster(context, { name: 'Alpha' });
const b = createRootMonster(context, { name: 'Beta' });

// 融合（先に canFuse で検証できる）
const check = canFuse(a, b);           // { ok: true } | { ok: false, reason, message }
const child = fuse(a, b, context);     // child.generation === 1
const next  = fuse(child, a, context); // 何世代でも可

// バトル（1ターンずつ進める＝アニメーション向き）
let state = createDuel(a, b);
const policy = createBasicPolicy(context.rng);
state = stepTurn(state, policy, context.rng);
// state.outcome.status: 'ongoing' | 'win' | 'draw'
// state.log: BattleLogEntry[]（差分描画は前回の log.length 以降を見る）

// 一括実行（結果だけ欲しいとき）
const result = simulateDuel(a, b, createSeededRandom(7));

// 保存 / 読込
const json = serializeSaveFile([a, b, child, next]);
const loaded = deserializeSaveFile(json); // { ok: true, value } | { ok: false, errors }
```

## 4. UI側で守ってほしいこと

### Monster オブジェクトを手で作らない / 書き換えない

`Monster` は `genes` → `phenotype` → `stats` が整合した状態で作られます。手書きのJSONや直接代入で作ると、能力値が遺伝子と噛み合わない・隠れ遺伝子が空になる、といった不整合が入り、融合すると子孫にまで伝播します。生成は必ず `createRootMonster` / `fuse` / `createMonsterFromAnalysis` を通してください。

### 表示は `phenotype` と `stats` を読むだけ

- 見た目 → `monster.phenotype`
- 能力値 → `monster.stats`
- タグ → `monster.traits`（`'winged'`, `'mutant'`, `'element-fire'` などの文字列配列）

`genes` は融合計算用の内部データです。図鑑などで見せる場合は参考程度に。

### `stepTurn` の戻り値は新しい state

入力した state は変更されません。`state = stepTurn(state, ...)` と代入し直してください。前の state を保持しておけばリプレイや巻き戻しもできます。

### 乱数は context.rng 経由

`Math.random()` をUI側で混ぜると再現性が壊れます。本番は `createSystemRandom()`、開発・テストは `createSeededRandom(seed)` を使ってください。同じseedなら融合結果もバトルログも1行単位で同一になります。

## 5. 見た目の語彙（画像素材の設計に直結します）

`phenotype` が取る値はこの組み合わせに限定されます。

| 項目 | 選択肢 |
|---|---|
| `bodyColor` | red / blue / green / yellow / purple / white / black |
| `bodyShape` | slim / round / muscular / serpentine / winged / **finned** |
| `size` | tiny / small / medium / large / giant |
| `horns` | none / single / twin / crown / spiral / **upright** |
| `wings` | none / feathered / membrane / crystal / ethereal |
| `tail` | none / short / long / spiked / twin / **vine** |
| `eyes` | normal / sharp / round / multi / glowing / **slit** |
| **`crest`**（頭部装飾） | none / flower / fin / crystal / mane / antenna / crown |
| **`jaw`**（口部） | normal / fangs / tusks / beak / maw |
| `element` | neutral / fire / water / earth / wind / light / dark |

**重要**: 融合で生まれる子の見た目はこの組み合わせの中から決まります。組み合わせ総数は1000万通りを超えるため、**1体ずつ描き下ろす方式では融合後の絵が足りなくなります**。パーツ合成（体型＋色＋角＋羽＋尻尾＋目＋頭部装飾＋口を重ねる、計10レイヤー）で描画する設計を推奨します。語彙を増やしてもレイヤーが1枚増えるだけで、組み合わせ数には比例しません。

能力値はこの見た目から算出されます（例: giant → HP+20/速度-12、fire → 攻撃+7/防御-3）。係数は `src/core/config.ts` の `DEFAULT_STATS_CONFIG.visual` にあります。

## 6. 調整したいときは config

ロジックを書き換える必要はありません。

```ts
import { createGameConfig } from '../core/index.ts';

const config = createGameConfig({
  genetics: { mutationRate: 0.2, atavismRate: 0.3 },
  stats: { totalCap: 600 },
  battle: { criticalChance: 0.1, maxTurns: 100 },
});
const context = { rng: createSystemRandom(), config };
```

確率・係数・上限はすべて `src/core/config.ts` に集約してあります。バランス調整の要望はこのファイルの値への指定としてもらえると反映が早いです。

## 7. 画像解析の現状

`LocalMockMonsterAnalyzer` は**画像を実際には見ていません**。ファイルのハッシュから機械的に見た目を決める仮実装です（APIキーなしで動かすため）。赤い龍の絵を渡しても中身は一致しません。

見た目を意図通りにしたい場合は、画像ではなくデータとして渡してください。

```ts
import { createMonsterFromAnalysis } from '../core/index.ts';

const starter = createMonsterFromAnalysis({
  bodyColor: 'red', bodyShape: 'muscular', size: 'large',
  horns: 'twin', wings: 'membrane', tail: 'spiked',
  eyes: 'sharp', element: 'fire', confidence: 1,
}, context, { name: 'イグニス' });
```

本物の解析APIを繋ぐときも同じ関数のままで動きます（`RemoteMonsterAnalyzer` でハンドラを差し替える形。APIキーはリポジトリに置かず、環境変数またはサーバー側プロキシから渡します）。

## 7.5 スターター3体

core側に用意済みです。idは固定値なので、セーブと画像の対応が毎回同じになります。

```ts
import { createStarterMonsters, STARTER_SPECS, findStarterSpec } from '../core/index.ts';

const starters = createStarterMonsters(context);   // Moss / Ignis / Aqua の3体
findStarterSpec('starter-aqua')?.art;              // 'aqua-v2-64.png'
```

| | Moss | Ignis | Aqua |
|---|---|---|---|
| id | `starter-moss` | `starter-ignis` | `starter-aqua` |
| art | moss-v2-64.png | ignis-v2-64.png | aqua-v2-64.png |
| bodyColor | green | red | blue |
| bodyShape | round | muscular | finned |
| size | small | small | small |
| horns | none | spiral | none |
| wings | none | none | none |
| tail | vine | spiked | long |
| eyes | round | slit | glowing |
| crest | flower | none | fin |
| jaw | normal | fangs | maw |
| element | earth | fire | water |
| 能力合計 | 380 | 387 | 389 |
| 性格 | 魔法・防御寄り | 攻撃寄り | 速度・攻撃寄り |

見た目は固定ですが、**隠れ遺伝子はランダム**です。同じMossでもプレイヤーごとに持っている劣性遺伝子が違うため、融合した子は変わります。

## 7.6 系統進化（キングスライム方式）

似た者同士を配合すると進化します。

```ts
import { canFuse, previewEvolution, fuseDetailed } from '../core/index.ts';

const check = canFuse(a, b);
if (check.ok && check.evolution.willEvolve) {
  // 演出を出す。check.evolution.tier が進化後のランク
}

const result = fuseDetailed(a, b, context);
result.evolution.willEvolve;   // 進化したか
result.evolution.similarity;   // 一致率 0..1（UIのゲージに使えます）
result.evolution.blockedBy;    // 'not-similar' | 'tier-mismatch' | 'max-tier' | 'max-size'
result.lockedLoci;             // 親から確定継承された見た目の項目
```

**成立条件**: 見た目10項目の**7割以上が一致**し、両親の tier が同じで、まだ成長余地があること。

**起きること**

1. 一致している見た目は**そのまま継承**（突然変異も起きません）→ これが「安定」の実体
2. `size` が1段階上がる small → medium → large → giant
3. 能力が tier ごとに +12%（上限も +12% 引き上げ）
4. 名前に称号が付く `Moss` → `Great Moss` → `King Moss` → `Emperor Moss`

実測値（Moss系統）:

| tier | 名前 | size | HP | 攻撃 | 防御 | 魔法 | 速度 | 合計 |
|---|---|---|---|---|---|---|---|---|
| 0 | Moss | small | 105 | 52 | 83 | 91 | 49 | 380 |
| 1 | Great Moss | medium | 125 | 59 | 92 | 104 | 48 | 428 |
| 2 | King Moss | large | 150 | 74 | 99 | 114 | 45 | 482 |
| 3 | Emperor Moss | giant | 178 | 87 | 116 | 125 | 41 | 547 |

tier 3 で元の **約1.44倍**。tier 3 には元のモンスターが**8体**必要なので、コストは指数・強さは線形で自然に歯止めがかかります。`size` が giant に達すると物理的に打ち止めです。

**UI側の対応が必要な点**

- **ランク表示は `monster.tier` を見てください**。王冠などの記章はUI側で重ねる想定です。`crest` は上書きしません（上書きするとMossが花を失い、種の個性が消えるため）
- 進化しても **bodyColor と element は変わりません**。緑のMossは緑のまま大きくなります
- tier の異なる相手と配合すると tier は低い方に落ちます（高ランクの使い回し防止）

## 7.7 遺伝子付与（gene graft）

劣性（低dominance）のアレルを `hidden` 枠へ忍ばせる機能です。実装済み。

```ts
import { graftRandomRecessive, graftGene, graftRandomRecessiveDetailed } from '../core/index.ts';

// ランダムな locus にランダムな値を1つ（既定）
const seeded = graftRandomRecessive(monster, context);

// 件数と対象を指定（能力傾向4項目を含めるかは includeNumeric）
const multi = graftRandomRecessive(monster, context, {
  count: 3,
  includeNumeric: false,
  loci: ['horns', 'wings', 'crest'],   // 省略すると全locusが候補
});

// 値を指定（通常プールに無い値も入れられます＝レア遺伝子に使えます）
const exact = graftGene(monster, 'crest', 'crown', context);
const tendency = graftGene(monster, 'attackTendency', 90, context);

// 何が入って何を押し出したかを知りたいとき
const { monster: after, grafts } = graftRandomRecessiveDetailed(monster, context, { count: 2 });
grafts[0];  // { locus, value, dominance, replaced }  replaced は上書きされた旧キャリア
```

**UI側で押さえてほしい点**

- **付与した個体は一切変わりません**。`phenotype` / `stats` / `traits` / `mutationCount` は元と完全に同一で、id・名前・generation・tier・親id・createdAt もそのままです。`hidden` は発現しないので、バランスへの影響はゼロ（テストで保証）。つまり「使っても弱くならない・強くならない」アイテムとして出せます
- **効果が出るのは子孫です**。`hidden` は `atavismRate` で子に渡り、`carrierFrom` が最も劣性のアレルをキャリアとして残すため、付与した遺伝子は潜ったまま何世代も受け継がれ、相手の dominance が弱いときに突然発現します。実測では既定設定で「8世代・200系統」のうち数系統で発現しました（＝レアな当たり演出向き）
- **戻り値は新しい Monster です**。`monster = graftRandomRecessive(monster, context)` と入れ替えてください。元のオブジェクトは変更されません
- **即座に見た目を変えたい用途には使えません**。それが欲しい場合は `createMonsterFromAnalysis` で作り直す方向になります
- 付与後の「仕込みがある個体」であることをUIで見せたい場合、`monster.genes[locus].hidden` を直接読むのが確実です（`traits` には出ません。発現するまで本人は普通の個体だからです）
- schemaVersion は変わりません（Monster の形は同じ）。付与済みの個体もそのまま保存・読込できます

**調整**: 確率・係数は `config.graft` です。

```ts
const config = createGameConfig({
  graft: {
    dominanceRange: [0.02, 0.2],  // 付与されるアレルの dominance。既定の遺伝子より低い
    recessiveMargin: 0.02,        // その locus の最弱アレルより必ずこれだけ下に押し下げる
    lociPerGraft: 1,              // 一度に付与する locus 数
    includeNumericLoci: false,    // 能力傾向（attack/defense/magic/speedTendency）を対象に含めるか
  },
});
```

`dominanceRange` を上げれば発現が早まり、下げればより深く潜ります（＝レア度の調整つまみ）。

## 8. 未実装 / 相談したいこと

core側で未着手の部分です。UI設計に影響するものは早めに決めたいです。

- **スキル**: 現在は属性由来の2種のみ（固有スキル＋通常攻撃）。種類を増やすか要相談
- **状態異常・バフ/デバフ**: 未実装
- **育成・レベルアップ**: 仕様に含まれていなかったため未実装
- **パーティ戦のUI**: エンジンはN対N対応済み。`createBattle([[a,b,c],[d,e,f]])` で動きます

## 8.5 coreの参照方法

UI側は `@core` エイリアスで、隣に置かれた `MonsterFusion-Core/src` を直接参照しています。
coreのソースはUIリポジトリに複製されていません。core側を直せば、そのままUIに反映されます。

```
MonsterFusion-UI/vite.config.ts   resolve.alias['@core'] と server.fs.allow
MonsterFusion-UI/tsconfig.json    paths: { "@core/*": [...] }
```

import は `from '@core/core/index.ts'` の形になります。

**前提**: 2つのリポジトリが隣り合って配置されている必要があります（`C:\Dev\MonsterFusion-Core` と `C:\Dev\MonsterFusion-UI`）。

**お願い**: coreの不具合はUI側ではなく、core本体（このリポジトリ、ブランチ `claude-core`）を直してください。テストもこちらにあります。

## 8.6 融合した子の見た目

`composeAppearance(phenotype)` が、描くべきレイヤー（パーツ・座標・倍率・パレット）を返します。UI側はそれを描くだけで、何世代融合しても正しい見た目を生成できます。

```ts
import { composeAppearance } from '@core/core/index.ts';
const { layers, colorMappings, key } = composeAppearance(monster.phenotype);
```

必要なパーツ画像は**35枚**です（体色はパレット変換、サイズは拡大縮小で済むため増えません）。アンカーポイント、パレットスワップ、描画コード例、段階的な進め方は [SPRITE_COMPOSITION.md](SPRITE_COMPOSITION.md) にまとめてあります。

現在 `src/mocks/game.ts:61` で子に親Aの画像を流用している箇所が、これで置き換えられます。

さらに `poseAt()` で、呼吸・瞬き・攻撃・被弾のアニメーションが**素材追加なし**で動きます。パーツが別レイヤーなので、尻尾や翼が体に遅れて付いてくる動き（DS世代のスプライトが生きて見える理由）が出せます。同じく [SPRITE_COMPOSITION.md](SPRITE_COMPOSITION.md) の9章にまとめてあります。

## 8.7 追加素材の依頼

[ASSET_REQUESTS.md](ASSET_REQUESTS.md) に、効果の大きい順でまとめてあります。`horns/upright` はcore側だけ対応済みで素材待ちです（出現しても角なしで描画されます）。

## 8.8 特徴タグと融合演出

モンスターの特徴を日本語タグで表示するAPIと、融合演出用のデータを用意しました。

```ts
import { describeMonster, describeFusion } from '@core/core/index.ts';
describeMonster(monster);   // kind: dominant 赤 / recessive 青 / hidden 紫枠 / mutation 紫
describeFusion(child, evolved).steps;   // 演出の順番に並んだ配列
```

日本語ラベルは全てcore側にあります。詳細と演出の依頼文は [TAGS_AND_FUSION_FX.md](TAGS_AND_FUSION_FX.md) に。

**schemaVersion が 4 になりました**（`mutatedLoci` / `atavismLoci` の追加）。旧セーブは自動補完されます。

## 8.9 バトル

BATTLE_HANDOFF.md への対応は [BATTLE.md](BATTLE.md) にまとめてあります。要点:

- **守るはターン開始時に発動します**。遅い側が守っても先制攻撃を軽減できます。UI側の「先制攻撃は防げません」という説明は事実と異なるようになりました
- 同格の戦闘が**2ターン → 5〜8ターン**になりました。素早さ+40の勝率は93% → 75%
- `BattleLogEntry` に `skillId` / `elementMultiplier` / `mitigated` / `mpSpent` を追加（既存フィールドは維持）
- `declareActions()` で宣言内容だけ取得可。予備動作の表示に使えます
- `expectedDamage()` で乱数抜きの期待ダメージ。技選択UIの表示と敵AIの判断が同じ関数になります
- スターターの能力傾向を均衡化しました（最大乖離 29% → 11%）

## 9. コマンド

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # node --test
npm run check       # 両方
```

Node 24 の型ストリッピングで `.ts` を直接実行しています。ビルド手順はありません。import は拡張子付き（`'../core/index.ts'`）で書いてください。
