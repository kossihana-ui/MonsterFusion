# 所持数・ゲームオーバー・ソウルメイク（完了）

[SOUL_MAKE_AND_ROSTER_REQUEST.md](../../MonsterFusion-UI/docs/SOUL_MAKE_AND_ROSTER_REQUEST.md) への対応です。**テスト325件すべて成功、型チェックエラーなし。UIのtypecheckとbuildも確認済みです。**

UIは `@core/core/index.ts` だけを参照すれば足ります。**公開APIだけで一周（融合→ソウルメイク→保存→読込→敗北）できることをテストで固定してあります**（`tests/session.test.ts` の最後）。

## 1. ユーザーの4要求

| 要求 | 保証の場所 |
|---|---|
| 融合成功で親2体を消費し、子1体を所持 | `fuseOwnedMonsters` |
| 敗北すると出場個体を失う（引き分けは失わない） | `settleBattleLoss` |
| 所持0体でゲームオーバー、素材があっても復活しない | `status: 'gameOver'` は**終端**です |
| 所持パーツから新個体を作る「ソウルメイク」 | `soulMake` / `soulMakeInSession` |

## 2. 所持一覧（GameSession）

```ts
interface GameSession {
  owned: readonly Monster[];        // 遊べる・融合できる・失う対象
  history: readonly Monster[];      // かつて存在した全個体（系譜用、減りません）
  inventory: PartInventory;
  status: 'playing' | 'gameOver';
  deployed: readonly MonsterId[];   // 戦闘中（消費禁止）
  settledBattles: readonly string[];
  completedRequests: readonly string[];
}
```

**`owned` と `history` を分けたのはご提案どおりです。** 消費された親も、リングで失った個体も `history` に残ります。子の系譜から親の名前が消えないためです。`history` から消えることはありません。

```ts
createGameSession(owned, options?)   // optionsで履歴・素材・保存状態を復元
isGameOver(session)
ownedMonster(session, id)
isDeployed(session, id)
deployMonsters(session, ids)         // 戦闘開始時に呼んでください
```

**すべて新しいsessionを返し、渡したsessionは変更しません。**

### UIにお願いしたいこと

**戦闘・アリーナを始めるときに `deployMonsters(session, [出場個体のid])` を呼んでください。** これがないと「出場中の個体の消費禁止」をcoreが判定できません（どの個体がリングにいるかはcoreには見えないため）。終わったら `deployMonsters(session)` で空にします。

アリーナ進行中の融合禁止は、これで個体単位になります。「アリーナ中は全面禁止」より細かいので、UI側の暫定ルールを緩められます。

## 3. 融合

```ts
fuseOwnedMonsters(session, parentAId, parentBId, context, requestId, partId?)
  => { session, result, refusal }
```

**ご提案の `{ session, fusion: FusionResult }` から変えました。** `FusionResult` には成否もメッセージもないので、「戦闘中だから断った」を表現できません。`result` は既存の `fuseWithPart` と同じ `PartFusionResult` で、`result.fusion` に `FusionResult` が入っています（演出用）。

```ts
result.ok        // 成否
result.message   // 日本語、そのまま表示できます
result.child     // 子
result.spent     // 消費した素材
result.fusion    // 演出用の内訳
refusal          // 'gameOver' | 'duplicate' | 'sameMonster' | 'notOwned' | 'deployed' | 'partNotHeld' | null
```

`refusal` はsession側が断った理由です。遺伝側の拒否（スキーマ不一致など）は `refusal: null` で `result.message` に入ります。

**断るのは次の場合で、いずれも何も消費しません。**

- ゲームオーバー後
- 同じ `requestId` の再送（`result.duplicate: true`）
- 同じ個体同士
- `owned` にいない個体（消費済みの親を含む）
- `deployed` の個体
- 持っていない素材を指定

**成功したときだけ**、親2体が `owned` から消え、子が入り、素材が1個減ります。失敗時は親も素材もそのまま残ります。

## 4. 敗北

```ts
settleBattleLoss(session, battle, battleId) => { session, lost, duplicate }
```

**ご提案の戻り値 `GameSession` から変えました。** UIが「何を失ったか」を表示できないためです。`lost` に失った個体が入ります（何も失わなければ空）。

