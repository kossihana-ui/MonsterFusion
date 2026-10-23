# 追加素材の依頼

合成結果をもう一段「生物らしく」するために欲しい素材です。効果の大きい順に並べてあります。

既存39枚の素材は**そのまま使い続けます**。これは追加と、既存2種の描き直し依頼です。

---

## A. 今すぐ必要（1枚・core対応済み）

### `horns/upright` — 上向きの角

**core側は対応済みです。** `HornType` に `upright` を追加し、遺伝子プールにも入っています。素材がまだ無いので、現状この角が出たモンスターは角なしで描画されます（UIが欠落レイヤーをスキップするため）。

追加した理由は、巻き角が顔を覆う問題の根本解決です。測定値:

```
角が目を隠す割合（倍率補正なし）
         single  twin  crown  spiral
round        0%    0%     0%     60%
serpentine   0%    0%     0%     66%
finned       0%    0%     0%     73%
```

巻き角だけが眉から下に垂れるため顔にかかります。倍率で縮めると角が貧弱になるので、**大きくても顔にかからない角**を別に用意するほうが良い解です。

```
Draw UPRIGHT HORNS for a three-quarter view head, as a single sprite.

Canvas 32x32, transparent. Attachment point (16,25): the midpoint between the
two horn bases, at the bottom of the art. Art must not extend more than 2px
below that point.

A tall pair sweeping UP and slightly BACK, like an oryx or an antelope. They
must never curve forward or down past the brow - that is what the ram horns
do, and it is why they cover a face. Keep everything above the attachment
point.

The head is turned slightly LEFT and toward the viewer, so the pair is NOT
symmetrical: the LEFT horn is narrower and more foreshortened, the RIGHT horn
larger and nearer. Ridges run across the curve, denser toward the base.

Green keratin only (shade #3a5a4a, base #6aa88a, light #a8e0c0) plus the
outline #1b2030. 3 to 5 colours. Single light from the upper left.
```

---

## B. 既存2種の描き直し（効果大・新規locus不要）

### 1. `jaw/*` を一回り小さく（4枚）

現在の顎は**28×24の中に26×20**描かれており、顔幅に対して大きすぎます。core側で体型ごとに0.42〜0.89倍に縮めているため、小さい体型では口がほぼ見えません。

```
Redraw the four JAW sprites at about 18px of art width instead of 26px,
keeping the same 28x24 canvas and the same attachment point (14,2) at the top
centre. Everything else unchanged: three-quarter view, protruding toward the
lower left, keratin teeth, dark interior.

The mouth should read at a glance on a face 22px wide. Right now it has to be
shrunk to 0.42x on the narrow bodies and disappears.
```

縮めてもらえれば、core側の倍率を1.0近くまで戻せます。

### 2. `horns/spiral` の垂れ下がりを浅く（1枚）

```
Redraw the RAM horns so the curl stays beside the head rather than sweeping
down across it. The lowest point of the curl must not drop more than 6px
below the attachment point (16,10). Same canvas, same attachment point, same
heavy ridged ram character - just a shallower spiral.
```

現在は17px垂れています。6px以内に収まれば、core側の0.8倍／0.7倍補正が不要になります。

---

## C. 新しい部位（要相談・schemaVersion 4）

ここから先は**遺伝子に新しい部位を足す**ため、セーブ形式のバージョンが上がります（旧セーブは自動で補完されるので壊れません）。やるかどうか決めてから着手します。

### 1. 耳（5枚）— 推奨

顔の識別力が一番上がります。頭の**側面**に付くので、角・装飾・目のどれとも競合しません。現状、頭の差は目と口だけで決まっており、これが「どれも似ている」印象の一因です。

```
Draw EARS for a three-quarter view head, as a single sprite containing both.

Canvas 24x20, transparent. Attachment point (12,16): the midpoint between the
two ear bases, where they meet the skull.

The head is turned left, so the LEFT ear is narrower and partly behind the
head, the RIGHT ear is fuller and catches the light on its inner surface.

Types (5 sprites):
  pointed - upright triangular, like a cat or a fox
  round   - short rounded, like a bear
  long    - long drooping, past the jaw
  finned  - webbed fins instead of ears, for aquatic creatures
  tufted  - short ears with long tufts of hair at the tips

Outer surface uses the body channel, the inner surface uses the belly
channel. Outline #1b2030.
```

### 2. 背部（5枚）

シルエットの変化が大きく、顔には一切干渉しません。翼とは別レイヤーです（翼なしの個体でも背に特徴を出せます）。

```
Draw a BACK FEATURE for a three-quarter view creature, as a single sprite.

Canvas 28x24, transparent. Attachment point (4,20): the lower left, where it
meets the spine. The feature rises up and to the right along the back.

Types (5 sprites):
  spines  - a row of bony spikes, tallest in the middle
  sail    - a membrane fin held up by struts
  shell   - a hard domed carapace
  plates  - overlapping armour plates
  fur     - a thick ridge of long fur

Spines and plates use keratin, the sail uses membrane, shell uses body tones
with a belly-toned rim, fur uses body tones.
```

### 3. 模様（素材不要・代案）

体の模様は変化が大きいのですが、**体型6種それぞれに描き分けが必要**（6×5＝30枚）でコストが見合いません。

代わりに**色だけで模様を表現する**案があります。素材は1枚も要りません。

- `pattern` 遺伝子を追加し、腹の色のランプを体色とは別の色相にする
- 例: `none`（現状）/ `pale-belly`（腹が明るい）/ `dark-back`（背が暗い）/ `two-tone`（腹が補色）

core側のパレット処理だけで実現できます。素材の追加なしで個体差が増えるので、費用対効果は一番良いです。

---

## 優先順位の提案

| | 内容 | 枚数 | 新locus |
|---|---|---|---|
| 1 | `horns/upright` | 1 | 不要（対応済み） |
| 2 | `jaw/*` を小さく描き直し | 4 | 不要 |
| 3 | `horns/spiral` の垂れを浅く | 1 | 不要 |
| 4 | 耳 | 5 | 必要 |
| 5 | 背部 | 5 | 必要 |
| 6 | 模様（色のみ） | 0 | 必要 |

**1〜3は新しい仕組みが要らないので、先に進めてもらって構いません。** 4以降はschemaVersionが上がるので、どれを入れるか決めてから着手します。

## 共通の指示

[ART_PROMPTS.md](ART_PROMPTS.md) の2章（視点・光源・輪郭・17色のパレット・情報量）を必ず先頭に付けてください。パーツごとにそれが揃っていないと、どれだけ形が良くても貼り付けたように見えます。

納品時は `manifest.json` に取り付け点を記載してください。core側はその点を正としてリグを合わせます。
