# スプライト合成仕様（UI側向け）

融合した子の見た目を動的に生成するための仕様です。core側に `composeAppearance()` を実装しました。UI側はその出力を描画するだけで、1000万通り以上の組み合わせすべてを描けます。

## 0. 前提：ポケモンフュージョン方式との違い

Pokémon Infinite Fusion は「Aの頭 + Bの胴体」という**2枚の完成イラストの切り貼り**です。そのため、片方から主要色を抽出してもう片方に合わせる処理が必要になります。

このゲームは違います。**融合した時点で、子の見た目10項目は遺伝で確定しています**。

```ts
child.phenotype
// { bodyShape:'muscular', bodyColor:'blue', size:'large',
//   horns:'none', wings:'none', tail:'vine', eyes:'multi',
//   crest:'fin', jaw:'normal', element:'earth', ... }
```

やるべきことは2体を繋ぐことではなく、**確定した表現型をレイヤーで組み立てる**ことです。結果として色の扱いが大きく楽になります。

| | ポケモンフュージョン | このゲーム |
|---|---|---|
| 色 | 2枚から抽出して合わせる。ズレる | `bodyColor` 遺伝子が1色に確定。**抽出不要** |
| 部位 | 頭と胴の2分割 | 7レイヤー（体・角・翼・尻尾・目・頭部装飾・口） |
| 素材 | 全モンスター分のイラスト | **35枚のパーツ** |

**import は必ず `@core/core/index.ts` 経由にしてください。** 内部ファイルを直接指すと、core側の構成変更で壊れます。本資料の例もすべて index.ts 経由に統一してあります。

## 1. 担当範囲

| | 担当 | 内容 |
|---|---|---|
| どのパーツを、どこに、どの大きさで、何色で | **core（実装済み）** | `composeAppearance(phenotype)` |
| 実際に描く | **UI** | canvas / SVG への描画、パレット変換 |
| パーツ画像そのもの | **UI** | 35枚のスプライト |

## 2. core が返すもの

```ts
import { composeAppearance } from '@core/core/index.ts';

const composition = composeAppearance(monster.phenotype);
```

```ts
{
  canvas: { width: 64, height: 64 },
  layers: [                      // 既に奥→手前の順にソート済み
    { kind:'tail',  part:'tail/vine',    z:1, anchor:{x:44.75,y:40.5}, scale:0.85, flipX:false },
    { kind:'body',  part:'body/round',   z:2, anchor:{x:32,y:37.1},    scale:0.85, flipX:false },
    { kind:'eyes',  part:'eyes/round',   z:4, anchor:{x:31.15,y:32.85},scale:0.85, flipX:false },
    { kind:'crest', part:'crest/flower', z:6, anchor:{x:32,y:21.8},    scale:0.85, flipX:false },
  ],
  palette: { outline:'#122a14', shade:'#2a6b2e', base:'#4aa83c', light:'#8fd96a', accent:'#c08a3a' },
  colorMappings: [ { from:'#1b2030', to:'#122a14' }, ... ],
  sizeScale: 0.85,
  key: 'round/green/small/none/none/vine/round/flower/normal/earth',
}
```

- `part` は拡張子なしのアセットキー。`assets/parts/${part}.png` のように解決してください
- `anchor` は**パーツ側の原点を置く座標**（64×64グリッド）
- `scale` は既に体サイズと体型ごとの頭サイズを掛け込んだ最終倍率
- `layers` は**描画順にソート済み**。そのまま前から順に描けば正しく重なります
- `key` は同じ見た目なら同じ文字列。**スプライトのキャッシュキーに使えます**

純関数なので、同じphenotypeなら必ず同じ結果です。

## 3. アンカーポイント

2段構えです。

**体側（core が持つ）**: 体型ごとに、角・翼・尻尾・目・頭部装飾・口の取り付け位置を定義しています。`BODY_RIGS` としてエクスポート済みです。

