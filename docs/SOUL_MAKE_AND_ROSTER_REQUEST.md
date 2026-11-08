# 所持数・ゲームオーバー・ソウルメイク：core接続依頼

## ユーザーの要求
- 融合成功で親2体を消費し、子1体を所持する。
- 敗北すると出場個体を失う。引き分けは今回の要求では消失対象外。
- 所持0体でゲームオーバー。素材があっても終了後には復活しない。
- 所持パーツを体、目などの枠にはめ、新しい個体を作る「ソウルメイク」。

## UIで実装した暫定処理
src/mocks/session.ts にセッション用の所持一覧ラッパーを追加。
coreのMonsterは変更せず、融合成功時と敗北確定時にUI所持一覧を更新。
敗北の確定は演出より前なので、別画面へ逃げても消失は戻らない。
親の記録は履歴として残して、系譜の名前を参照する。
進行中のアリーナがある間は融合不可。0体で操作を止め、最初から始める。
画像登録からの無料増殖は休止。登録コンポーネント自体は削除していない。
これらは本番の所有権チェックではないため、coreにセッション管理を移してください。

## ソウルメイクUI（生成は未接続）
src/pages/SoulMake.tsx：体・目・口・頭飾り・角・翼・尻尾の枠。
所持数のある素材のみ配置、部位の不一致を拒否。クリックとドラッグに対応。
暫定案として体＋目を必須、ほかは任意。core側のレシピ定義に差し替える。
存在しない個体を手作りせず、生成ボタンは準備中として無効。
現在 DEFAULT_ARENA_CONFIG.dropLoci は horns/wings/tail/jaw/crest のみ。
bodyShape と eyes を入手できるよう、報酬の仕組みも追加が必要。

## 必要な公開APIの案（名前・型は提案。index.tsから公開してください）
```ts
interface SoulMakeRecipe {
  requiredLoci: readonly CategoricalLocus[];
  optionalLoci: readonly CategoricalLocus[];
}
interface SoulMakeSelection {
  partIds: readonly string[];
  name?: string;
}
interface SoulMakePreview {
  ok: boolean;
  message: string;
  missingLoci: readonly CategoricalLocus[];
  // 必要ならcoreが整合性を保証した外見のみ返す。UIでMonsterを組み立てない。
  phenotype?: MonsterPhenotype;
}
interface SoulMakeResult {
  ok: boolean;
  message: string;
  monster?: Monster;
  inventory: PartInventory;
  spent: readonly GenePart[];
}
getSoulMakeRecipe(): SoulMakeRecipe;
previewSoulMake(selection: SoulMakeSelection, inventory: PartInventory): SoulMakePreview;
soulMake(selection: SoulMakeSelection, inventory: PartInventory,
         context: MonsterContext, requestId: string): SoulMakeResult;
```
生成時はgenes→phenotype→statsの整合性をcoreが保証し、配置したパーツの発現を保証。
任意部位の未配置時、属性・体色・大きさ・能力・世代・親IDの初期値もcoreが決定。
未所持・不足・部位重複・不正IDは一切消費せず失敗。
成功時だけ各素材を1個消費。requestIdの再送で重複生成・消費しないこと。
UIはresult.inventoryとmonsterを適用するだけにする。

## 所持一覧の本実装に必要なAPIの案
```ts
interface GameSession {
  owned: readonly Monster[];
  history: readonly Monster[];
  inventory: PartInventory;
  status: 'playing' | 'gameOver';
}
fuseOwnedMonsters(session: GameSession, parentAId: string, parentBId: string,
  context: MonsterContext, requestId: string, partId?: string):
  { session: GameSession; fusion: FusionResult };
settleBattleLoss(session: GameSession, battle: BattleState, battleId: string): GameSession;
soulMakeInSession(session: GameSession, selection: SoulMakeSelection,
  context: MonsterContext, requestId: string): { session: GameSession; result: SoulMakeResult };
```
本番では融合失敗時に親も素材も残ること、二重決済の防止、消費済み親での再融合拒否、
出場中の個体の消費禁止、敗北の一度だけの反映、ゲームオーバー後の操作拒否をcoreで保証。
系譜用の履歴と使用可能な所有個体を分ける。保存データにも両者を反映する。
UIは従来どおり @core/core/index.ts のみ参照する。
