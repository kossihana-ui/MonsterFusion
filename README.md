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

スターターと融合した子は35パーツを表現型に沿って合成し、待機・攻撃・被弾アニメーションに対応します。素材の再生成は `npm.cmd run sprites:build`、検証は `npm.cmd run sprites:check`。仕様はsrc/mocks/assets/parts/README.mdを参照してください。

未接続：永続保存、画像解析。登録画像と遺伝情報は一致する保証がないため、アップロード個体は入力画像をそのまま表示します。

## 移行検証

型チェック・本番ビルド・開発サーバー起動、素材全画素と200世代の融合を検証。実ブラウザで図鑑のCanvas、融合した子の合成表示、バトルの操作ロックとHP・ターン更新を確認しました。