```ts
import { BODY_RIGS } from '@core/core/index.ts';

BODY_RIGS.round.anchors.horns   // { x: 32, y: 23 }
BODY_RIGS.serpentine.anchors.horns  // { x: 26, y: 14 }
BODY_RIGS.serpentine.headScale  // 0.75（蛇型は頭が小さいので角も縮む）
```

**パーツ側（UI が決める）**: 各パーツ画像は、**体に接する点を自分の原点として**描いてください。

- 角 → 角の根元
- 翼 → 翼の付け根
- 尻尾 → 尻尾の付け根
- 目 → 両目の中心
- 頭部装飾 → 頭に接する底面の中心
- 口 → 口の中心
- 体 → 体の中心

描画時は「パーツの原点が `anchor` に来るように」配置します。原点の座標はUI側のアセットマニフェストで管理してください（画像の中心でよければ計算だけで済みます）。

これにより、**体型ごとにパーツを描き分ける必要がなくなります**。1本の角が6種類の体型すべてで使えます。

座標が合わない場合は `BODY_RIGS` の数値を調整すれば全体に反映されます。調整が必要になったら言ってください。core側のテストが座標の範囲を検証しています。

## 4. パレットスワップ

**パーツは固定の参照色5色だけで描いてください。** 実行時にモンスターの色へ置換します。

```ts
import { REFERENCE_PALETTE } from '@core/core/index.ts';

{
  outline: '#1b2030',   // 輪郭
  shade:   '#4a4a6a',   // 影
  base:    '#8a8ab0',   // 基本色
  light:   '#c8c8e0',   // ハイライト
  accent:  '#ff00ff',   // 属性色（宝石・発光部のみ。体には使わない）
}
```

わざと見分けのつく値にしてあります。塗り間違いがレビューで一目で分かります。アンチエイリアスは禁止です（中間色が変換から漏れます）。

`composition.colorMappings` が `from` → `to` の対応表です。canvas での実装例:

```ts
function recolor(image: ImageData, mappings: ColorMapping[]): ImageData {
  const lut = new Map<number, [number, number, number]>();
  for (const { from, to } of mappings) {
    lut.set(hexToInt(from), hexToRgb(to));
  }
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;                       // 透明はそのまま
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const to = lut.get(key);
    if (to) { d[i] = to[0]; d[i + 1] = to[1]; d[i + 2] = to[2]; }
  }
  return image;
}
```

`accent` は属性色です。炎なら橙、闇なら紫になります。**体の色には使わないでください** — 体は `bodyColor` 遺伝子が決めます。

## 5. 描画の流れ

```ts
export async function renderMonster(phenotype: MonsterPhenotype): Promise<HTMLCanvasElement> {
  const composition = composeAppearance(phenotype);

  const cached = spriteCache.get(composition.key);
  if (cached) return cached;                            // 同じ見た目は使い回す

  const canvas = document.createElement('canvas');
  canvas.width = composition.canvas.width;
  canvas.height = composition.canvas.height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;                    // ドット絵なので必須

  for (const layer of composition.layers) {             // 既にソート済み
    const part = await loadPart(layer.part);            // 参照色のまま
    const tinted = recolorPart(part, composition.colorMappings);
    const w = part.width * layer.scale;
    const h = part.height * layer.scale;
    const origin = partOrigin(layer.part);              // UI側のマニフェスト

    ctx.save();
    if (layer.flipX) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(
      tinted,
      layer.anchor.x - origin.x * layer.scale,
      layer.anchor.y - origin.y * layer.scale,
      w, h,
    );
    ctx.restore();
  }

  spriteCache.set(composition.key, canvas);
  return canvas;
}
```

変換結果はパーツ単位でもキャッシュできます（`part` + `bodyColor` をキーに）。

## 6. 必要なパーツ一覧（35枚）