| 状況 | 結果 |
|---|---|
| 勝ち | 何も失いません |
| 引き分け | 何も失いません（`settledBattles` には記録） |
| 負け | 負けた側で戦った所持個体が `owned` から消えます |
| **進行中（`outcome.status === 'ongoing'`）** | **何もせず、記録もしません** |
| 同じ `battleId` の再送 | `duplicate: true`、何も起きません |
| ゲームオーバー後 | 何も起きません |

**進行中のときに記録しないのは意図的です。** 記録してしまうと、同じ `battleId` で決着後に呼ばれた本当の敗北が「すでに処理済み」として無視されます。テストで固定してあります。

**どちらの側が負けたかで判定します。** side 0 を決め打ちしていないので、所持個体同士を戦わせても負けた方だけが消えます。

## 5. ゲームオーバーは終端です

`status: 'gameOver'` になったあと、**このsessionは一切変化しません。**

- `fuseOwnedMonsters` → `refusal: 'gameOver'`
- `soulMakeInSession` → `refusal: 'gameOver'`、**素材を持っていても使えません**
- `settleBattleLoss` → 何も起きません

「素材があっても終了後には復活しない」という要求のためです。素材は個体より長生きするので、この制限がないと全滅しても遊び続けられてしまい、所持0になることの意味がなくなります。

## 6. ソウルメイク

```ts
getSoulMakeRecipe(config?)   // { requiredLoci: ['bodyShape','eyes'], optionalLoci: [...] }
soulMakeLoci(config?)        // 必須→任意の順の全枠。UIの並び順に使えます
previewSoulMake(selection, inventory, config?)
soulMake(selection, inventory, context, requestId)
soulMakeInSession(session, selection, context, requestId)
```

レシピは `DEFAULT_GAME_CONFIG.soulMake` です。**暫定案どおり体＋目が必須**、残り（口・頭飾り・角・翼・尻尾）は任意です。ハードコードしていないので、`createGameConfig({ soulMake: { ... } })` で差し替えられます。

体色・大きさ・属性は**枠ではありません**。体色を持ち歩く人はいませんし、色のない個体は個体ではないので、置かなかったぶんはcoreが決めます。

### previewSoulMake に phenotype は入れていません

```ts
interface SoulMakePreview {
  ok: boolean;
  message: string;                      // 日本語、そのまま表示
  missingLoci: readonly CategoricalLocus[];
  placed: readonly PlacedPart[];        // { locus, value, part }
  cost: number;                         // 消費する素材数
}
```

**ご提案の `phenotype?` は入れませんでした。** 体色・大きさ・属性は生成時に決まるので、プレビューで返すと**実際には出ない色をUIに表示させることになります。** 確実なのは「置いたパーツが必ず発現する」ことだけなので、それを `placed` で返しています。

`placed` は必須→任意のレシピ順に並んでいるので、UIで並べ替える必要はありません。

### 断る条件（一切消費しません）

- 未所持のID、存在しないID
- 同じスタックを2回指定（在庫1個に対して2個要求）
- 同じ部位に素材2つ
- レシピに枠のない部位（体色など）
- 必須枠が空（`missingLoci` に入ります）

### 成功時

```ts
interface SoulMakeResult {
  ok: boolean;
  message: string;
  monster: Monster | null;
  inventory: PartInventory;    // そのまま適用してください
  spent: readonly GenePart[];
  duplicate: boolean;
}
```

- 置いたパーツを**各1個**消費します（在庫3個の体を置いても減るのは1個）
- 置いたパーツは**必ず発現します**（優性アレルとして入ります。融合の素材と同じ仕組み）
- `generation: 0`、`parentAId/parentBId: null`、`tier: 0`、`fusionHistory: []`
- 名前は `selection.name`、省略すればcoreが付けます
- genes→phenotype→stats はcoreが整合させます。発現している特徴は必ず本人が持つアレルです（テストで全10部位を確認）
- 同じ `requestId` の再送では**生成も消費もしません**（`duplicate: true`）

生成後に「置いたパーツが本当に出ているか」を検証し、違っていれば例外を投げます。素材を払ったのに違うものが出てくるより、はっきり落ちるほうがましだからです。

## 7. 報酬に体と目を追加しました

**`dropLoci` に `bodyShape` と `eyes` を追加しました。** ご指摘のとおり、これがないとソウルメイクは**永久に開けない画面**でした。

```
変更前  horns wings tail jaw crest
変更後  bodyShape eyes horns wings tail jaw crest
```

### 測定（300人、全戦勝利、5周分まで）

