# Ruby Sketch WASM

ブラウザ上で Ruby を使った Processing スタイルのクリエイティブコーディングができる環境です。Ruby 3.3 を WebAssembly にコンパイルし、ビルド不要・インストール不要で動作します。

**Live Demo**: https://kazuph.github.io/vibe-coding-apps/ruby-sketch-wasm/

## 特徴

- Ruby 3.3 が WebAssembly でブラウザ内で直接動作
- Processing / RubySketch 互換の DSL（`setup`, `draw`, `fill`, `stroke`, `circle`, `rect` など）
- HTML5 Canvas によるリアルタイム描画
- マウス・キーボードイベント対応
- PVector クラスによるベクトル演算
- HSB / RGB カラーモード対応

## サンプル

9つのビルトインサンプルが用意されています。

### Circles

カラフルなボールが弾むアニメーション。

![Circles](browser-use-screenshots/02-circles-running.png)

### Rainbow Wave

虹色のサイン波アニメーション。

![Rainbow Wave](browser-use-screenshots/03-rainbow-wave.png)

### Particles

パーティクル噴水エフェクト。

![Particles](browser-use-screenshots/04-particles.png)

### Fractal Tree

再帰的に描画されるフラクタルツリー。

![Fractal Tree](browser-use-screenshots/05-fractal-tree.png)

### Game of Life

コンウェイのライフゲーム（セルオートマトン）。

![Game of Life](browser-use-screenshots/06-game-of-life.png)

### Starfield

中心から星が飛び出す 3D 風アニメーション。

![Starfield](browser-use-screenshots/07-starfield.png)

### Interactive Paint

クリック&ドラッグで描画するインタラクティブペイント。

![Interactive Paint](browser-use-screenshots/08-interactive-paint.png)

### HSB Clock

HSB カラーモードを使ったアナログ時計。

![HSB Clock](browser-use-screenshots/09-hsb-clock.png)

### Vector Boids

PVector を使った群れシミュレーション（Boids）。

![Vector Boids](browser-use-screenshots/10-vector-boids.png)

## 使い方

1. [Live Demo](https://kazuph.github.io/vibe-coding-apps/ruby-sketch-wasm/) を開く
2. ドロップダウンからサンプルを選択するか、エディタに Ruby コードを書く
3. **Run** ボタン（または `Ctrl+Enter`）で実行

```ruby
# 例: 円がキャンバス内を跳ね回るスケッチ
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
node test-server.cjs  # ローカルテストサーバー起動
npx playwright test docs/ruby-sketch-wasm/test.cjs
```

## 技術スタック

- [ruby.wasm](https://github.com/aspect-build/rules_ruby) - Ruby 3.3 WebAssembly ビルド (`@ruby/3.3-wasm-wasi@2.6.2`)
- HTML5 Canvas - 描画エンジン
- JavaScript ブリッジ - Ruby VM とキャンバスコンテキストの連携
