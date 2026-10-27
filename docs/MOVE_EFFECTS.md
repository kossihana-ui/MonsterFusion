# 技の効果システムと、未確定事項の確認

[MOVES_2026_10_27_HANDOFF.md](../../MonsterFusion-UI/src/mocks/proposals/MOVES_2026_10_27_HANDOFF.md) への対応です。

**30技のうち10技を実装し、20技は仕様待ちとして保留しました。** 「勝手に数値を決めない」という指示に従い、推測した値は1つも入れていません。

## 1. 実装した基盤

### 技の挙動契約

```ts
import { getMoveBehavior } from '@core/core/index.ts';

getMoveBehavior('hydro-ram');
// { skillId: 'hydro-ram', actionMode: 'support', target: 'self',
//   attacks: false, hits: 1, piercesDefense: false, heal: 30,
//   cleanse: [], cure: [], applies: [],
//   noConsecutiveUse: true, usableWhileBound: false, specified: true }
```

**`attacks: false` の技はダメージ処理を一切通りません。** 通常ダメージ計算・最低ダメージ保証・会心判定・被弾イベント、どれも発生しません。威力0の攻撃として代用していません。

物理/魔法やpower値から攻撃の有無を推測する箇所はありません。`attacks` だけが根拠です。

### 効果イベント

`BattleLogEntry.effects` に追加しました。**既存フィールド（damage / critical / elementMultiplier / mitigated）はそのまま残しています。**

```ts
type BattleEffectEvent =
  | { type:'damage'; actorId; targetId; skillId?; amount; critical;
      elementMultiplier; mitigated; hit; hits; pierced }
  | { type:'heal';    actorId; targetId; skillId?; amount }   // 実回復量
  | { type:'cleanse'; actorId; targetId; skillId?; removed: StatusKind[] }
  | { type:'status';  actorId; targetId; skillId?; status; turns }
  | { type:'miss';    actorId; targetId; skillId?; reason: 'blind' | 'chance' }
  | { type:'skip';    actorId; reason: StatusKind }
  | { type:'blocked'; actorId; skillId?; reason: 'consecutive' | 'mp' }
```

多段ダメージは `hit` / `hits` で1発ずつ返ります。UIは順番に再生してください。**回復値や解除後の状態をUI側で計算しないでください。** coreが返した新しい state を採用してください。

### 状態異常

`Combatant.statuses` に乗ります。

| 種別 | 内容 | 区分 |
|---|---|---|
| `bind` | 行動不能 | デバフ |
| `blind` | 物理攻撃が75%外れる | デバフ |
| `poison` | 毎ターン終了時に5〜10ダメージ | デバフ |
| `seed` | 種 | デバフ |
| `attackUp` | 攻撃力2倍 | バフ |
| `recoil` | 使用後の硬直 | デバフ |

日本語ラベルは `STATUS_LABELS`、バフ/デバフの別は `STATUS_POLARITY` です。「バフだけ解除」はこの区分で動きます。

同じ状態の重ねがけは**長いほうの残りターン数が残ります**（加算しません）。

## 2. 実装した技（10件）

| 技 | 内容 |
|---|---|
| `hydro-ram`（ウォーターヒール） | **攻撃しない。** 自分を30回復、連続使用不可。実回復量をイベントで返す |
| `crystal-ray` | **攻撃しない。** 双方のバフ・デバフを解除。MP2 |
| `tusk-rush` | 防御貫通＋相手のバフ解除。**攻撃する** |
| `coil-crush` | 相手のバインドを解除（倍率判定→解除の順） |
| `impact-horn` | 防御貫通 |
| `crystal-shard` | 防御貫通 |
| `mane-guard` | 防御貫通 |
| `double-gore` | 2回攻撃 |
| `final-tail` | 使用後1ターン硬直 |
| `fang-bite` | （守り判定の基盤のみ。倍率1.2は未適用） |

