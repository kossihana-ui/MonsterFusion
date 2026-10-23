# 詳細パーツと斜め向き素材

`manifest.json` の40枚が現在の描画素材です。体6・目6・装飾6・角5・顎4・尻尾5・翼8。
上向き角・浅い巻き角・小さい顎の納品仕様は [COMPACT_HANDOFF.md](COMPACT_HANDOFF.md) を参照。
初期3体のPNGは別途そのまま保持し、表示時に部位分けします。

## 制作と再生成

組み込みimagegenで制作。元の3体を参照した `source-atlas.png` と、装飾を除いた
体6種の `source-bodies.png`、ART_PROMPTS.mdに沿った修正版
`source-perspective-v2.png` を保存しています。CLI/APIへの切り替えはしていません。
元の `parts/` と単体翼PNGは削除せず残していますが、現在のmanifestには単体翼を含めません。

通常の開発・ビルドは生成済みPNGのみで動作します。
素材の再取り込み時のみ、ローカルにsharpを用意するか、`SPRITE_SHARP_MODULE` に
インストール済みsharpのエントリファイルの絶対パスを指定し、`npm.cmd run sprites:build`。
最近傍縮小・参照色への変換・アルファの二値化を行います。ゲームにはsharpを同梱しません。

## 接続情報

- `createAppearanceConfig({wingPairs:true})` を公開index経由で使用。
- 翼は32×32、原点(4,27)。その点に不透明な画素があることを検証。
- 遠翼は小さく暗い別素材。coreが体の背後へ配置し、近翼を手前へ配置。
- 両翼の素材倍率は0.65。大きい体型で翼先端が画面外に出るのを抑えます。
- 角は32×32。巻き角も実幅30pxなので旧42px用の0.75補正をUI設定で1に変更。
- 顎は28×24、原点(14,2)。上部中央から左下に突出する絵。
- 花びらは固定のピンクの材質色。体色・目・属性色はcoreの値を使用。
- core本体、遺伝情報、ゲーム処理は変更していません。

## 検証と限界

`npm.cmd run sprites:check` で39キー、17色の範囲、透明度0/255、原点、翼の前後順、
6体型×4翼×5サイズ、200世代の融合と親の不変性を確認。
`SPRITE_CANVAS_MODULE` に@napi-rs/canvasのエントリを指定すると、
6体型×4翼の比較画像などを `artifacts/sprites/` に出力します。
全遺伝パターンの目視確認を保証するものではありません。極端なサイズ・装飾の重なりは
引き続き実例をもとにcoreの配置設定と素材を調整します。

## 最終素材生成プロンプト（組み込みimagegen）

Production pixel sprite atlas for MonsterFusion: EXACT 4 columns x 4 rows of separate parts, 16 sprites on transparent background. Equal square cells separated by generous empty transparent margins, no labels or text or grid. Logical sprites 32x32 pixels enlarged uniformly; hard pixels no antialiasing. Every part fits a creature facing slightly LEFT and toward viewer in three-quarter view, NEVER flat side view or frontal symmetry. Single upper LEFT light. Thin one-pixel dark silhouette outline. Only material colours: outline #1b2030; membrane shade #5a3a6a base #a06ac0 light #d0a8e8; keratin shade #3a5a4a base #6aa88a light #a8e0c0; body shade #4a4a6a base #8a8ab0 light #c8c8e0; accent #ff00ff. 3 to 5 colours per sprite. ROW 1: four FAR wings in order feathered, bat membrane, crystal, ethereal. These far wings are small narrow foreshortened portions peeking above the far shoulder, NOT full wings. Darker shade overall. Their root is at lower LEFT, the wing rising up/right away from viewer. ROW 2: corresponding NEAR wings, feathered, bat membrane, crystal, ethereal. Broader curved and foreshortened with visible lit upper planes, root lower LEFT, opening upward/right. Purple membrane surface, green bone struts. Both rows root visually at cell-relative (4,27) in 32x32. ROW 3: four horn ornaments: single swept back brow horn; two swept back twin horns; perspective ring of short crown horns; pair of curled RAM horns. All green keratin, no purple. Horn PAIRS strongly ASYMMETRIC: left horn smaller farther away, right horn larger nearer. Horn root midpoint lower centre; ram horn pair roots upper middle with curving horns down sides, open gap for face. Total width about30 pixels not giant. ROW 4: four mouth/jaw attachments pointing/protruding toward LOWER LEFT: closed lip with two upper fangs; lower jaw with curved up tusks; hooked beak; open maw with teeth and dark mouth interior. Upper centre attachment meets muzzle. Clearly three-quarter view, smaller far teeth and larger near teeth. Green keratin teeth, purple body-shade mouth interior, dark lips. No body, no heads, no eyes, no extra pieces. Transparent outside all sprites including internal gaps. Detailed but cohesive classic console RPG pixel clusters, not glossy vector icons. Make all 16 parts exactly match the shared view, illumination and outline thickness.
