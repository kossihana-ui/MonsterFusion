# MonsterFusion：Claudeへの全作業引き継ぎ

更新日：2026-11-13
ユーザーは今後、UIを含む全作業をClaudeへ移管する意向。ここでは完了済みと作業途中を区別する。

## 1. 最初に確認する場所

この3フォルダは独立したコピーではなく、同じGitリポジトリのworktree。
- C:\Dev\MonsterFusion ：master。触らない。
- C:\Dev\MonsterFusion-UI ：codex-ui。React / TypeScript / Vite。
- C:\Dev\MonsterFusion-Core ：claude-core。ゲームロジック。

UIの安定した接続完了コミット：fd21e57。
coreの確認時点のHEAD：bdf0e3c。2026-11-13確認時、coreの未コミット変更なし。
この資料と同時に保存するUIチェックポイントには、後述の作業途中の変更も含む。

まず各フォルダでgit branch --show-current / git status / git log -5 --onelineを確認。
既存ファイルを初期化・上書きしない。git reset --hard / git cleanを使わない。
他の作業者の変更をまとめてコミットしない。UIとcoreのコミットは別々に作る。
今回の引き継ぎではmasterへのマージ、worktree統合、フォルダ移動はしていない。

## 2. 起動・更新

プレイ用URL：http://127.0.0.1:5187/
デスクトップのMonsterFusionショートカットから起動できる。
実体：scripts/open-local-app.ps1 → scripts/local-app-server.mjs → dist。
開発サーバーとは異なり、ソースを書き換えただけではプレイ用画面に反映しない。

PowerShellで：
```powershell
cd C:\Dev\MonsterFusion-UI
npm.cmd run typecheck
npm.cmd run build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/open-local-app.ps1
```
既存サーバーはbuild後のdistを読む。ブラウザ再読み込みで新しいコードに切り替わる。
重要：ゲーム進行の永続保存は未接続。ユーザーのプレイ中タブを無断で再読み込みしない。
再読み込みでモンスター、パーツ、アリーナ進行、技セットがリセットされる。
音の編集メモなど一部localStorageはあるが、ゲームのセーブとは別。

開発時：npm.cmd run dev -- --port 5186
npm.ps1が実行ポリシーで拒否されるPCなので、npm.cmdを使用する。
open-local-app.ps1はWindows PowerShell用のUTF-8 BOMを維持する。
起動に失敗した場合は5187のリスナーとコマンドラインを確認し、MonsterFusion専用サーバーだけを扱う。
詳細：docs/LOCAL_APP.md。

## 3. 接続の約束

vite.config.tsとtsconfig.jsonの@coreは ../MonsterFusion-Core/src を直接参照。
UI/coreのフォルダは隣り合わせで維持する。coreのソースをUIにコピーしない。
importは常に @core/core/index.ts。型も同じ公開窓口から。
Monsterを手作り・書き換えない。genes→phenotype→statsの整合はcoreが担う。
乱数はcoreのcontext.rng。UIでMath.randomを混ぜない。

主なUIファイル：
- src/App.tsx：画面切替、core session購読、所持一覧、ゲームオーバーの表示制御。
- src/mocks/game.ts：実coreへ接続するアダプター。名前はmocksだが現在の本接続口。
- src/mocks/session.ts：旧仮処理は廃止済み。game.tsのセッションAPIの再exportだけ。
- src/shared/ui.ts：表示モデルとGameAdapter。core型のコピーではない。
- src/pages/Battle.tsx：core計算後にログ差分を順番に再生。HP・MP・ダメージ・回復演出。
- src/pages/Fusion.tsx：親選択と融合演出。出場中の個体だけ融合を禁止。
- src/pages/SoulMake.tsx：coreレシピの部位枠、配置、プレビュー、生成、図鑑への追加。
- src/components/FeatureTags.tsx：画像つき遺伝特徴。未発現を折りたたみ。
- src/components/BattleResult.tsx / LootReveal.tsx：勝利画面の宝箱を押して報酬取得。
- src/components/sprites/：既存ドット絵と分割パーツの描画・アニメーション。
- src/components/battleSound.ts / public/audio/：技の音、勝利メロディなど。

## 4. 接続済み・動作確認済み

- 図鑑、詳細、融合、アリーナ、技セット（3枠、特徴由来）、技説明。
- 原作業の要望はモス・イグニス・アクアの絵を大切にし、パーツ別に動かすこと。
- 融合成功で親2体消費→子1体。親の記録はsession.historyに残る。
- 敗北で出場個体喪失、引き分けでは喪失なし。所持0でgameOverは終端。
- coreのfuseOwnedMonsters / settleBattleLoss / deployMonstersを使用。
- ソウルメイク：体＋目が必須、他の部位は任意。各素材を1個消費。
- getSoulMakeRecipe / soulMakeLoci / previewSoulMake / soulMakeInSessionを使用。
- 体・目はcoreの報酬に追加済み。所持パーツはsession.inventoryが唯一の参照元。
- 宝箱開封後に次戦へ。二重受け取りを防止。
- ウォーターヒール：getMoveHealingによる魔力依存の説明、実回復量＋N、HP満タン表示。
- healとmpイベントを区別。MP回復をHP回復に見せない。
- メニューは図鑑→融合→ソウルメイク→アリーナ。
- 無料の画像登録による無制限増殖は一時休止。Register.tsxは削除していない。

