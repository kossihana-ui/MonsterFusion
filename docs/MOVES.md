# 体の特徴から覚える技と、技セット

[MOVE_LOADOUT_HANDOFF.md](../../MonsterFusion-UI/src/mocks/MOVE_LOADOUT_HANDOFF.md) への対応です。依頼どおりのAPIを実装しました。

## 1. API

```ts
import {
  getLearnableMoves, validateMoveLoadout, createDuelWithLoadouts,
  defaultLoadout, reconcileLoadout, MAX_MOVE_SLOTS, MOVE_TIERS,
} from '@core/core/index.ts';
```

### 覚えられる技

```ts
getLearnableMoves(monster);
```

```ts
{
  skill: { id: 'final-tail', name: 'ファイナルテール', power: 230,
           scaling: 'attack', element: 'fire', cost: 16 },
  reason: 'トゲの尻尾で覚える',
  category: 'finisher',
  source: 'tail',          // 習得元の部位。図鑑で部位とひも付けたいとき用
}
```

`skill.scaling` が `attack` なら⚔物理、`magic` なら✦魔法です。`skill.element` は属性色に使えます。

### 技セットの検証

```ts
validateMoveLoadout(monster, ['strike', 'final-tail']);
// { ok: true, loadout: { monsterId, skillIds } }
// { ok: false, message: 'Ignisはその技を覚えていません。' }
```

メッセージは日本語です。そのまま表示できます。

### バトルへの反映

```ts
createDuelWithLoadouts(a, b, loadouts, config?);
createBattleWithLoadouts(teams, loadouts, config?);   // N対N用
```

技セットが無い個体は既定セットで戦います。**不正な技は無視されます**（セットごと拒否はしません）。

## 2. 習得の判定

**発現している特徴（phenotype）だけを見ます。** 隠れ遺伝子では解禁されません。「トゲの尻尾の遺伝子を持っている」ことと「トゲの尻尾が生えている」ことは別で、後者だけが技になります。

融合後は子の特徴で自動的に再評価されます。親が覚えていた技を子が覚えているとは限りません。

技は30種類を定義しています。例:

| 部位 | 値 | 技 | 種別 |
|---|---|---|---|
| 尻尾 | spiked | ファイナルテール | 大技 |
| 尻尾 | vine | バインドウィップ | 通常 |
| 角 | spiral | ラムチャージ | 大技 |
| 角 | crown | クラウンブレイク | 大技 |
| 翼 | ethereal | ソウルウィング | 大技 |
| 口 | maw | デスバイト | 大技 |
| 頭飾り | crown | ロイヤルオーダー | 大技 |
| 大きさ | giant | ジャイアントプレス | 大技 |

全件は `MOVE_CATALOGUE` / `allMoveDefinitions()` で取得できます。**部位と値の組み合わせを1行足すだけで技が増えます。**

属性は、その技固有のものを持つ場合（バインドウィップは土）と、モンスター自身の属性を継ぐ場合（ファイナルテールは炎のモンスターなら炎）があります。後者により、同じ技でも属性色が個体ごとに変わります。

## 3. 枠と威力

```ts
MAX_MOVE_SLOTS   // 4
MOVE_TIERS       // { basic: {power:100, cost:2}, signature: {power:140, cost:6},
                 //   feature: {power:150, cost:7}, finisher: {power:230, cost:16} }
```

通常攻撃と守るは枠を消費しません。**大技も通常技と同じ枠に入ります。**

大技はMP消費だけで扱っています。命中率・溜め・クールダウンは入れていません。

## 4. 既定の技セット

```ts
defaultLoadout(monster);
```

自分の属性技と基本攻撃を先に入れ、残り枠に威力の高い特徴技を入れます。**必ず安い技（MP2）が1つ入る**ので、MP切れで何もできない状態になりません。

技セットが未設定の個体は、これで戦います。

## 5. 保存

**遺伝情報とは分けて保存します。** 技セットは「プレイヤーが決めたこと」であり、モンスターの性質ではないためです。

```ts
serializeSaveFile(monsters, { loadouts });
deserializeSaveFile(json).value.loadouts;
```

`MonsterSaveFile.loadouts` に入ります。モンスター本体のデータには一切混入しません。

**読み込み時は修復します。拒否しません。**

- 覚えられなくなった技 → その技だけ落とす
- 存在しないモンスターを指す技セット → 落とす
- 全部落ちた場合 → 既定セットに戻す

融合で体が変わった個体の技セットが原因で、コレクション全体が読めなくなる事態を避けるためです。技セットが無い旧セーブもそのまま読めます。

## 6. 注意点

**`startingMp` を 20 → 10 に下げました。** 大技（MP16）が初手から撃てると、ただの強い通常攻撃になってしまうためです。現在は2〜3ターン目から撃てます。MPバーの表示に影響します。

**技セットの枠は埋めません。** 3つ選んだら3つのままです。実装の途中で既定技を補充する作りにしていましたが、プレイヤーが選んでいない技が勝手に入るのは誤りなので外しました。空になった場合だけ既定に戻します。

**バランスへの影響**: 技が増えたぶん戦闘が少し長くなりました（中央値5〜7ターン、5〜8に収まる割合63〜95%）。スターター総当たりの勝率は30%/62%/38%です。

## 7. 未実装

依頼のとおり、命中率・溜め・クールダウン・回復・状態異常は入れていません。`declareActions()` があるので、予備動作の表示は仕様を決めればすぐ乗せられます。
