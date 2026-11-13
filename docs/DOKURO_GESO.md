# ドクロゲソ：捕獲アイテム（core実装完了）

[DOKURO_GESO_REQUEST.md](../../MonsterFusion-UI/docs/DOKURO_GESO_REQUEST.md) への対応です。**テスト345件すべて成功、型チェックエラーなし。**

## 1. ユーザーが決めた仕様

| 仕様 | 実装 |
|---|---|
| 使うと相手モンスターを仲間にできる | `captureArenaMonster` |
| ボスにも使用可能 | ✅ ボス専用の制限はありません |
| ボスが10％の確率でドロップ | `DEFAULT_ARENA_CONFIG.bossCaptureItemChance = 0.1` |
| アイテム名はドクロゲソ | `DOKURO_GESO` |

**成功率はありません。** 「使うと仲間になる」というご指定どおり、HP条件も抽選もなく確定で捕まえます。コストはアイテムそのもので、そのアイテムはボスが10回に1回しか落としません。

## 2. 公開API

```ts
// 所持しているアイテム
getConsumables(session)
// => [{ id: 'dokuro-geso', name: 'ドクロゲソ', description: '…', count: 1 }]

// 使えるか、誰に使うのか
previewCapture(session, run, itemId?)
// => { ok, message, target: Monster | null, held: number, refusal }

// 使う
captureArenaMonster(session, run, context, requestId, itemId?)
// => { ok, message, session, run, captured, spent, duplicate, refusal }

// 報酬の受け取り（パーツとアイテムを両方しまう）
claimArenaRewardInSession(session, run, context)
// => { session, run, result }
```

`message` は日本語で、そのまま表示できます。`refusal` は `'gameOver' | 'noItem' | 'battleOver' | 'unknownItem' | 'duplicate'` などです。

アイテムはパーツと**別の持ち物**です（ご指定どおり）。

```ts
session.inventory   // GenePart（融合・ソウルメイクの素材）
session.items       // Consumable（使うもの）
```

`itemCount(session.items, 'dokuro-geso')`、`addItem`、`removeItem`、`listItems` があります。

## 3. 未確定だった点の判断

ご提案をほぼそのまま採りました。変えた点だけ理由を書きます。

| 論点 | 判断 |
|---|---|
| 捕獲で戦闘を終える | **その挑戦ごと終了**します（`phase: 'cleared'`） |
| 捕獲相手から撃破報酬も得るか | **得ません。** 勝ち星も付きません |
| ボス捕獲時も10％抽選するか | **しません。** 撃破時のみです |
| 通常敵のドロップ | なし。ボスのみ |
| 確率は設定値か | `bossCaptureItemChance`。1行で変えられます |

**「勝ち星も報酬もなし」は意図的です。** 捕獲で勝ち抜きが進むと、「無料の勝利＋パーツ＋モンスター」が同時に手に入り、ボス戦はドクロゲソを持っているかどうかだけの話になります。**倒す代わりに連れて帰った**、という扱いにしています。

ご指定と違っていれば、`captureArenaMonster` の終了処理1か所の変更で済みます。

## 4. 仲間になる個体

**画面で戦っていた個体そのものです。** 遺伝子・見た目・能力値・tierは1つも変わりません。ボスを捕まえればボス級の個体（tier 2）がそのまま手に入ります。

変わるのは「アリーナの枠」から「自分の個体」になる部分だけです。

- 新しいID（contextから）
- 作成日時（contextから）
- `parentAId` / `parentBId` は `null`、`generation: 0`、`fusionHistory: []`（産まれたのではなく捕まえたので）

**元の `run.encounter.enemy` は書き換えません。** テストで固定しています。

## 5. 断る条件（何も消費しません）

- ゲームオーバー後
- ドクロゲソを持っていない
- 戦闘が決着済み、または `phase` が `'battle'` でない（古いrunからの要求）
- ドクロゲソ以外のIDを渡した
- 同じ `requestId` の再送（`duplicate: true`）

成功時だけアイテムが1個減ります。

## 6. ドロップ

ボス撃破の報酬受け取り時に1回だけ抽選します。

```
5000回のボス撃破での実測: 9.92%（設定値 10%）
```

- 乱数は**runの固有ストリーム**です（`run.id` から決まる）。同じrunなら何度計算しても同じ結果で、再送で増えません
- パーツのドロップとは**別のストリーム**にしてあるので、この追加で既存のパーツドロップは1件も変わっていません
- 通常戦では落ちません（全5戦×40runで0件を確認）

`claimArenaReward` の戻り値に `items: readonly Consumable[]` が増えました。**既存フィールドはそのままです。** `message` にはアイテム名も含まれます。

パーツとアイテムを両方しまうのは `claimArenaRewardInSession` です。`claimArenaReward` 自体はパーツの持ち物しか知らないので、落ちたアイテムを**報告するだけ**で保存はしません。

## 7. 保存

**マイグレーション不要です。`schemaVersion` は4のままです。**

`MonsterSaveFile.items` が増えました。無い旧セーブは空として読みます。知らないIDのアイテムは落として読み込みます（セーブ全体を失うよりましなので）。

`completedRequests` も従来どおり保存するので、保存と再読込をまたいだ再送でも二重捕獲しません。

## 8. 検証済み（20件）

通常敵の捕獲、ボスの捕獲（tier・能力値・見た目の維持）、元の敵オブジェクトが不変であること、捕獲した個体が自分のIDと誕生日を持ち親を持たないこと、捕獲で挑戦が終わり勝ち星が増えないこと、1個だけ消費すること、二重送信、未所持、決着後、古いrun、全滅後、別アイテムID、出場中の解除、10％の抽選（400回）、通常敵が落とさないこと（200回）、同じrunの再現性、パーツとアイテムが別々にしまわれること、二重受け取り、保存の往復、items の無い旧セーブ、知らないアイテムID。
