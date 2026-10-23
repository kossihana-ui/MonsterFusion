# パーツ素材の作成・修正プロンプト

合成結果に残っている「キメラ感・奇形感」の原因と、それを解消するための素材制作指示です。GPT等の画像生成にそのまま渡せます。

## 1. 何が原因か

座標や倍率の問題は解消済みです（`BODY_RIGS` を実素材に対して測り直し、顔幅に対する目・顎の比率も補正済み）。残っているのは**描き方の不一致**で、3点あります。

| 症状 | 原因 |
|---|---|
| 翼が凧を貼ったように見える | 翼が**真横からの平面**で描かれている。体は3/4視点 |
| 翼が片側にしかない | 3/4視点の生物は**奥の翼と手前の翼**が見えるはず |
| 角がお面のように見える | 角が**正面対称**で描かれている。3/4の頭に乗らない |

加えて、パーツごとに**光源と線の太さが揃っていない**ため、それぞれが別の絵に見えます。

## 2. 全パーツ共通の指示（必ず冒頭に入れてください）

```
MonsterFusion part sprite. Pixel art, no anti-aliasing, no gradients, no text,
no background, fully transparent outside the shape.

VIEW: three-quarter view, the creature faces slightly LEFT and toward the
viewer. Every part must be drawn for this same view. Never draw a part
straight-on or in pure side view.

LIGHT: a single light source from the UPPER LEFT. The upper-left surfaces take
the light tone, the lower-right surfaces take the shade tone. Keep this
consistent; a part lit from elsewhere will look pasted on.

OUTLINE: 1px outline in the outline colour, on every silhouette edge. Do not
outline interior detail lines more heavily than the silhouette.

COLOURS: use ONLY these exact hex values and nothing else. No intermediate
tones, no anti-aliased edges.
  outline  #1b2030
  body     shade #4a4a6a   base #8a8ab0   light #c8c8e0
  belly    shade #6a5a3a   base #b09a6a   light #e0d0a0
  keratin  shade #3a5a4a   base #6aa88a   light #a8e0c0
  membrane shade #5a3a6a   base #a06ac0   light #d0a8e8
  eye      shade #7a2a2a   base #d04a4a   light #f09a9a
  accent   #ff00ff
These are placeholders; the game recolours them per monster. Use the channel
that matches the material: horns and claws are keratin, wing membranes are
membrane, undersides are belly, and so on.

DETAIL DENSITY: 3 to 5 colours per part. Match the density of the body
sprites - do not add fine texture that the body does not have.
```

## 3. 翼（最優先・8枚）

**対応済みです**（2026-10-23）。8枚が納品され、core側も既定で前後ペアを使います。以下は再生成が必要になった場合の指示です。

```
Draw a WING PAIR for a three-quarter view creature, as TWO separate sprites.

Canvas: 32x32 each, transparent.

"-far"  : the wing on the FAR side of the body. Partly hidden by the body, so
          draw only what would be visible past the shoulder. Smaller, flatter,
          and one tone darker overall (it is further from the light). Angled
          slightly away from the viewer.
"-near" : the wing on the NEAR side. Fuller, more foreshortening, catches the
          light on its upper surface.

Both sprites share one wing root at the SAME pixel: the leftmost point of the
wing art, vertically at 27/32 down. That pixel is where it meets the back.

Types to draw (4 pairs, 8 sprites):
  feathered - layered feathers, rounded trailing edge, bird-like
  membrane  - bat-like, 3 finger struts, scalloped trailing edge
  crystal   - angular faceted panes, hard straight edges
  ethereal  - soft translucent shape, thin outline, inner glow using accent

Use membrane colours for the wing surface and keratin for the struts, bones
and claws.
```

**重要**: 奥の翼は「体に隠れて見える範囲だけ」を描いてください。全体を描くと体の向こうに大きくはみ出します。

## 4. 角（4枚・描き直し）

```
Draw HORNS for a three-quarter view head, as a single sprite.

Canvas: 32x32 (spiral may be 44x32), transparent.

The head is turned slightly LEFT and toward the viewer, so the pair of horns
is NOT symmetrical: the LEFT horn is slightly smaller, more foreshortened, and
further from the viewer; the RIGHT horn is larger and nearer. Do not draw a
mirror-symmetrical pair - that is what makes horns read as a mask.

The attachment point is the midpoint between the two horn bases. Leave the art
touching that point. A few pixels of base may sit below it, so the horn sinks
into the skull rather than balancing on it.

Types:
  single - one horn from the brow, angled up and back
  twin   - two horns, swept back, the near one larger
  crown  - a ring of short points, the front ones nearer and larger
  spiral - heavy ram horns curling down around the sides of the head

Material is keratin throughout, with the shade tone on the lower-right of each
horn and ridges running across the curve.
```

**巻き角について**: 30px幅で描き直されましたが、巻きが眉から下に垂れる形状のため、他の角が目を1%も隠さないのに対し40〜73%隠します。core側で0.8倍、頭の小さい `serpentine` と `finned` ではさらに0.7倍にしています。垂れ下がりを浅くすれば補正を減らせます。

## 5. 口・顎（4枚・描き直し）

```
Draw a JAW for a three-quarter view face, as a single sprite.

Canvas: 28x24, transparent.

The jaw must PROTRUDE toward the lower LEFT, since the face is turned that
way. A jaw drawn flat and symmetrical disappears into the face.

The attachment point is the TOP CENTRE of the art, where it meets the muzzle.

Types:
  fangs - closed mouth, two upper fangs showing past the lip
  tusks - two heavy tusks curving up from the lower jaw
  beak  - a hard hooked beak, keratin, clearly protruding forward
  maw   - a wide open mouth, teeth top and bottom, dark interior

Teeth and beak use keratin. The mouth interior uses the body shade tone. The
lip line uses the outline colour.
```

## 6. 頭部装飾（6枚・必要なら）

現在のものは比較的うまく機能しています。差し替えるなら:

```
Draw a HEAD CREST for a three-quarter view head, as a single sprite.

Canvas: 22x22, transparent. It sits on TOP of the skull, so its attachment
point is the BOTTOM CENTRE of the art.

Tilt the crest slightly to match a head turned left: the left side is nearer
the viewer and catches more light.

Types: flower / fin / crystal / mane / antenna / crown
```

## 7. 目（6枚・現状維持でも可）

比率はcore側で体型ごとに補正済みです（`slim` 0.7倍、`finned` 1.3倍など）。描き直す場合は:

```
Draw a pair of EYES for a three-quarter view face, as a single sprite.

Canvas: 20x10, transparent. The attachment point is the centre of the art.

Because the face is turned left, the LEFT eye is slightly narrower and closer
to the edge of the face; the RIGHT eye is fuller and rounder. A symmetrical
pair reads as a face looking straight at the viewer, which fights the body.

Types: normal / sharp / round / multi / glowing / slit
Use the eye colour channel. A single 1px highlight in the light tone, placed
in the UPPER LEFT of each eye.
```

## 8. 作業順の提案

1. **翼8枚**（前後ペア） — 効果が一番大きい
2. **角4枚**（非対称に） — 次に効く
3. **口4枚**（突出させる）
4. 目・装飾は必要に応じて

翼が入った時点で `wingPairs: true` に切り替えてください。それまでは現在の4枚で動きます（core側は既定で単体モードのままです）。

## 9. 納品時の確認

- 透明部分が完全に透明（半透明のフチが残っていないこと）
- 指定した17色以外が1pxも入っていないこと
- 取り付け点の位置を `manifest.json` に記載すること

`referenceColors()` が許可色の一覧を返すので、素材チェッカーを書けば機械的に検証できます。