```
body/round        body/slim         body/muscular
body/serpentine   body/winged       body/finned

horns/single      horns/twin        horns/crown       horns/spiral

wings/feathered   wings/membrane    wings/crystal     wings/ethereal

tail/short        tail/long         tail/spiked       tail/twin         tail/vine

eyes/normal       eyes/sharp        eyes/round        eyes/multi
eyes/glowing      eyes/slit

crest/flower      crest/fin         crest/crystal     crest/mane
crest/antenna     crest/crown

jaw/fangs         jaw/tusks         jaw/beak          jaw/maw
```

**体色7種は描き分け不要**（パレット変換）、**サイズ5段階も描き分け不要**（拡大縮小）です。`horns/none` のような「無し」の値はレイヤーが出ないので素材も不要です。`jaw/normal` は体スプライトに含めてください。

この35枚で、何世代融合しても素材が足りなくなることはありません。core側のテストが200世代ぶんのphenotypeを生成して、このリストで全部描けることを検証しています。

スターター3体の既存イラストは、このパーツ構成に分解し直す作業が必要です。

## 7. 優先順位の提案

35枚を一度に描くのは大変なので、段階的に進められます。

1. **体6枚 + 目6枚** — これだけで全モンスターが「それらしく」描けます（角・翼・尻尾・装飾が無いだけ）
2. **頭部装飾6枚 + 角4枚** — スターターの個性（Mossの花、Ignisの巻き角）が戻ります
3. **尻尾5枚 + 翼4枚 + 口4枚** — 完成

core側は最初から全部返しますが、UI側で「素材が無いレイヤーはスキップ」する実装にしておけば、1の段階から動かせます。

## 8. 調整が必要になったら

アンカー座標・サイズ倍率・パレットは全て core 側の `src/core/appearance.ts` にあります。描いてみて位置が合わない場合は、具体的に（「蛇型の角が3px下」など）言ってください。数値を直せば全体に反映されます。

`createAppearanceConfig()` でUI側から上書きすることもできますが、恒久的な調整はcore側に入れる方が良いです。

---

# 9. アニメーション

`poseAt()` が、ある瞬間に各レイヤーがどこにいるかを返します。**追加の素材は不要です。**

## 9.1 なぜレイヤー分割でぬるぬる動くのか

DS世代のスプライトが生きて見える理由は、フレーム数ではなく**パーツが別々のタイミングで動く**ことにあります。体が踏み込んだ後、ワンテンポ遅れて尻尾と翼が付いてくる。この「追従の遅れ（secondary motion）」が重さと生命感を作ります。

実測値です（攻撃モーション）。

```
  t(ms)   体X     尻尾X   尻尾の角度
     0       0       0       0
   120   3.424   0.505  -1.188     ← 体が引く。尻尾はまだ動き出さない
   180   3.462   2.397  -5.639     ← 尻尾がようやく追いつく
   240  -2.577   2.944  -6.927     ← 体は踏み込み済み。尻尾は後ろに残る
   300  -5.452   2.805  -6.776     ← 最大到達。尻尾はまだ戻れていない
   360  -2.097  -4.595   2.975     ← 体が戻る途中で尻尾が追い越す
   480  -0.033  -1.469   1.344     ← 収束
```

1枚絵では原理的に不可能で、レイヤーに分けた今だけ無料で手に入ります。

## 9.2 使い方

```ts
import { composeAppearance, poseAt, animationDuration } from '@core/core/index.ts';

const composition = composeAppearance(monster.phenotype);   // 1回だけ
const pose = poseAt(composition, { animation: 'attack', timeMs: elapsed });
```

```ts
{
  animation: 'attack',
  elapsed: 180, progress: 0.346, finished: false,
  layers: [
    { kind:'tail', part:'tail/spiked', anchor:{...}, scale:1,
      transform:{ offsetX:2.397, offsetY:-0.36, scaleX:1, scaleY:1, rotation:-5.639, opacity:1 } },
    ...
  ],
  flash: 0,
}
```

