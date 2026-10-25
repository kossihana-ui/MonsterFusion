# Claude Codeへの依頼：体の特徴から覚える技と、図鑑での技セット

## MOVES.md対応・接続完了

図鑑にMoveLoadoutEditorを追加。getLearnableMovesの理由・分類・属性を表示し、MAX_MOVE_SLOTS枠の選択をvalidateMoveLoadoutで検証する。技セットはモンスターと別のセッションMapで保持。createDuelWithLoadoutsで双方の技セットを適用する。未設定はdefaultLoadout、取得時はreconcileLoadoutを使用。大技はバトルでも明示する。セーブUIはまだないためリロードをまたぐ永続保存は未実装で、画面にも明記。以下は元の依頼記録。

## ユーザーの希望

計算式や乱数の理解を前提にしない。属性色・物理/魔法のアイコン・MPだけで選べるゲームにする。体の特徴が技につながり、図鑑で大技などをセットしてバトルで使いたい。例：特定の尻尾を持つと「ファイナルテール」を覚える。

## UI側で実装済み

属性色、⚔物理/✦魔法、HP/MPバー、「よく効く/ふつう/効きにくい」、図鑑の現在の技一覧。威力・計算式・乱数の説明は外した。coreの戦闘ルールは変更していない。

## core側で必要な機能（以下は提案API、まだ存在しない）

公開は全て @core/core/index.ts 経由。既存のMonsterをUIで書き換えない。

```ts
interface LearnableMove {
  skill: Skill;
  reason: string; // 「トゲの尻尾で覚える」など、日本語の短い説明
  category: 'normal' | 'finisher';
}
interface MoveLoadout {
  monsterId: string;
  skillIds: readonly string[];
}
getLearnableMoves(monster: Monster): readonly LearnableMove[];
validateMoveLoadout(monster: Monster, skillIds: readonly string[]):
  { ok: true; loadout: MoveLoadout } | { ok: false; message: string };
createDuelWithLoadouts(a: Monster, b: Monster, loadouts: readonly MoveLoadout[], config?: BattleConfig): BattleState;
```

初期案は通常攻撃・守るを固定、技を最大4枠、大技もその枠にセットする。大技はまずMP消費で扱い、命中率・溜め・クールダウンなどは増やさない。枠数や大技の威力・MPはcore側で定義して公開してほしい。

習得条件は発現している体の特徴からcoreで判定する。どの尻尾でファイナルテールを覚えるかは要決定。角・翼・顎なども同じ仕組みにできるようにする。UIで隠れ遺伝子から勝手に解禁しない。融合後は子の特徴から習得可能技を再評価し、不正な技セットを受け入れない。

技セットは遺伝情報とは分けた保存データにする。初期セット、未設定時の互換動作、セーブ/ロード検証、MP不足、敵の技セットもcoreが保証する。元のMonsterと入力stateは変更せず、乱数は既存の注入方式を使う。

## 接続後の図鑑UI

技枠 → 覚えられる技一覧（属性色・物理/魔法・MP・習得理由）→ 選択 → セット。大技には「大技」バッジを表示する。変更は次のバトル開始時に反映。戦闘中の差し替えはしない。

現時点では習得判定・技セットAPIがないため、UIには動かないセットボタンや架空の技は追加していない。core実装後に接続する。
