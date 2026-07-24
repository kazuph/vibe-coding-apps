# Webcam VR FPS 3Dアセット計画書（Gemini 担当）

Created: 2026-06-13
Status: Planning
担当: **Gemini (agy) @ herdr p_47 = 3Dアセット担当（この文書を全消化）**
実装担当: Codex (gpt-5.5) @ herdr p_46（ゲーム本体。`webcam-vr-fps/PLAN.md` 参照）
部長: herdr p_45（報告先）

## 依頼内容（ユーザー原文）

> %47はagy=gemini 3.5 flashを立ち上げたので、ビル群や敵の造形をお願いしてください。3D作成で言えばgeminiの方が上です。

ゲーム本体: Webカメラだけで動く VR 風 FPS。サイバーパンク夜景都市を飛び回り敵ドローンを撃つ。あなたの担当は**世界の見た目すべて**（ビル群・敵・武器ビューモデル）。

## 担当範囲と所有権ルール（厳守）

- 編集してよいのは **`webcam-vr-fps/src/assets/**`** と **`webcam-vr-fps/assets-preview.html`** のみ。
- ゲームロジック側（`src/game/` 等）は Codex の所有。絶対に触らない。
- 依存は **Three.js のみ**。外部モデルファイル（.glb 等）・外部テクスチャ画像は**禁止**。すべてコードによる手続き生成（ジオメトリ合成、`CanvasTexture` でのテクスチャ生成）で作る。ライセンス問題回避とビルド簡素化のため。
- Codex が先に `src/assets/contract.ts` を作成・コミットする。**それまでは本書の契約仕様を正として実装を開始してよい**（同一内容）。

## アセット契約（この型に準拠して実装）

```ts
// src/assets/contract.ts（Codex が作成。内容は以下と同一）
import * as THREE from 'three'

export interface CityAsset {
  group: THREE.Group
  colliders: { min: THREE.Vector3; max: THREE.Vector3 }[]  // ビル衝突用 AABB（ワールド座標）
  update(dt: number, elapsed: number): void                 // ネオン明滅・看板アニメ等
}
export interface EnemyAsset {
  group: THREE.Group
  hitRadius: number                          // 当たり判定半径（m）
  update(dt: number, elapsed: number): void  // ホバー・回転アニメ
  onHit(): void                              // 被弾フラッシュ（短い発光）
  onDestroy(): Promise<void>                 // 撃破演出（爆発パーティクル等、完了で resolve）
  reset(): void                              // プール再利用用に状態リセット
}
export interface WeaponViewModel {
  group: THREE.Group          // カメラに子付けされる（右下に構える想定）
  muzzle: THREE.Object3D      // マズル位置（トレーサー始点に使われる）
  onFire(): void              // 発射アニメ＋マズルフラッシュ
  update(dt: number): void
}
export type CityFactory = (seed: number) => CityAsset
export type EnemyFactory = () => EnemyAsset
export type WeaponFactory = () => WeaponViewModel
```

注: `reset()` は契約に追加提案として Codex に `herdr agent send p_46 '[p_47] contract提案: EnemyAsset.reset() 追加希望'` で連絡し合意を取ること（プール再利用に必要なため）。

## アートディレクション

ユーザー提示の参考イメージ＝**夜のサイバーパンク都市**。要素: 高層ビル群の無数の発光窓、ネオンサイン、空中のネオンリング、霧（fog）、ホログラム看板、暗い路面に反射するライト。

カラーパレット:
- 背景/空: `#05060f`（ほぼ黒の紺）
- ネオンシアン: `#00f0ff` / ネオンマゼンタ: `#ff2d95` / アンバー: `#ffaa00`
- ビル躯体: `#0a0e1a`〜`#141a2e`、窓 emissive は暖色/寒色ミックス

## 成果物

### 1. `src/assets/city.ts` — `createCity(seed): CityAsset`
**目的**: 飛び回って気持ちいい密度のネオン都市
- 600m×600m 程度、ビル約 150〜250 棟。`InstancedMesh` で描画（高さ 20〜180m、太さバリエーション、シード乱数で決定的に配置。`Math.random` 直は不可、シード PRNG を自作）
- 窓: `CanvasTexture` で手続き生成した emissive マップ（窓の点灯パターンをランダムに、数枚バリエーション）
- ネオン要素: ビル縁のエッジライト、空中ネオンリング（トーラス、シアン/マゼンタ）、ホロ看板（板ポリ+Canvas テクスチャ、日本語/カタカナ文字入りだと雰囲気◎）
- 地面: 暗色 + グリッド発光ライン、中央にプレイヤー開始用の開けた広場（半径 30m はビルなし）
- `colliders` に全ビルの AABB を返す（プレイヤー衝突用）
- fog（`THREE.FogExp2`, 色 `#05060f`）前提の色設計
- `update()`: 窓のまたたき・看板の明滅・リングの回転
- **性能予算: 三角形 < 300k、draw call < 80**（InstancedMesh とマテリアル共有で達成）