`anchor` と `scale` は `composeAppearance` が返したものと同じです。`transform` が今フレームの差分です。

## 9.3 クリップ

| 名前 | 長さ | 内容 |
|---|---|---|
| `idle` | 2600ms ループ | 呼吸＋瞬き。**終わりません**（`finished` は常に false） |
| `attack` | 520ms 単発 | 引き → 踏み込み → 戻り |
| `hurt` | 340ms 単発 | のけぞり＋白フラッシュ |

単発クリップは終了後、最終フレームを保持したまま `finished: true` を返します。UI側はそれを見て `idle` に戻してください。長さは `animationDuration(name)` で取れるので、バトルの演出尺と合わせられます。

## 9.4 描画ループ

`composeAppearance` の描画に `transform` を足すだけです。

```ts
function drawPose(ctx: CanvasRenderingContext2D, pose: Pose) {
  ctx.clearRect(0, 0, 64, 64);

  for (const layer of pose.layers) {
    const t = layer.transform;
    const part = partImage(t.partOverride ?? layer.part);
    const origin = partOrigin(layer.part);

    ctx.save();
    ctx.globalAlpha = t.opacity;
    ctx.translate(layer.anchor.x + t.offsetX, layer.anchor.y + t.offsetY);
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
    ctx.scale(t.scaleX * (layer.flipX ? -1 : 1), t.scaleY);
    ctx.drawImage(
      part,
      -origin.x * layer.scale, -origin.y * layer.scale,
      part.width * layer.scale, part.height * layer.scale,
    );
    ctx.restore();
  }

  if (pose.flash > 0) {                       // 被弾の白フラッシュ
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = pose.flash;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.restore();
  }
}
```

**重要**: 回転と拡縮は**アンカー基準**で適用してください（`translate` してから `rotate`/`scale`）。原点基準でやると角が頭から外れます。

`ctx.imageSmoothingEnabled = false` は維持してください。ただし回転が入るフレームだけは、ドット絵として許容できるか確認してください。気になる場合は `DEFAULT_LAYER_MOTION` の `sway` を0にすれば回転が消えます。

## 9.5 瞬き

既定では**素材不要**です。目のレイヤーを縦に潰して閉じを表現します（`blinkStyle: 'squash'`）。

専用の閉じ目を描く場合は `createAnimationConfig({ blinkStyle: 'swap' })` にすると、`transform.partOverride` に `eyes/round-closed` のようなキーが入ります。6枚追加になります。

- 間隔は平均3.4秒、±1.5秒のゆらぎ付き（等間隔だとメトロノームに見えるため）
- 1回130ms。目を閉じている時間は全体の8%未満
- `eyes/slit`（糸目）は**元から閉じているので瞬きしません**

## 9.6 パーティで同期させない

複数体を並べると、全員が同じ呼吸・同じ瞬きをして不気味になります。`phase` に個体ごとに違う数値を渡してください。

```ts
poseAt(composition, { animation: 'idle', timeMs, phase: combatantIndex * 900 });
```

## 9.7 向き

`facingRight: true` で左右反転します。バトルで対面させるときに使ってください。移動方向と回転方向が正しく反転します。

## 9.8 調整

すべて `createAnimationConfig()` で上書きできます。

```ts
createAnimationConfig({
  attackDurationMs: 700,        // もっとためる
  breathAmplitude: 0.08,        // 呼吸を大きく
  motion: { tail: { follow: 0.85, lagMs: 200, breathe: 0, sway: 12 } },  // 尻尾をもっと遅らせる
});
```

`lagMs` が追従の遅れ、`sway` が揺れの角度です。**この2つがぬるぬる感を決めます。** 動かしてみて物足りなければ、まずこの数値を上げてください。恒久的な調整は core 側（`src/core/animation.ts`）に入れます。
