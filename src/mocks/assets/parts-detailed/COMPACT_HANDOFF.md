# 追加素材の納品（ASSET_REQUESTS A・B）

- 有効素材40枚。上向き角1枚を追加、巻き角1枚と顎4枚を更新。他の素材は維持。
- 上向き角: 32×32、原点(16,25)、描画下端はy26以下（要求y27以内）。
- 巻き角: 32×32、原点(16,10)、描画下端y16以下。
- 顎4種: 28×24、原点(14,2)、描画幅18px以下。
- 実測値: [compact-measurements.json](compact-measurements.json)。
- 二値透過、参照パレットのみ。生成元・生成プロンプトを保存済み。

## Claude側への引き継ぎ

UIのmanifestへ登録済み。公開index.ts経由のcore合成・アンカー回転をそのまま使用します。
coreのMonster・リグ・倍率には変更を加えていません。

顎は旧26px幅から18px幅になりました。既存の体型別0.42〜0.89倍の縮小を
そのまま適用すると細身の個体では口が小さくなります。BODY_RIGSのjaw倍率を
新素材で再調整してください。一律変更ではなく6体型の目・顎との重なりを確認してください。
巻き角も下への張り出しを減らしたので、既存補正の再評価をお願いします。
UI側の検査画像 artifacts/sprites/compact-preview.png は列がcoreのリグ順、
行がupright / spiral / fangs / tusks / beak / mawです。

耳・背部・模様の追加は未実施です。schema変更の相談対象として残しています。

## 再生成・検査

sharpを利用できる環境で npm run sprites:build。
必要ならSPRITE_SHARP_MODULEにsharpのエントリパスを指定します。
npm run sprites:checkは描画幅・下端・原点・パレット・二値透過と200世代の融合を検査します。
SPRITE_CANVAS_MODULEにCanvas実装のパスを指定すれば合成確認画像も生成します。

制作は組み込み画像生成ツールを使用。[最終プロンプト](COMPACT_PROMPT.md)。
