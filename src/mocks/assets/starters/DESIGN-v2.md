# スターター第2案

各本素材は64×64の透過PNG。旧案は保持しています。画像生成ツールによる編集後、最近傍サンプリングとアルファ二値化で規格化。starters-v2-preview-4x.png は4倍拡大の確認用です。core・既存UIには接続していません。

- moss-v2-64.png：森。大きな桃色の花を頭に咲かせ、尻尾を葉と巻きひげのあるツタに変更。
- ignis-v2-64.png：炎。糸目、翼なし、羊のような大きな巻き角。赤い小竜の胴体を継承。
- aqua-v2-64.png：水。水蛇から深海魚へ変更。大きく突き出た下顎、牙、青い発光点を特徴に。

## 編集プロンプト

共通指定：Edit the original MonsterFusion starter. ONE transparent standalone sprite, 64x64 logical pixel grid, full creature inside 56x56, centered, front three-quarter view facing slightly left, crisp navy outlines, limited solid color clusters, no antialiasing, no text, no floor, no exterior shadow. Prioritize distinguishing features over fine texture.

- Forest: replace sprout with one large open five-petal warm pink flower and golden center; long curling green vine tail with leaves and tendril; retain round moss body and amber eyes.
- Fire: remove both wings completely; closed happy slit eyes without visible eyeballs; thick sheep ram spiral horns around either side of head; retain red-orange sturdy body, cream belly and spiked tail.
- Water: redesign as a deep-sea predatory fish, no serpent or unicorn horn; enormous protruding lower jaw, wide mouth and readable triangular teeth, stocky navy/cobalt fish body, cyan jaw and luminous eye, small spiny fins and bioluminescent dots.

花・ツタ・発達した顎は現行のphenotype語彙では直接表現できないため、coreとの対応は別途相談が必要です。本資料は外見案であり、遺伝や能力計算を追加するものではありません。
