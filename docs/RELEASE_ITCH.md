# itch.io に出す

2026-11-18。**費用は0円**です。アカウント作成と、下のコピペだけです。

パッケージは作ってあります。

```
C:\Dev\MonsterFusion-UI\monsterfusion-itch.zip   （8.6MB）
```

相対パスでビルドしてあるので、itch.ioがどんなURLで配信しても壊れません。
**実際にサブディレクトリ配信を再現して、起動・モンスター3体の描画・
エラーなしを確認済み**です。

---

## 手順

### ① アカウントを作る

https://itch.io/register  — メールアドレスだけです。

### ② 新規プロジェクト

https://itch.io/game/new

| 項目 | 選ぶもの |
|---|---|
| **Title** | `MonsterFusion` |
| **Project URL** | `monsterfusion`（空いていれば） |
| **Classification** | Games |
| **Kind of project** | **HTML** ← ここが重要 |
| **Release status** | Released |
| **Pricing** | `No payments`（または `Donation` で投げ銭可） |

### ③ アップロード

- **Upload files** に `monsterfusion-itch.zip` を入れる
- アップロード後、そのファイルの **「This file will be played in the browser」** に
  チェック

### ④ 表示サイズ

| 項目 | 値 |
|---|---|
| Viewport dimensions | **1280 × 800** |
| Fullscreen button | **チェックを入れる** |
| Mobile friendly | **チェックを入れる**（Orientation は Default） |

1280×800は、こちらで画面を合わせてある基準サイズです。

### ⑤ 文章（そのままコピーして構いません）

**Short description**（検索結果に出る1行）

```
2体を融合して、世界に1体だけのモンスターを育てる。負けると、その仲間は二度と戻りません。
```

**Long description**

```
出会ったモンスターを融合して、自分だけの系譜を作るブラウザゲームです。
登録もダウンロードも要りません。開けば遊べます。

■ 見た目が、そのまま強さになります
体の部位は遺伝で決まります。尻尾からはバインド技、角からは突進技、
目からは魔法。どんな体に生まれたかが、何を覚えるかを決めます。

■ 負けると、仲間を失います
アリーナは勝ち抜き式です。評価は「何連勝できたか」だけ。
負けた仲間は二度と戻りません。だから連勝に意味があります。

■ はじめての人は、練習ラダーから
相手が弱く、負けても仲間を失いません。ボスの顔を見てから、本番へどうぞ。

■ 週替わりのラダー
同じ週に挑めば、世界中が同じ敵と同じ順番で戦います。
```

**Tags**

```
monster, breeding, turn-based, pixel-art, roguelite, creature-collector,
japanese, no-download, browser, singleplayer
```

**Genre**: Role Playing / **Made with**: TypeScript, React

### ⑥ カバー画像

`dist/og.jpg`（800×420）がそのまま使えます。itch.ioの推奨は630×500なので、
きれいにしたければ後で差し替えで十分です。

---

## 公開したあと、こちらでやること

**itch.ioのURLを教えてください。** ワークフローの `MONSTERFUSION_SITE` を
そこに向けます。そうすると**共有ボタンが出すURLとOGP画像が、itch.ioのページを
指すようになります。** いまはGitHub Pagesを指しています。

---

## 正直に書いておくこと

**8.6MBあります。** ほとんどが音（7.8MB）と100戦目の竜の絵（2.3MB）です。
スマホの回線だと最初の読み込みに数秒かかります。音を圧縮すれば数MB減らせますが、
**公開を遅らせるほどの話ではありません。** 気になったら後でやります。

**GitHub Pagesの方も残ります。** どちらも同じものです。itch.ioは「人が
見つけてくれる場所」、GitHub Pagesは「自分で配るURL」だと思ってください。

**お金を取るなら、まだ早いと思います。** メールアドレスを預かっていないので、
引き継ぎコードを失くした人に返金も復旧もできません。まずは無料か投げ銭で、
遊ばれ方を見てからでも遅くありません。
