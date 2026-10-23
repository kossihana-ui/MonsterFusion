# Claude coreとの接続

隣接する `../MonsterFusion-Core/src` を `@core` エイリアスで直接参照します。UI内にcoreのコピーはありません。core側の変更は開発サーバー・型チェック・ビルドに直接反映されます。UI単独のクローンでは起動できないため、MonsterFusion-Core（claude-core）を隣に配置してください。

`game.ts` は現在、モック処理ではなくUI用の接続アダプターです。coreへのimportは `@core/core/index.ts` のみ。表示モデルは `src/shared/ui.ts` に分離しています。coreのMonsterは内部Mapに保持し、表示モデルを融合処理へ直接渡したり、core個体を書き換えたりしません。coreの不具合は本体リポジトリで修正・テストしてください。コピー同期とcheck:ui-syncは不要です。

- 起動時：`createStarterMonsters` → `findStarterSpec` のart名で第2案のPNGを関連付け。
- 融合：`canFuse` → `fuse`。
- 戦闘：`createDuel` → プレイヤーの選択と敵の `createBasicPolicy` → `stepTurn` の新しいstateを保存。
- 登録：32×32 PNGのみ受付。`createMonsterFromAnalysis` でcore個体を生成。画像解析は未接続である旨を表示。
- 乱数：セッション共通の `createSeededRandom(12345)`。

制作済みスターター素材は64×64。32×32制限はユーザーのPNGアップロードに適用します。

初期3体は元のPNGをUI側で部位分けして表示します。融合した子はphenotypeを変更せず、composeAppearance / poseAtと39パーツで表示します。createAppearanceConfigでwingPairs:trueを設定しています。アップロード画像は未解析のため入力画像を表示します。

未接続：永続保存、遺伝子付与操作、詳細な遺伝子表示。パーツ仕様と検証手順はassets/parts-detailed/README.mdを参照してください。

検証：3体の固定ID・素材対応・第0世代・core検証、融合結果、親の不変性、stepTurnの新state、バトル完了、登録個体のcore検証、本番ビルド。
