# 特徴タグ・融合演出の接続

coreの公開index.tsからdescribeMonster / describeTraits / labelFor /
fuseDetailed / describeFusionを使用します。coreオブジェクトは変更しません。

- UI Monster.tags: core MonsterTag[]。詳細は全件、カードは発現中の先頭3件。
- UI FusionResult.summary: core FusionSummary。未指定の既存adapterも表示可能。
- fuseDetailedのchildとevolution.willEvolveをdescribeFusionへ渡します。
- 子の登録は融合成功時に1回。演出完了・スキップでは登録しません。
- 表示順はcoreのsteps順。10件超は通常の継承を160ms間隔に短縮します。
- 優性/劣性/隠し/変異は色と文字で識別。特徴の日本語ラベルはcoreが提供します。
- 音は初期オフ、ユーザー操作でWeb Audioを開始。画面移動時に解放します。
- OSの動きを減らす設定では発光・揺れを省略し完成形を表示します。
- スプライトは既存Canvas描画を使い、ピクセル表示を維持します。

主なファイル: components/FeatureTags.tsx、components/FusionReveal.tsx、
pages/Fusion.tsx、pages/Detail.tsx、styles/fusion.css、shared/ui.ts、mocks/game.ts。

確認: typecheck / build / sprites:check（200世代のタグ・演出データ一致、
親不変、表示順を含む）。ブラウザでは通常完了・即時スキップ・登録数・音切替を確認。
音の聴感、実機スマートフォンでの表示、実際の進化個体での金色演出は未確認。
新規APIの追加依頼はありません。旧個体のmutatedLociが空の場合もcoreの出力を尊重します。
