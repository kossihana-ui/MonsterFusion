# 部位技のみ・3枠への移行依頼

> 2026-10-28更新：core側の対応を確認し、UI接続も完了。以下は当初の依頼記録です。UI独自の3枠定数・初期選択・空枠補完は撤去し、coreの公開APIを使用します。敵の共通技廃止・空セット保持もテスト済み。

ユーザー了承：共通セット技（strike、sig-*）をなくし、部位由来の技を最大3つセットする。通常攻撃と守るは枠外で残す。

UI対応済み：一覧、3枠、初期選択、おすすめ、保存時の入力検証、戦闘コマンド。coreのMonster・BattleStateは書き換えていない。既存アリーナの途中では技セットを変更せず、表示上の共通技を隠す。

## core側で必要な変更

- `getLearnableMoves(monster): LearnableMove[]`：共通技を返さない。
- `MAX_MOVE_SLOTS = 3`。
- `defaultLoadout(monster): MoveLoadout`：部位技のみ、最大3。
- `validateMoveLoadout(monster, skillIds): LoadoutCheck`：0〜3枠を許可。通常攻撃と守るがあるので空でも戦える。
- `reconcileLoadout(monster, skillIds): MoveLoadout` と `skillsForLoadout(monster, loadout): Skill[]`：空指定を共通技へ補完しない。
- アリーナ敵・ボスの初期技も上のルールを使用。

現時点の制約：coreは空の技セットを共通技で補完する。UIは共通技を表示しないため、自分は通常攻撃・守るのみ使用できるが、敵は依然として共通技を使う場合がある。完全廃止はcore変更後となる。

UI暫定の3枠定数と選択処理は `src/mocks/game.ts`。core完了後は公開APIへ集約できる。