**防御貫通は、防御力だけでなく「守る」の軽減も無視します。** どちらか片方だけ無視する仕様であれば教えてください。

## 3. 未確定（20件）

`pendingMoves()` で一覧が取れます。これらは**現在の通常攻撃のまま**動作し、`specified: false` が返ります。UIで「調整中」と表示できます。

### A. 「威力1・2・3」の意味（4技）

`twin-lash` `multi-gaze` `fin-slash` `power-slam`

固定ダメージ / 倍率 / 威力段階のどれでしょうか。

**提案**: 現在の技の威力は 基本100・属性140・特徴150・大技230 です。「威力1〜3」がこの段階を指すなら、たとえば 1=60 / 2=100 / 3=150 のような対応表を決めていただければ実装します。

### B. 「大ダメージ」の値（4技）

`crown-break` `single-thrust` `dive-attack` `giant-press`

**提案**: 大技（230）と同等、または 180 程度。どれも反動や成功率の制約付きなので、230でも成立すると思います。

### C. 継続ターン数（5技）

`death-bite`（毒・バインド） `magic-eye`（バインド・暗闇） `twin-lash`（暗闇） `pollen-burst`（毒） `wing-cutter`（種）

**提案**: 毒3ターン / 暗闇2ターン / バインド1〜2ターン（仕様書の記述どおり） / 種1ターン。

### D. 確率の解釈（2技）

- `crown-break`: ひるみの確率が未指定
- `bind-whip`: 「バインド確率60%、2ターン継続確率20%」の20%は、**60%でバインドした中の20%**ですか、**全体の20%**ですか

**提案**: 前者（バインド成功後に20%で2ターン）。文面の並びから自然だと思います。

### E. 攻撃を伴うか（7技）

`ram-charge` `wing-cutter` `magic-eye` `pierce-gaze` `pollen-burst` `royal-order` `antenna-pulse`

強化・状態付与だけに見えますが、**仕様書に攻撃の記述がありません。** 推測しないという方針なので保留しています。

**提案**: `ram-charge`（自分を強化）と `pierce-gaze`（MP0、次ターン2回攻撃）と `antenna-pulse`（次ターン2回行動）は攻撃なし、`wing-cutter` `magic-eye` `pollen-burst` `royal-order` は攻撃ありが自然に思えますが、ご判断ください。

### F. その他（2技）

- `tail-sweep`: 反射ダメージと通常攻撃の区別。「連続で打つと成功率20%」は2回目以降が20%という意味でしょうか
- `soul-wing`: 即死20%は明記。外れたときの「ダメージ」は通常威力でよいですか
- `pierce-beak`: 守っていない相手に0.5倍。これは防御貫通と併用しない前提でよいですか

## 4. UI側へ

- **既存のAPIは変わっていません。** `stepTurn` / `advanceArenaTurn` の引数も戻り値の型も同じで、`effects` が増えただけです
- 回復・解除・状態異常の計算はUIで行わないでください。`effects` を再生し、返ってきた state を採用してください
- `getMoveBehavior(skillId).specified` が `false` の技は未実装です。「攻撃する技」として扱ってください（現在そう動きます）
- 技の編集室の `A 攻撃の扱い` は、確定後に `MOVE_BEHAVIOURS` へ反映します

## 5. 検証済み

- 回復のみの技がダメージイベントを1つも出さないこと
- 回復が最大HPで頭打ちになり、**実回復量**が返ること
- 連続使用不可が2ターン目に拒否されること
- 解除が双方に効き、何を消したかを返すこと
- 防御貫通が防御力と守るの両方を無視すること
- 2回攻撃が1発ずつイベントを返し、既存の合計フィールドとも一致すること
- バインド中は行動せず、理由がログに出ること
- 毒がターン終了時に5〜10入り、残りターンが減ること
- 入力した state が変更されないこと

243件のテストが通っています（効果関連18件）。
