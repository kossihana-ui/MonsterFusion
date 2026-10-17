# MonsterFusion UI

React / TypeScript / Viteによるフロントエンド。`core` の本実装は含みません。

## 起動・確認

```sh
npm install
npm run dev
npm run typecheck
npm run build
```

図鑑、詳細、融合、模擬バトル、透過PNG登録に対応。状態はメモリ上のみで、再読み込み時にリセットされます。画像はローカル生成の仮ドット絵です。

## ゲームロジックへの接続

共通型は `src/shared/types.ts`。`Monster`, `MonsterStats`, `MonsterGenes`, `MonsterTrait`, `FusionResult`, `BattleState`, `BattleAction`, `GameAdapter` を公開しています。

`App` に `adapter` を渡すことで `src/mocks/game.ts` のデモ処理を差し替えられます。

```tsx
<App adapter={realGameAdapter} />
```

- `fuseMonsters(a: Monster, b: Monster): Promise<FusionResult>`: 子と親2体を返す。UIが子を所持一覧に追加。現状では親は消費しない。
- `calculateBattleTurn(state: BattleState, action: BattleAction): Promise<BattleState>`: 敵の応答を含む1ターン後の状態とログを返す。
- `BattleAction`: `attack | defend | skill`。
- `Monster.parentIds` は親個体ID。`generation` は1から開始。

本実装との接続時は、所持一覧取得・登録・保存、開始時バトル状態の生成、融合の親消費や能力計算、スキル・遺伝ルールを相談して追加してください。現在の登録初期値と `createBattle` もデモ用です。API通信・永続保存・本格的なバトルや遺伝の実装は対象外です。

## 検証

TypeScriptチェック、本番ビルド、デモ処理の複数世代融合・親ID継承・防御・勝敗確定・HP範囲を確認。実ブラウザでの見た目と操作確認は、確認用ブラウザから開発サーバーへの接続がタイムアウトしたため未完了です。PC・スマートフォンでの表示、PNGファイル選択と登録操作を接続可能なブラウザで確認してください。
