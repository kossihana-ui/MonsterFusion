# スターターデザイン案

各個体は64×64ピクセルの透過PNG。moss-64.png（モス／森）、ignis-64.png（イグニス／炎）、aqua-64.png（アクア／水）。starters-preview-4x.png は確認用の4倍拡大一覧で、ゲーム素材ではありません。

組み込み画像生成ツールで原画を作成し、最近傍サンプリングで64×64に統一。アルファは二値化して半透明の縁を除去しています。今回はデザイン提案のみで、既存UI・core・モンスターデータには接続していません。まだパーツ分割されていない完成形の見本です。

## デザインとcore用候補

並び順：bodyColor / bodyShape / size / horns / wings / tail / eyes / element。

- モス：緑の丸いスライム、双葉、大きな琥珀色の目、短い尻尾。候補は green / round / small / none / none / short / round / earth。森のイメージをearthに対応させる案。双葉は装飾。
- イグニス：赤い小竜、双角、膜の翼、棘の尻尾。候補は red / muscular / small / twin / membrane / spiked / sharp / fire。
- アクア：青い水蛇、一角、翼なし、長い尻尾。候補は blue / serpentine / small / single / none / long / round / water。

coreに渡す組み合わせはデザイン確定後に確認します。能力値はここでは設定しません。

## 生成プロンプト（組み込み画像生成ツール）

共通：MonsterFusion retro RPG starter monster sprite. One standalone monster. 64x64 logical canvas, transparent background, centered front three-quarter idle pose facing slightly left, 4px padding, crisp pixel art, dark navy outlines, limited solid colors, no text, no floor, no exterior shadow. If generated larger, use an integer enlargement of the logical grid.

- Forest: friendly round green moss slime, tiny sprout, round amber eyes, stubby feet, short tail, no wings. Clear round silhouette.
- Fire: small red-orange stocky dragon cub, muscular body, twin horns, membrane wings, spiked tail, sharp friendly golden eyes, cream belly. Clear angular silhouette.
- Water: small blue serpentine aquatic creature, coiled lower body, single smooth horn, no wings, long curling tail, round bright eyes, pale aqua belly. Clear curled silhouette.
