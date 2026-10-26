# Claude Code依頼：アリーナ連戦・敵パーツ報酬・素材融合

## ユーザー要求

- 出場キャラを選んで扉を開け、ランダムな遺伝子の敵と戦う。
- 通常戦を5勝したらボス（第6戦）。大型で強い遺伝子を複数持ち、ドラゴンなど統一感のある姿にする。
- 倒した敵からランダムでパーツを獲得し、融合に混ぜて狙った遺伝子を組み込める。

UI側は出場選択と開門演出を先行実装。現状は模擬戦と明記。以下のAPIは提案であり未実装。UIはcore本体を書き換えず公開index.tsから接続する。

## 仕様案（数値・保存形式はcoreで決定）

1. 通常5勝→ボス1戦。敗北・引き分けで連勝終了。各戦の間に全回復する案を初期案とし、説明用にルールを公開する。敵更新・次戦は勝利確定後の明示操作で行う。
2. 敵はseed付きRandomで生成。同じ対戦を表示し直すだけで再抽選しない。敵のtier/能力は出場者と進行度に応じてcoreが調整し、UIでstatsを加工しない。
3. ボスは外見テンプレートを使用。例：大型・筋肉質・角・皮膜翼・長い尻尾でドラゴンの輪郭を保つ。強い遺伝子とは複数の高い能力傾向等を意味し、優性だけを強さとしない。genes→phenotype→statsの整合性はcoreが生成時に保証。テンプレートの見た目はUIで調整・必要に応じて追加素材を制作する。
4. 勝った敵が実際に持っていた特徴からパーツを抽選。初期は角/翼/尻尾/口/頭飾りなど見た目のパーツを優先。率・数・ボス報酬は設定に集約。「落ちなかった」場合も結果として返す。勝利結果の二重取得を禁止し、再戦/画面往復で複製できないようにする。
5. パーツは個体と別の所持品。初期は融合1回につき1個の任意投入。親2体と素材を選び、子に対象遺伝子がどう入るかを事前に表示する。
6. 狙った見た目を作るため、投入部位は子に発現するモードを初期案として提案。現在のgraftGeneはhiddenだけなので代用しない。隠し遺伝子への確定導入のみとするなら、その旨を明記してユーザーと仕様を合わせる。UIが「必ず生える」と誤表示しないよう結果保証を返す。
7. 融合成功時だけ素材を1個消費。失敗・キャンセルでは消費しない。消費と子の生成を一括処理し、親は不変。二重クリックや同一requestIdの再送で二重消費/二重生成しない。融合後の習得技と技セットは既存APIで再評価。
8. ドロップ在庫・アリーナ進行・報酬受取記録はセーブに含める。永続保存UI未実装のため、読み込み/書き出しAPIも既存形式に統合してほしい。

## 必要な公開型・関数（名称は調整可）

```ts
// 型はcoreで定義しindex.tsから公開。GenePartのlocus/valueは対応する型で結ぶ。
type GenePart = { id: string; name: string; locus: CategoricalLocus; /* 対応するvalue, 出所, 個数 */ };
type ArenaRun = { id: string; wins: number; phase: 'battle' | 'reward' | 'cleared' | 'failed'; /* 現在の敵と戦闘 */ };
startArena(player: Monster, loadout: MoveLoadout, context: MonsterContext): ArenaRun;
advanceArenaTurn(run: ArenaRun, action: BattleAction, context: MonsterContext): ArenaRun;
claimArenaReward(run: ArenaRun, inventory: PartInventory, context: MonsterContext): ArenaRewardResult;
// ArenaRewardResult: 更新run/inventory、獲得パーツ、無ドロップ、次戦可否。再受取は増殖させない。
nextArenaEncounter(run: ArenaRun, context: MonsterContext): ArenaRun;
previewPartFusion(a: Monster, b: Monster, part: GenePart): PartFusionPreview;
// PartFusionPreview: 可否、保証する遺伝子/発現、消費数、説明。
fuseWithPart(a: Monster, b: Monster, partId: string | null, inventory: PartInventory, context: MonsterContext, requestId: string): PartFusionResult;
// PartFusionResult: child、更新inventory、消費part、既存の融合サマリー生成に必要な情報。
```

## UI接続予定

出場準備→開門→「第1戦…第5戦」→ボス警告→ボス→勝利/報酬→次戦/帰還。
報酬カードにパーツ名・アイコン・由来・獲得数を表示。融合画面に素材枠と所持パーツ一覧、投入後の保証を短く表示。表示上の保証をcoreから取得し、抽選/戦闘進行/在庫消費をUIに複製しない。

## core側で検証を依頼

5勝の次に一度だけボス、敗北/引き分けの進行、同seed再現、二重報酬防止、敵の実在パーツだけ落ちること、素材消費の原子性、在庫不足、親不変、遺伝子と外見と能力と技の整合性、保存と復元。