```
                                    変更前        変更後
ソウルメイクが可能になるまでの勝利数   不可能       中央値 8勝
                                                  （25% 6勝、75% 12勝、最悪29勝）
到達できなかった人                   300/300      5/300
1勝あたりのドロップ数                 1.01個       1.10個
```

変更前は**300人全員が永久に到達できません**。変更後は中央値8勝です。

### 代わりに失ったもの

**既存5部位のドロップ割合が20%ずつから約14%ずつに下がりました。**

```
変更前  jaw 20%  tail 20%  horns 20%  wings 20%  crest 20%
変更後  bodyShape 17%  crest 15%  horns 15%  eyes 14%  jaw 14%  tail 13%  wings 13%
```

1勝あたりのドロップ総数は少し増えています（1.01→1.10個。ドロップ判定が部位ごとなので、部位が増えると1個出る確率が上がります）が、**特定の角を狙うと約1.3倍の時間がかかります。**

気になる場合は `DEFAULT_ARENA_CONFIG.dropChance`（現在0.35）の1行です。**いただいた数値なのでこちらでは変えていません。**

## 8. 保存

**マイグレーション不要です。`schemaVersion` は4のままです。**

```ts
serializeSaveFile([], { session })      // sessionを渡すだけ
restoreSession(loadedSaveFile)          // GameSessionに戻す
sessionSaveOf(session)                  // 保存用の所有権レコードだけ取り出す
```

保存形式は**IDの一覧**です。個体そのものは従来の `monsters` に全部入っているので、二重に持ちません。

```ts
save.monsters      // かつて存在した全個体（= session.history）
save.inventory     // = session.inventory
save.session       // { ownedIds, deployedIds, status, settledBattles, completedRequests }
```

| 読み込むもの | 結果 |
|---|---|
| `session` のない旧セーブ | 全個体が所持、`playing`（当時そうだったので） |
| 終了済みの保存 | `gameOver` のまま。失った個体の名前は残ります |
| `playing` と書いてあるが所持0 | `gameOver` として読みます（遊べない状態なので） |
| 存在しない個体を指すID | そのIDだけ落とします（コレクション全体は守ります） |

`completedRequests` も保存します。保存と再読込をまたいだ再送で二重処理しないためです。

## 9. ご提案からの変更点（まとめ）

| ご提案 | 実装 | 理由 |
|---|---|---|
| `fuseOwnedMonsters => { session, fusion }` | `{ session, result, refusal }` | `FusionResult` に成否・メッセージがなく、拒否理由を返せない |
| `settleBattleLoss => GameSession` | `{ session, lost, duplicate }` | UIが「何を失ったか」を出せない |
| `SoulMakePreview.phenotype?` | 入れず、`placed` を返す | 生成時に決まる色・大きさを先に見せると嘘になる |
| `GameSession` 4フィールド | `deployed` / `settledBattles` / `completedRequests` を追加 | 出場中の保護と二重決済防止をcoreで保証するために必要 |

名前と型はご提案をできるだけ残しています。

## 10. 変更していないもの

- `Monster` の形（ソウルメイクで作った個体も普通の個体です。キーの集合が `createRootMonster` と一致することをテストで確認）
- 遺伝・能力値の計算
- 既存の `fuseWithPart` / `claimArenaReward` の挙動
- UIファイル（1つも触っていません）
- 技・戦闘・状態異常

## 11. 検証済み（43件）

**ソウルメイク（16件）**: レシピの整合性（全枠がドロップ可能であることを含む）、必須枠、任意枠、未所持、不正ID、部位重複、同一スタック二重指定、枠のない部位、発現保証、未配置部位の決定、genes↔phenotypeの整合、消費数、失敗時の無消費、requestId再送、別requestでの別個体、普通の個体であること

**セッション（27件）**: 開始状態、空の run、親2体の消費、履歴の保持、消費済み親の拒否、自己融合の拒否、出場中の拒否、融合失敗時の無消費、素材未所持の拒否、素材の消費と発現、敗北による喪失、二重決済の防止、進行中の非記録、引き分け、勝利、最後の1体を失ってのゲームオーバー、素材での復活拒否、終了後の全操作拒否、session内ソウルメイク、保存の往復（所持・履歴・状態・requestIdすべて）、旧セーブ、矛盾した保存、素材の保存

**公開API（1件）**: index.ts だけで融合→ソウルメイク→保存→読込→敗北まで一周
