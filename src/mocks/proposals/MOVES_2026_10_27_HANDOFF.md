# 技変更30件と「回復・解除のみ」の補足

ユーザーが2026-10-27に提出した技変更依頼を `moves-2026-10-27.json` に記録した。30技すべての元値、変更値、効果音・演出希望を保持している。これは仕様であり、ゲームへの実装済み設定ではない。

## 確定した解釈

- 回復のみ、解除のみの技は攻撃しない。通常ダメージ計算・最低ダメージ保証・会心・攻撃対象の被弾演出を通さない。
- MP消費、行動消費、連続使用制限などは効果ごとに処理する。攻撃しないことと、ターンを消費しないことは別。
- `hydro-ram`：名前をウォーターヒールに変更。自分を30回復、連続使用不可。攻撃なし。回復量は最大HPまでに制限し、実回復量をログで返す。
- `crystal-ray`：双方のバフ・デバフ解除、MP2。攻撃なし。
- `tusk-rush`：防御貫通の攻撃＋相手のバフ解除。解除を含むという理由で攻撃を消さない。
- `coil-crush`：相手がバインド中なら攻撃が2倍、そのバインドを解除。判定と解除の順序に注意。
- `fin-slash`：自分のデバフを相手へ付与＋威力2。補助のみではない。
- 「物理／魔法」や既存のpower値から攻撃の有無を推測しない。補助技をpower=0の攻撃で代用しない。

## 要仕様決定（勝手に数値を決めない）

「威力1・2・3」が固定ダメージ、倍率、威力段階のどれを指すか。「大ダメージ」の値、ひるみ確率、毒・暗闇の継続期間、バインドの20%が条件付きか全体確率かは未指定。

強化／状態付与だけに見える `ram-charge`, `wing-cutter`, `magic-eye`, `pierce-gaze`, `pollen-burst`, `royal-order`, `antenna-pulse` についても、通常攻撃を伴うかは明示して扱う。今回の補足から確実に攻撃なしと確定した2技とは分ける。反射の `tail-sweep` は通常攻撃と反射ダメージの区別が必要。

## core担当への接続要求

現在のSkillはpower/scaling/element/costのみ、BattleLogEntryはdamage中心。回復・解除・状態異常の本実装はUIでは行わない。既存の `stepTurn` / `advanceArenaTurn` を拡張し、公開index.ts経由で利用できるようにしてほしい。

以下は必要な公開契約の提案（未実装、名称はcore側で調整可）：

```ts
getMoveBehavior(skillId: string): MoveBehavior
// { actionMode: 'damage' | 'support' | 'reflect', target: 'self' | 'enemy' | 'both', ... }

// 既存関数の引数は維持し、戻り値のログにBattleEffectEvent[]等を追加する。
// 回復: actorId, targetId, skillId, amount（実回復量）
// 解除: actorId, targetId, skillId, removedStatuses
// ダメージ: hitごとに targetId, damage, critical 等
// その他: miss, bind, blind, poison, buff, skip, reflect の明示イベント
```

UIは確定イベントから回復表示・解除表示・多段ダメージ・演出と音を順番に再生する。回復値や解除後の状態をUIで計算せず、coreが返す新stateを採用する。

## UIの対応状況

技の編集室に `A 攻撃の扱い`（変更しない／攻撃しない／攻撃する／反射のみ）を追加した。既存のversion 1下書きはA未指定として読み込める。依頼文には補足ルールを含める。

30技のゲーム挙動・新しい音と演出は未反映。回復技という名前だけを先にバトルへ出して攻撃させる変更は行っていない。
