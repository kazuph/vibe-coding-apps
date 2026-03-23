# Ruby Sketch WASM

ブラウザ上で Ruby を使った Processing スタイルのクリエイティブコーディングができる環境です。Ruby 3.3 を WebAssembly にコンパイルし、ビルド不要・インストール不要で動作します。

**Live Demo**: https://kazuph.github.io/vibe-coding-apps/ruby-sketch-wasm/

## 特徴

- Ruby 3.3 が WebAssembly でブラウザ内で直接動作
- Processing / RubySketch 互換の DSL（`setup`, `draw`, `fill`, `stroke`, `circle`, `rect` など）
- HTML5 Canvas によるリアルタイム描画
- マウス・キーボード・タッチイベント対応
- PVector クラスによるベクトル演算
- HSB / RGB カラーモード対応
- 画像読み込み・表示（`loadImage` / `image`）
- サウンド再生（Web Audio API / `loadSound` / `playTone`）
- Sprite クラス（基本実装）
- iPad 版 RubySketch 風サイドバーファイラー（6カテゴリ、21サンプル）

## 公式 RubySketch / Processing 互換性 Todo

iPad 版 RubySketch および [xord/processing](https://github.com/xord/processing)・[xord/rubysketch](https://github.com/xord/rubysketch) との互換性ロードマップ。

### API 互換性

#### 描画・図形
- [x] `setup` / `draw` DSL
- [x] `size(w, h)`
- [x] `background`, `fill`, `noFill`, `stroke`, `noStroke`, `strokeWeight`
- [x] `circle`, `ellipse`, `rect`, `square`, `triangle`, `quad`, `line`, `point`, `arc`
- [x] `beginShape` / `vertex` / `endShape`
- [x] `bezier`, `curve`, `bezierVertex`, `curveVertex`
- [x] `text`, `textSize`, `textAlign`（2引数対応済み）
- [x] `text(str, x, y, w, h)` バウンディングボックス描画
- [ ] `blendMode()` — Canvas 2D `globalCompositeOperation` で実装
- [ ] `loadPixels()` / `pixels[]` / `updatePixels()` — ピクセル直接操作
- [ ] `get(x, y)` / `set(x, y, color)` — ピクセル読み書き
- [ ] `filter()` — 画像フィルタ（BLUR, GRAY, INVERT 等）
- [ ] `tint()` / `noTint()` — 画像の色合い変更

#### カラー
- [x] `colorMode(RGB / HSB)`
- [x] `color()`, `lerpColor()`
- [x] HSB / RGB 切り替え

#### 変換・状態
- [x] `translate`, `rotate`, `scale`
- [x] `push` / `pop` / `pushMatrix` / `popMatrix`
- [x] `angleMode(DEGREES / RADIANS)`
- [x] `rectMode`, `ellipseMode`
- [ ] `shearX()` / `shearY()` — せん断変換
- [ ] `applyMatrix()` — 任意の変換行列

#### マウス・キーボード
- [x] `mouseX`, `mouseY`, `pmouseX`, `pmouseY`
- [x] `mousePressed` / `mouseReleased` / `mouseMoved` / `mouseDragged` / `mouseClicked`
- [x] `keyPressed` / `keyReleased` / `keyTyped`
- [x] `key`, `keyCode`

#### タッチ
- [x] `touchStarted` / `touchMoved` / `touchEnded`
- [x] `touches` 配列（マルチタッチ対応）
- [x] マウスイベントとの自動互換

#### 画像
- [x] `loadImage(url)` — 外部 URL から画像読み込み
- [x] `image(img, x, y, w, h)` — 画像描画
- [x] `imageWidth(img)` / `imageHeight(img)` / `imageLoaded?(img)`
- [ ] `loadImage` 戻り値を `.width` / `.height` プロパティ付きオブジェクトに — 公式互換
- [ ] `createImage(w, h)` — 空の画像オブジェクト生成
- [ ] `createGraphics(w, h)` — オフスクリーンキャンバス
- [ ] `beginDraw` / `endDraw` — Graphics オブジェクトへの描画

#### カメラ
- [ ] `createCapture()` — WebRTC `getUserMedia` でカメラ入力取得
- [ ] カメラ映像を Canvas に描画
- [ ] カメラ映像にフィルタ適用（delay, filter 等）

#### サウンド
- [x] `loadSound(url)` — 外部音声ファイル読み込み
- [x] `SoundFile` クラス（`play`, `loop`, `stop`）
- [x] `playTone(freq, duration, type, volume)` — Web Audio API オシレーター
- [ ] `SoundFile` に `isPlaying?`, `duration`, `volume=` 追加
- [ ] `p5.FFT` 相当 — 周波数解析・ビジュアライザー

#### ベクトル・数学
- [x] `PVector` クラス（add, sub, mult, div, mag, normalize, limit, heading, dist, dot, lerp, rotate）
- [x] `PVector.random2D`, `PVector.fromAngle`
- [x] `createVector(x, y, z)`
- [ ] `Vector` エイリアス — `PVector` の別名として追加（公式互換）
- [x] `random()` — Processing 互換（0-3引数）
- [x] `noise()` / `noiseSeed()` — Perlin ノイズ
- [x] `map`, `constrain`, `lerp`, `dist`, `mag`, `norm`
- [x] `degrees`, `radians`, `sq`, `pow`, `abs`, `ceil`, `floor`, `round`

#### Sprite / 物理
- [x] `Sprite` クラス（位置, サイズ, 速度, 角度, z-order）
- [x] `createSprite(x, y, w, h)`
- [x] `sprite()` 関数で描画
- [x] `gravity(x, y)` — 重力設定
- [x] Sprite カスタム描画ブロック
- [x] Sprite マウスイベント
- [ ] Sprite 衝突判定（矩形 / 円）
- [ ] Sprite 物理エンジン（跳ね返り, 摩擦）
- [ ] `Circle` / `RectShape` を使った Sprite シェイプ描画
- [ ] `addSprite` / `removeSprite` の自動描画統合

#### ユーティリティ
- [x] `loop` / `noLoop` / `redraw`
- [x] `frameRate(fps)` / `frameCount` / `millis`
- [ ] `setInterval(duration, id:)` / `clearInterval(id)` — タイマー（現在スタブ）
- [ ] `saveCanvas()` / `save()` — キャンバスを画像として保存
- [ ] `cursor()` / `noCursor()` — カーソル変更
- [x] `width`, `height`
- [x] `windowWidth`, `windowHeight`（スタブ）

### 公式 Examples 対応状況

#### xord/processing Examples

- [x] `hello.rb` — マウス追従テキスト
- [x] `clock.rb` — カラフルアナログ時計（angleMode DEGREES）
- [x] `shapes.rb` — 全図形描画デモ（angleMode DEGREES）
- [x] `breakout.rb` — ブロック崩し（random, textAlign, text 5引数）
- [ ] `image.rb` — 画像マウス追従（loadImage 戻り値の .width/.height 必要）
- [ ] `shake.rb` — クリック振動（Vector エイリアス必要）
- [ ] `camera.rb` — カメラ入力（createCapture 必要）
- [ ] `delay_camera.rb` — カメラ遅延エフェクト（createCapture + 画像バッファ必要）
- [ ] `filter.rb` — 画像フィルタ（createCapture + filter 必要）

#### xord/rubysketch Examples

- [x] `hello.rb` — 基本テキスト描画
- [ ] `physics.rb` — 重力 + Sprite 物理シミュレーション（Sprite 衝突判定必要）
- [ ] `sprite.rb` — Sprite マウスイベント + z-order（完全な Sprite 実装必要）
- [ ] `toon.rb` — お絵描きアニメーションツール（createGraphics, beginDraw, setInterval 必要）

#### iPad 版バンドル Examples

- [x] `Flappy.rb` — フラッピーバード（独自実装）
- [x] `Shooter.rb` — 弾幕シューティング（独自実装: Danmaku Shooter）
- [x] `MineSweeper.rb` — マインスイーパー（独自実装）
- [x] `RandomWalkTriangles.rb` — ランダム三角形（独自実装: Random Walk）
- [ ] `SameGame.rb` — 同色パズルゲーム
- [ ] `Solitaire.rb` — クロンダイクソリティア
- [ ] `DrumPad.rb` — ドラムパッド（playTone 応用）
- [ ] `BrightBrush.rb` — ブレンドモードお絵描き（blendMode 必要）
- [ ] `DuelystUnits.rb` — ユニットアニメーション
- [ ] `FilterCamera.rb` — カメラフィルタ（createCapture 必要）
- [ ] `Animation.rb` — アニメーション技法デモ
- [ ] `Timer.rb` — タイマーユーティリティデモ

### 独自 Examples（WASM 版オリジナル）

- [x] Hello World
- [x] Shapes
- [x] Random Walk
- [x] Circles
- [x] Rainbow Wave
- [x] Starfield
- [x] HSB Clock
- [x] Interactive Paint
- [x] Touch Paint
- [x] Particles
- [x] Vector Boids
- [x] Image Gallery
- [x] Sound Piano
- [x] Game of Life
- [x] Fractal Tree
- [x] Physics
- [x] Flappy Bird
- [x] Danmaku Shooter
- [x] Breakout
- [x] Snake
- [x] Mine Sweeper

## 使い方

1. [Live Demo](https://kazuph.github.io/vibe-coding-apps/ruby-sketch-wasm/) を開く
2. サイドバーからサンプルを選択するか、エディタに Ruby コードを書く
3. **Run** ボタン（または `Ctrl+Enter` / `Cmd+Enter`）で実行

```ruby
# 例: 円がマウスを追従するスケッチ
setup do
  size 400, 400
end

draw do
  background 0
  fill 255, 100, 100
  circle mouseX, mouseY, 50
end
```

## テスト

Playwright による E2E テストが用意されています。

```bash
# ローカルサーバー起動
python3 -m http.server 8765 -d docs/ruby-sketch-wasm/

# テスト実行
cd e2e/features/ruby-sketch-sidebar/
npx playwright test sidebar.spec.ts
```

## 技術スタック

- [ruby.wasm](https://github.com/aspect-build/rules_ruby) — Ruby 3.3 WebAssembly (`@ruby/3.3-wasm-wasi@2.6.2`)
- HTML5 Canvas — 描画エンジン
- Web Audio API — サウンド再生・合成
- JavaScript Bridge — Ruby VM とキャンバスコンテキストの連携