### 2. `src/assets/enemy.ts` — `createEnemyDrone(): EnemyAsset`
**目的**: 撃って気持ちいい敵ドローン
- 体長 1.5m 程度の飛行ドローン: 発光コア球 + 装甲シェル + 回転リング/プロペラ + 下向きスポットライト風の発光。シルエットが暗景で視認できる発光配色（マゼンタ系=敵とわかる）
- `update()`: 上下ホバー（sin）、リング回転
- `onHit()`: 0.1 秒程度の白フラッシュ（emissive 強度操作）
- `onDestroy()`: 爆発（拡散パーティクル: `Points` か小キューブ群が飛散+フェード、0.6 秒程度で resolve）
- `hitRadius` ≈ 1.0
- 1 体あたり三角形 < 5k。同時 5 体出る前提

### 3. `src/assets/weapon.ts` — `createWeapon(): WeaponViewModel`
**目的**: 参考イメージのような SF 片手銃のビューモデル
- 画面右下に構えるエネルギーピストル: 直方体/シリンダー合成 + 発光アクセント（シアン）+ 銃口発光部
- `onFire()`: 短いリコイル（後退→復帰 80ms）+ マズルフラッシュ（発光スプライト一瞬）
- `update()`: 軽いアイドル揺れ
- カメラ子付け前提のスケール感（group 原点=グリップ付近、-z が射撃方向）

### 4. `src/assets/index.ts`
- `export { createCity } from './city'` 等、3 ファクトリを re-export

### 5. `assets-preview.html` + `src/assets/preview.ts` — 単体ビューア（自己検証用）
**目的**: ゲーム本体なしでアセットだけ確認・スクショできる
- Three.js シーンに city / enemy / weapon を配置し OrbitControls で回せる簡易ページ
- `npx vite` で開けること（Codex のスキャフォールド後。それまでは作業を先行し、動作確認は scaffold 完了通知後でよい）

## 進め方

1. 本書熟読 → `webcam-vr-fps/PLAN.md` の「アセット契約」「アートディレクション」も確認
2. Codex の scaffold 完了連絡（`[p_46] contract.ts 確定`）を待たずにコード執筆開始してよい（契約は本書記載で確定済み）
3. city → enemy → weapon → preview の順に実装
4. **必ず自分で preview を開いて確認**: スクショを `.artifacts/webcam-vr-fps/images/assets-city.png` / `assets-enemy.png` / `assets-weapon.png` に保存（headless ブラウザのスクショで可）
5. 性能予算を `renderer.info` で確認し、結果を本書末尾に追記

## 完了報告（必須）

- Codex へ納品連絡: `herdr agent send p_46 '[p_47] assets納品: src/assets/ 実装完了、preview確認済み'`
- 部長へ報告: `herdr agent send p_45 '[p_47] アセット完了: (要約とスクショパス)'`
- 中間報告は不要。質問は部長ではなくまず Codex（契約・統合のこと）へ、ユーザー判断が要るものだけ部長へ。

---
## 実装結果（実装後に追記）
- スクショ:
  - City: ![City Preview](.artifacts/webcam-vr-fps/images/assets-city.png)
  - Enemy: ![Enemy Preview](.artifacts/webcam-vr-fps/images/assets-enemy.png)
  - Weapon: ![Weapon Preview](.artifacts/webcam-vr-fps/images/assets-weapon.png)
- renderer.info:
  - **City Preview**:
    - Draw Calls: 72
    - Triangles: 8,014
    - Geometries: 36
    - Textures: 18
  - **Enemy Preview**:
    - Draw Calls: 13
    - Triangles: 1,728
    - Geometries: 36
    - Textures: 18
  - **Weapon Preview**:
    - Draw Calls: 20
    - Triangles: 664
    - Geometries: 36
    - Textures: 18
