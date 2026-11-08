# セッション・ソウルメイク UI接続済み

coreの docs/SESSION_AND_SOULMAKE.md に沿って接続。

- UIの仮の所持一覧処理を廃止し、GameSession.owned/history/statusを購読。
- fuseOwnedMonstersのsession/resultを適用。拒否時はcoreの日本語を表示。
- 出場時deployMonsters、挑戦終了時解除。出場中の個体のみ融合不可。
- 勝敗確定時settleBattleLossをアリーナID＋戦番号で一度だけ適用。演出の中断でも消失を取り消さない。
- claimArenaRewardのinventoryをGameSessionへ統合し、報酬・融合・ソウルメイクが同じ在庫を参照。
- getSoulMakeRecipe/soulMakeLociで枠を作成。previewSoulMakeで不足・使用数を表示。
- soulMakeInSessionで生成し、coreの個体を改変せず表示モデルに変換。
- 同一requestId再送時には生成・消費しない。名前・配置を変えたら新しい操作として扱う。
- 未配置の体色・属性・大きさを事前に予想表示しない。誕生後のPortraitで確認。
- WATER_HEAL_MAGICは既存接続を維持（個体別getMoveHealing、heal実回復量、mpイベントを区別）。

型チェック、ビルド、check-session-ui、check-arena-ui、check-heal-uiで確認。
アリーナから獲得した実素材によるソウルメイク成功、発現保証、各1個消費、再送拒否、core保存形式の往復を検証。

保存・読込の画面や自動保存は今回追加していません。プレイ状態は引き続き再読み込みでリセットされます。
旧 SOUL_MAKE_AND_ROSTER_REQUEST.md は提案履歴として残します。この文書とcoreの実装が現状です。