## 5. 最優先で続ける作業（未完了）

### A. ゲームオーバー演出の最終確認
ユーザー指定：
「手持ちのモンスターがいなくなった…」と表示。
最後の攻撃→HP0→黒いフェードアウト→GAME OVER。短い音楽も欲しい。

実装途中の内容：
- AppのonReplay/battleReplayingで、coreの即時の敗北確定と画面切替を分離。
- Battleは最後の被弾を再生し、HP0確定後1100ms待つ。
- 所持0でも進行中のBattleSessionはマウントを維持。
- GameOverScreen.tsx：全面dialog、黒フェード1.2秒、その後文字表示。
- game-over.css：通常/動きを減らす設定に対応。
- public/audio/music/game-over.wav：7秒のオリジナル電子音曲。
- scripts/build-game-over-music.mjsで再生成。SoundLabにも試聴ボタン追加。
- ゲームオーバー曲は戦闘のミュート状態を引き継ぎ、画面上でもオン/オフ可。

注意：型チェック・ビルド・セッションテストは成功したが、全滅直前から黒画面までの
実画面での最終確認は未完了。ユーザーが移管を依頼したため、ここで機能開発は止めている。
直前のブラウザテストでは別タブで2回融合して1体にし、アリーナで守るを続けた。
NoxraのHP45/90、TURN7まで確認したが、テストタブは残っているとは限らない。

確認項目：
- 最後の被弾を省略せず、緑HP→赤い残量バー消失まで見える。
- HP0前に黒画面にならない。背景に戦闘画面を保ったまま黒くなる。
- 演出スキップ、reduced-motion、毒などのダメージ、画面遷移にも耐える。
- BGMが1回鳴る、ミュート/再開/再スタートで音が残らない。
- 全滅後の操作やEscでゲームオーバーを回避できない。
- 自動再生制限で鳴らない場合の手動再生導線が必要か確認。

### B. ドクロゲソの本実装
ユーザー指定：相手を仲間にできる。ボスにも有効。ボスが10％で落とす。
UIに画像と案内を追加しただけ。捕獲・消費・10％抽選は未実装。
- public/items/dokuro-geso.png：ユーザー画像を無加工コピー。
- src/components/CaptureItemCard.tsx：アイテムボックス内の準備中表示。
- docs/DOKURO_GESO_REQUEST.md：必要API、ユーザー確定事項、未確定の提案を分けて記載。
元画像：C:\Users\ｋｏｓｓｙ\Videos\ようつべ\手書き\ゲソドクロ.png
ユーザーが呼んだアイテム名「ドクロゲソ」を使用する。
実装はcoreで行い、その公開APIをUIに接続。完成したら「準備中」を撤去する。

### C. その他の未完了・要検討
- 保存/読込画面、自動保存は未実装。coreの保存APIはある。
- 隠し遺伝子が出る頻度を下げたい要望：docs/HIDDEN_GENE_RARITY_REQUEST.md。
  これは依頼・提案。実際のcore設定値は現在のソースで再確認すること。
- 画像登録の再開方法（無制限増殖を防ぎつつユーザー画像を使う）も未確定。
- 大幅な戦闘ルール変更は、わかりやすい説明と表示を優先する。

## 6. 検証

2026-11-13、現在の作業途中の変更込みで成功：
```powershell
npm.cmd run typecheck
npm.cmd run build
node scripts/check-session-ui.mjs
node scripts/check-arena-ui.mjs
node scripts/check-heal-ui.mjs
```
ほかにcheck-battle-ui.mjs / check-feature-loadouts.mjs / check-move-help.mjsがある。
ゲームのルールが変わったら古いテストの前提も確認する。
core側は package.json の typecheck / test を利用。今回coreテストは再実行していない。

## 7. 参考資料の読み順

1. 本資料
2. UI docs/SESSION_AND_SOULMAKE_UI_CONNECTED.md
3. core docs/SESSION_AND_SOULMAKE.md
4. UI docs/DOKURO_GESO_REQUEST.md
5. core docs/WATER_HEAL_MAGIC.md（UI接続済み）
6. 必要に応じて core docs/SPRITE_COMPOSITION.md / MOVES.md / MOVE_EFFECTS.md / ARENA.md

古いCODEX_HANDOFF.mdには過去の型やテスト数が残っている。新しい個別資料と現行コードを優先。
UIのdocs/*REQUEST.mdは依頼書・提案履歴であり、すべて実装済みという意味ではない。

## 8. 作業の進め方

ユーザーは今後ClaudeにUIとcoreの両方を依頼する。従来の担当分担は移管で終了。
ただしUIとcoreの設計上の境界、公開index.ts経由の参照、不変データの扱いは維持。
既存のClaudeチャットならこのファイルの絶対パスを渡して読んでもらえばよい。
環境がUIフォルダへのアクセスを許可していない場合は、ユーザーにその作業フォルダを追加してもらう。
ブランチ統合を急ぐ必要はない。最初は2つのworktreeを維持したまま両方を担当できる。
Codex側で新規作業は進めず、同じファイルを2担当が同時に編集しない。

未追跡のlocal-server.log / local-server-error.logは起動確認時のログ。ソースではないためコミット対象外。
