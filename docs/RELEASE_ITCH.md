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


---

## 2026-11-18 追記：zipの作り方で一度つまずきました

アップロードは通ったのに、**ゲームが真っ白**になりました。原因はzipです。

itch.ioに置いたあと、ファイルを直接叩いて分かったことです。

```
index.html                                   200
og.jpg                                       200
assets/index-....js                          404
audio/battle/attack.wav                      404
monsters/bosses/arena-100-dragon-concept.png 404
```

**一番上の階層のファイルだけが残り、フォルダの中身が全部消えていました。**

犯人は PowerShell の `Compress-Archive` です。作られたzipには
**フォルダ自体の情報（ディレクトリエントリ）が1つも入っていませんでした。**
ファイルのパスは `assets/index-....js` と正しいのに、`assets/` という
エントリがない。手元のWindowsでは問題なく展開できるので気づけません。
**itch.io側の展開では、フォルダが作られずに中身が落ちました。**

いまは Python の `zipfile` で、**フォルダのエントリを先に書いてから**
ファイルを入れています。

```
dir entries: 9 | files: 79
```

確認のしかたも変えました。**zipを「サーバーがやるのと同じ手順で展開して」
配信し、全ファイルが200で返ること・ゲームが起動することまで見ています。**
前回は展開済みのフォルダをコピーして試していたので、
**zipの欠陥がすり抜けていました。**

### 作り直すときのコマンド

```bash
cd C:/Dev/MonsterFusion-UI
MONSTERFUSION_BASE=./ MONSTERFUSION_HOME=https://kureating544.itch.io/monsterfusion npm run build
```

`MONSTERFUSION_BASE=./` は相対パスで作る指定です（忘れると真っ白）。
`MONSTERFUSION_HOME` は**共有ボタンが出すURL**です（忘れると
`html-classic.itch.zone/html/...` という誰も開けないURLが配られます）。

そのあと `docs/RELEASE_ITCH.md` のこの節にあるとおり、ディレクトリエントリ付きで
固める。`Compress-Archive` は使わないでください。

### 作り直したzipで、動くのを確認しました（2026-11-18）

itch.io上で「Run game」を押して、図鑑画面とモンスター3体の絵が出るところまで
見ています。配信されているファイルも直接叩いて確かめました。

```
index.html                                   200
assets/index-....js                          200  (477,753 bytes)
assets/index-....css                         200  ( 70,149 bytes)
audio/battle/attack.wav                      200  ( 43,564 bytes)
monsters/bosses/arena-100-dragon-concept.png 200  (2,329,600 bytes)
```

**前回404だったフォルダの中身が、全部返ってきています。**

**ただし、ページはまだ Draft です。** あなた以外には404が返ります（確認済み）。
公開は `https://itch.io/game/edit/5388842#published` の
**Visibility & access** を `Draft` → `Public` にするだけです。
**これはあなたが決めることなので、こちらでは触りません。**

アクセス数の見かたは `docs/ANALYTICS.md` に書きました。


---

## 2026-11-18 追記：共有ボタンのURLを、itch.ioのページに向けました

連勝を共有したときに出るURLを、`https://kureating544.itch.io/monsterfusion`
にしました。GitHub Pages版から共有しても、同じURLが出ます。

**なぜわざわざ指定が要るか。** 共有ボタンは「いま自分が配信されている住所」を
出していました。itch.ioではゲームがiframeの中で動いていて、その住所は

```
https://html-classic.itch.zone/html/20615342/
```

です。**ページでもなければ、説明もコメントも何もありません。** しかも数字の
部分はアップロードし直すたびに変わります。これを配っていました。

直し方は、**配信されている場所（`MONSTERFUSION_SITE`）と、人を送る場所
（`MONSTERFUSION_HOME`）を別の値にした**ことです。前者はファイルの置き場所、
後者は玄関です。`MONSTERFUSION_HOME` を指定しなければ今までどおり同じ値に
なります。

**末尾のスラッシュは付けません。** itch.ioは `/monsterfusion/` に301を返して
`/monsterfusion` へ飛ばすので、付けると1回余計に跳ねます。

**zipは作り直してあります**（`monsterfusion-itch.zip`）。いまitch.ioに
上がっているものは古い住所を配るので、**公開する前に差し替えてください。**
