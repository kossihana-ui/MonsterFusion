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

未接続：永続保存、画像解析、融合した子のパーツ合成。登録画像と遺伝情報は一致する保証がなく、融合した子は親画像の仮表示です。

## 移行検証

型チェック・本番ビルド・開発サーバー起動に成功。Vite経由で外部coreの解決、3体生成、融合、戦闘ターン更新、登録、4画面モジュールの読み込みを確認しました。移行前後で生成された本番ファイル名のハッシュも一致しています。確認用ブラウザは接続タイムアウトとなり、実画面のクリック操作確認は未完了です。
