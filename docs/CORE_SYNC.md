# core と UI の参照方法

> **この資料は解決済みの経緯です。** UI側は2026-10-18に直接参照へ移行しました。
> 現在の構成は以下の「現在の構成」節のみを参照してください。それ以降は、
> なぜこの構成にしたかの記録です。

## 現在の構成

UI側（`MonsterFusion-UI`、ブランチ `codex-ui`）は `@core` エイリアスで、隣に置かれた
`MonsterFusion-Core/src` を直接参照しています。**coreのソースの複製は存在しません。**

```
MonsterFusion-UI/
  vite.config.ts       resolve.alias['@core'] → ../MonsterFusion-Core/src
                       server.fs.allow にも同じパス（ルート外の配信許可に必須）
  tsconfig.json        paths: { "@core/*": ["../MonsterFusion-Core/src/*"] }
  src/shared/ui.ts     UI固有の表示用モデル（GameAdapter など）。coreとは無関係
  src/mocks/game.ts    GameAdapter の実装。core を呼び、UI用の形に詰め替える
```

import は `from '@core/core/index.ts'` の形です。

**前提**: 2つのリポジトリが隣り合って配置されている必要があります。UI単体をクローン
しただけでは動きません。

**原則**: coreの不具合はcore本体（このリポジトリ）で直してください。テストもここにあります。

## 経緯（なぜこうしたか）

当初、UI側は core のソースを `src/core/` と `src/shared/types.ts` にコピーして
git管理下に置いていました。接続自体は正しく動いており、13ファイルすべて一致して
いました。

問題はコピーであること自体でした。

- どちらかを直すともう一方は古いまま。型チェックもテストも通るため気づけない
- UIだけが古いルールで動き続ける（能力値の上限、schemaVersion など）
- UI側のコピーに応急処置を入れると、次の同期で消える

core 側には実装が続いていたため（遺伝・系統進化・遺伝子付与・バトル）、ずれるのは
時間の問題でした。そのため直接参照へ移行しました。

検討した他の案:

- **npm の file: 依存** — 依存関係として明示でき、将来パッケージ配布しやすい。
  ただし core 側に exports とビルド設定が必要
- **コピーのまま、ずれを検出する** — 構成を変えずに済むが、ずれを防がない。
  気づけるだけで、同期は手作業のまま

移行完了に伴い、暫定策として置いていた同期チェック（`npm run check:ui-sync` と
`scripts/check-ui-sync.mjs`）は削除しました。
