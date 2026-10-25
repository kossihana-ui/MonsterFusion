# バトル拡充：Claude Codeへの依頼

## 2026-10-26 接続更新

coreのdocs/BATTLE.mdに記載の調整を接続済み。守るの先制攻撃軽減・追加MP回復と行動順抽選の説明を更新。expectedDamageでダメージ目安を表示し、構造化ログから日本語表示（技名・相性・会心・防御軽減・MP消費/回復）を生成する。coreのmessageは解析しない。以下の依頼内容は調整前の記録として残す。

## UIで接続済み

- 通常攻撃、守る、coreのskills全件から技を個別選択。
- 双方のMP・属性・素早さ、技の消費MP・威力・参照能力・対戦相手への属性倍率を表示。
- 相性は `elementMultiplier`、表示は `labelFor`、設定は `DEFAULT_BATTLE_CONFIG` をindex.ts経由で参照。
- MP不足の判断はターン開始時の回復を含む。coreの技IDを渡し、stepTurnの返り値に更新する。
- 対戦相手も選べる。MonsterやBattleStateの直接書き換えはしていない。

## core側の調整を依頼したいこと（未実装）

ユーザーの希望は「ダメージが大きく、素早さだけで決まる戦闘から、守る・相性・技で考える戦闘へ」。

1. 防御の発動順を見直してほしい。現在stepTurnは全員のdefendingを解除し、素早さ順に行動する。遅い側が守っても先制攻撃を軽減できず、次のターン開始時には解除される。守るを選んだターンは先制攻撃にも有効になる仕様を提案。行動予約・MP回復・ポリシー呼び出し回数も含めてcoreで処理する。
2. 同格の対戦が通常5～8ターン程度続くことを仮目標に、HP/ダメージ/技威力を検討してほしい。現状は素早さが先攻と会心率の両方に効いている。スターター総当たりと複数シードで勝率・ターン数・先攻勝率を測り、世代差も検証する。UIでHPや計算結果を水増ししない。
3. 現在の属性相性表はすでに接続済み。変更する場合もcoreの表を唯一の根拠にする。
4. 技は属性技と無属性技の2つがある。防御で有効に受けられる大技や、予備動作をログに出す敵などを次段階の候補に。回復・状態異常・クールダウンは別途仕様を決め、UIだけで効果を実装しない。

## API・型

現段階で新しいAPIは不要。既存の `stepTurn(state, policies, rng, config?): BattleState`、`elementMultiplier(attacker, defender, config?): number`、`Combatant.skills: readonly Skill[]` を維持してもらえれば接続できる。

UIアダプターは `calculateBattleTurn(state, action): Promise<BattleState>`。
UIのactionは `'attack' | 'defend' | { kind: 'skill'; skillId: string }`。
守るの仕様変更後はBattle.tsxの「行動後」「先制攻撃は防げません」の説明も更新する。
今後はログにskillId、相性倍率、軽減量を構造化して返せると、日本語の戦闘演出を正確に表示しやすい。

検証: `node scripts/check-battle-ui.mjs`（技選択・MP消費・防御・不正な技・入力不変）。
