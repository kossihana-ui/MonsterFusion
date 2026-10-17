# core と UI の同期について

UI側（`MonsterFusion-UI`、ブランチ `codex-ui`）は既にcoreへ接続済みです。この資料は、その**接続方法に残っている問題**と、その解消案をまとめたものです。

## 1. 現状

接続は完了しています。`src/mocks/game.ts` が core の `fuse` / `stepTurn` / `createDuel` / `createStarterMonsters` などを実際に呼んでおり、UI側の型チェックも通っています。

```
MonsterFusion-UI/
  src/core/            ← MonsterFusion-Core/src/core/ のコピー（git管理下）
  src/shared/types.ts  ← MonsterFusion-Core/src/shared/types.ts のコピー
  src/shared/ui.ts     ← UI固有の表示用モデル（GameAdapter など）。coreとは無関係
  src/mocks/game.ts    ← GameAdapter の実装。core を呼び、UI用の形に詰め替える
```

`src/shared/ui.ts` に UI 表示用の `Monster` があり、`mocks/game.ts` が core の `Monster` から変換しています。**core のオブジェクトは変更されず、変換だけが行われています。**これは正しい作りです。

確認時点では、13ファイルすべてが完全に一致していました（差分は改行コードのみ）。

## 2. 問題

**coreのソースが2箇所に存在します。**

どちらかを直すと、もう一方は古いままになります。気づく手段がありません。型チェックも通りますし、テストも通ります。UIは「少し古いルールで動くゲーム」になり、その状態で何日も進む可能性があります。

実際に起こりうる例:

- core側で能力値の上限を直す → UIでは直っていないので、表示される数値が違う
- core側で `schemaVersion` を上げる → UIが古いマイグレーションしか持たず、セーブが壊れる
- UI側で動かすためにコピーへ応急処置を入れる → core側に戻されず、次のコピーで消える

3つ目が一番危険です。**修正が消えます。**

## 3. 解消案

### 案A：UIからcoreを直接参照する（推奨）

コピーをやめ、UI側のビルド設定でcoreリポジトリを指します。

`MonsterFusion-UI/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const CORE = resolve(__dirname, '../MonsterFusion-Core/src');

export default defineConfig({
  resolve: { alias: { '@core': CORE } },
  server: { fs: { allow: [__dirname, CORE] } },  // ルート外を読むのに必要
});
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": { "@core/*": ["../MonsterFusion-Core/src/*"] }
  }
}
```

これで `import { fuse } from '@core/core/index.ts'` と書けます。

- **利点**: 情報源が1つになる。core側の修正が即座にUIへ反映される。ビルド手順の追加なし
- **欠点**: 2つのリポジトリが隣り合って配置されている前提になる。UI単体をクローンしただけでは動かない

### 案B：npm の file: 依存にする

`MonsterFusion-UI/package.json` に `"monsterfusion-core": "file:../MonsterFusion-Core"` を追加します。

- **利点**: 依存関係として明示される。将来パッケージとして配布しやすい
- **欠点**: core側に `exports` とビルド設定が要る。`npm install` の再実行が必要な場面がある

### 案C：コピーのまま、ずれを検出する

core側に同期チェックを用意しました。

```bash
npm run check:ui-sync
```

UIリポジトリが `../MonsterFusion-UI` にない場合はパスを渡します。

```bash
node scripts/check-ui-sync.mjs C:/path/to/MonsterFusion-UI
```

一致していれば終了コード0、ずれていれば1を返し、ずれたファイル名を表示します。改行コードの違いは無視します。

- **利点**: 今の構成を一切変えない。UI単体で完結したままになる
- **欠点**: **ずれを防ぎません。気づけるだけです。** 同期は手作業のままで、やり忘れます

## 4. 推奨

**案A**を推奨します。コピーが存在する限り、ずれは「起きるかもしれない問題」ではなく「いつ起きるかの問題」だからです。

ただしこれはUI側のビルド設定の変更なので、Codexの担当範囲です。判断もCodex側にあります。

移行するまでの当面の運用として、案Cのチェックスクリプトは core 側に置いてあります。**core を変更してコミットしたら `npm run check:ui-sync` を実行し、ずれていたらUI側へ反映を依頼してください。**

## 5. 同期が必要なファイル

```
src/shared/types.ts
src/core/analyzer.ts
src/core/battle.ts
src/core/config.ts
src/core/fusion.ts
src/core/genetics.ts
src/core/graft.ts
src/core/index.ts
src/core/random.ts
src/core/starters.ts
src/core/stats.ts
src/core/storage.ts
src/core/util.ts
```

`tests/` はUI側に不要です。coreに新しいファイルを追加したときは、このリストと `scripts/check-ui-sync.mjs` の `MIRRORED` を更新してください。

## 6. 注意：UI側で見つけた不具合は core で直してください

UIのコピーを直しても、次の同期で消えます。core側（このリポジトリ）を直し、テストを追加し、コミットしてからUIへ反映する順序でお願いします。
