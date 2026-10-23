# MonsterFusion UI

React / TypeScript / Viteによるフロントエンド。

## 配置と起動

MonsterFusion-UI（codex-ui）とMonsterFusion-Core（claude-core）を同じ親フォルダに配置してください。UI単体では起動・ビルドできません。

```powershell
cd C:\Dev\MonsterFusion-UI
npm.cmd install
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
```

図鑑・詳細・融合・模擬バトル・32×32透過PNG登録に対応。スターター3体は64×64素材です。データはメモリ上のみで、再読み込み時にリセットされます。

## coreへの接続

vite.config.tsのエイリアスとtsconfig.jsonのpathsで、@coreを隣の../MonsterFusion-Core/srcへ解決します。server.fs.allowで外部ソースの配信も許可しています。UI内にcoreのコピーはありません。

公開API・正規のゲーム型は@core/core/index.tsからのみimportします。UI表示モデルとGameAdapterはsrc/shared/ui.ts、接続アダプターはsrc/mocks/game.tsです。coreのMonsterを変更せず表示形式へ変換する構造を維持しています。

スターターはcreateStarterMonsters、融合はcanFuseとfuse、戦闘はcreateDuelとstepTurn、登録はcreateMonsterFromAnalysisを使います。始祖は第0世代です。

コピー同期とcheck:ui-syncは不要です。coreの不具合修正・テストはMonsterFusion-Core側で行います。接続詳細はsrc/mocks/CORE_CONNECTION.mdを参照してください。


スターター3体は元の64×64画像を部位分けしてアニメーション表示します。融合した子は39枚の詳細パーツを表現型に従って合成します。翼は前後ペアです。

素材と生成手順：src/mocks/assets/parts-detailed/README.md。通常の開発・ビルドに画像生成用ライブラリは不要です。素材を再生成する場合のみsharpが必要です。npm.cmd run sprites:checkで色・透明度・接続・融合を検証できます。
