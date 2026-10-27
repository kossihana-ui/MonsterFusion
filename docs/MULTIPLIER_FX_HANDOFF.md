# 倍率演出の接続（2026-10-27）

core の `BattleLogEntry.effects` を表示専用に再生します。
通常攻撃→ヒット→120ms→倍率＋オリジナル音→500ms後にダメージ／HP→フェードアウト。
属性だけの倍率と1以下は対象外。多段は最後のイベントだけ、会心は同じ表示に統合します。
ダメージは `amount` をそのまま使用。反射先・回復先もイベントのtargetIdで解決します。
戦闘画面のクリックまたは「演出をスキップ」で残りの再生を省略できます。
OSの動きを減らす設定では演出を省略します。戦闘音オフにも対応。
音の試聴室に1.5／2／3倍の表示・音の見本があります。

## 確認

- `node scripts/check-multiplier-fx.mjs`: 通常・属性・減少・小数・重複・会心・多段・回復・不変性・音声・実際のラムチャージを確認。
- `node scripts/check-battle-ui.mjs`: 成功。新しい拘束に左右されないよう技装備テストの敵を守るに固定。
- ブラウザで倍率表示を確認。
- `npx tsc --noEmit --noUnusedLocals false --noUnusedParameters false`: 成功（設定ファイルは変更していません）。
- `npx vite build`: 成功。
- 通常の `npm run typecheck` / `npm run build`: core の `src/core/battle.ts` の未使用importにより失敗。
  - 26行: `StatusEffect`, `StatusKind`
  - 42行: `STATUS_LABELS`

core側で上記importを整理後、通常チェックを再実行してください。UIからcoreのファイルは変更していません。
