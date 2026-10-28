# UI接続完了（2026-10-28）

参照資料：coreの `docs/FEATURE_ONLY_MOVES.md` と `docs/MOVE_EFFECTS.md`。

- UI暫定の定数・初期選択・入力検証をcore公開APIへ集約。
- `MAX_MOVE_SLOTS` / `defaultLoadout` / `reconcileLoadout` / `validateMoveLoadout` をindex.ts経由で使用。
- 意図的な空セットを保持し、消滅した旧技の修復はcoreに任せる。
- 大技1つを優先する既定セット、敵・ボスの部位技のみの構成を接続。
- `noEffect` は戦闘中の文字と戦闘ログで表示。残りターンをUIで変更しない。
- 暗闇の説明は `DEFAULT_BATTLE_CONFIG.blindEvasion` を参照（現在50%）。同じ弱体効果の再付与・延長不可も説明。
- 通常攻撃に固定していた「物理」の表示を外し、「攻撃力・魔力の高い方を使う」と表示。
- 音声ファイルと音の再生処理は変更なし。

## 確認

`check-feature-loadouts`、`check-battle-ui`、`check-move-help`、`check-arena-ui` は成功。
実際のcoreの連続マジックアイによるnoEffect、空セットでのアリーナ入場、旧技の修復、ボスまでの進行を検証。

通常のtypecheck/buildはcoreの `src/core/battle.ts` の未使用importで停止：
- 26行：StatusEffect / StatusKind
- 43行：STATUS_LABELS

UIのtsconfigはnoUnusedLocals=trueです。未使用チェックだけ無効にした型検査とVite生成は成功。設定ファイルを緩めたり、coreファイルを編集したりはしていません。
