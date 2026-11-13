# ドクロゲソ：捕獲アイテムのcore実装依頼

## ユーザーが決めた仕様
- アイテム名：ドクロゲソ（添付ファイル名はゲソドクロ.png）。
- 使うと相手モンスターを仲間にできる。ボスにも使用可能。
- ボスが10％の確率でドロップ。
- 画像はUIのpublic/items/dokuro-geso.png。元画像を加工せずコピー済み。

## UIの状態
アイテムボックスに画像と説明を表示。未実装であることを表示し、使用ボタンは無効。
捕獲成功率・ドロップ抽選・個体複製をUIでは実装しない。
ゲームオーバーの画面だけ、戦闘リプレイとHP0の表示が完了してから黒くフェードさせる。
セッションの敗北確定はこれまでどおり即座にcoreで処理する。

## 必要な公開API（提案）
```ts
getConsumables(session: GameSession): readonly { id: string; name: string; count: number }[];
previewCapture(session: GameSession, run: ArenaRun, itemId: 'dokuro-geso'):
  { ok: boolean; message: string };
captureArenaMonster(session: GameSession, run: ArenaRun, context: MonsterContext,
  requestId: string): {
    ok: boolean; message: string; session: GameSession; run: ArenaRun;
    captured: Monster | null; duplicate: boolean;
  };
```
既存claimArenaRewardにアイテムドロップ結果を追加するか、session統合APIを公開してください。
GenePartと消費アイテムは別管理。所持数、履歴、保存・読込もcoreで管理してください。
importは @core/core/index.ts のみ。

## 実装方針の提案（未確定部分）
- ユーザーの「使うと仲間になる」に合わせ、所持していればHP制限なし・確定捕獲。
- 使用可能なのは未決着の自分の戦闘。成功時に1個消費、失敗時無消費。
- 捕獲で戦闘を終える。勝ち抜きの扱いはcoreで一元管理する。
- 捕獲相手からさらに撃破報酬を得るかはユーザー指定なし。まずは二重報酬なしを提案。
- ボス撃破時に1回だけ10％を抽選。通常敵は落とさない。確率は設定値にする。
- ボスを捕獲した場合も10％抽選するかはユーザー指定なし。撃破時のみを提案。
- 捕獲個体のID・親情報・tier・genes/phenotype/stats整合はcoreが決定。
- requestIdの再送でアイテム消費・仲間追加・報酬抽選が重複しない。
- ゲームオーバー後、未所持、使用済み、戦闘終了後、古いrunからの要求は拒否。
- 乱数はcontext.rngのみ。Math.randomを混ぜない。

## 確認したいテスト
通常敵とボスの捕獲成功、1個だけ消費、二重送信、未所持・決着後・全滅後の拒否、
所持一覧とhistory更新、元敵オブジェクト不変、保存往復、固定seedの10％抽選。
