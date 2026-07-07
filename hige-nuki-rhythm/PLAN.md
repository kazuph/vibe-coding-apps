# hige-nuki-rhythm 実装計画書（発注仕様）

## 依頼内容（原文要約）

リズム天国の「リズム脱毛」（玉ねぎのヒゲ抜き）インスパイアのブラウザリズムゲーを作る。
- 曲も、抜くリズムも本家を研究した上で設計（音源・グラフィックはオリジナル。著作物のコピー禁止）
- J / K / Space / Enter 等の簡単なキーだけで入力
- **複数キー対応必須**（本家の玉ねぎは高速連打があり、1キーだと物理的にクリア不能。複数キーを全部「抜く」ボタンにして交互連打できるようにする）
- フルCloudflare Workersスタック（React or Preact + Hono + D1）
- D1でスコア・進捗管理、リロードでいつでも復元

## 本家研究の要点（設計根拠）

- ゲーム構造は**コール&レスポンス**: 野菜がベルトコンベアで流れてくる→ヒゲが「ピョン♪」とリズムに合わせて生える（お手本=コール）→ピンセットの前に来たら**同じリズム**でボタンを押してヒゲを抜く（レスポンス）
- 縮れ毛（カール毛）は**長押しして拍で離す**と抜ける
- ジャガイモ等は8分音符の連打パターンがあり、ここが「複数キー交互連打」が必要な理由
- 判定は Perfect（完全に抜ける）/ Early・Late（半分残って「イテッ」）/ Miss（抜けない）
- 全部抜けると野菜がニッコリ。終盤はテンポアップ

## ゲーム仕様

### タイトル・世界観
- アプリ名: **「ヒゲぬきファーム」**
- ヒゲの生えた野菜は売り物にならない。リズムに乗ってイイ感じに抜くとキレイに抜ける、という設定（オリジナル文言で書くこと）

### 入力仕様（最重要）
- `Space` / `Enter` / `J` / `K` / `F` / `D` の**どのキーでも「抜く」**。マウスクリック・タップも同扱い
- **複数キーの同時・交互押下を正しく処理**する:
  - `keydown`（`repeat=true`は無視）ごとに1入力。異なるキーの高速交互連打がすべて独立入力として判定されること
  - 1つのノーツは1回しか消費されない（二重ヒット防止: ノーツ消費制）
  - 同時押し（±30ms以内の複数keydown）は「先の1打」だけがノーツに割り当てられ、余剰打は空振り扱いにしない（ペナルティなし。連打ゲーの常識に合わせる）
- 縮れ毛ノーツ: いずれかのキーを**押しっぱなし→指定拍でkeyup**。押した拍と離した拍の両方を判定
- キーコンフィグは不要。ヘルプ画面にキー一覧表示

### 判定ウィンドウ（AudioContext時刻基準）
| 判定 | 窓 | 演出 |
|---|---|---|
| Perfect | ±60ms | ヒゲがスポン！と完全に抜けて飛んでいく |
| Good | ±120ms | ヒゲが千切れて根本が残る＋「イテッ」表示 |
| Miss | それ以外/空振り/取り逃し | ヒゲが残る、野菜が涙目 |

### 音楽（オリジナル曲・WebAudio合成）
- 著作権対策のため**音源ファイルは使わずWebAudio APIでチップチューンを合成**する（矩形波+三角波+ノイズドラム）。曲名「ベジタブル・ビート」
- 4/4拍子、基本 **BPM 118**、ラスト2野菜で **BPM 132** にテンポアップ
- コード進行例: C - Am - F - G のループ+ラストで半音上げ。メロディはお手本フェーズでヒゲ出現音（ピョン=上昇ピッチのsine）、レスポンスフェーズで抜き音（スポン=短いnoise+pitch bend）がリズムを補強する
- **スケジューラ**: `AudioContext.currentTime`を唯一のクロックとし、25ms間隔のsetIntervalで0.12s先までのイベントを`setTargetAtTime`/`start(when)`予約するlookahead方式。`performance.now()`とrAFは描画のみに使用。ノーツ判定時刻も全部AudioContextクロックで持つ

### 譜面（1野菜 = 4小節: 前半2小節コール、後半2小節レスポンス）
譜面はJSONで宣言的に定義（`src/game/charts.ts`）。beatは2小節フレーズ内の拍位置（1〜8、8分=0.5刻み）。

| # | 野菜 | パターン（拍） | 種別 |
|---|---|---|---|
| 1 | たまねぎ | 1, 3, 5, 7 | tap（2分で超易） |
| 2 | たまねぎ | 1, 2, 3, 4 | tap |
| 3 | たまねぎ | 1, 2, 3, 3.5, 4 | tap（タタ入り） |
| 4 | かぶ | 1.5, 2.5, 3.5, 4.5 | tap（裏拍） |
| 5 | たまねぎ | 1, 2, 2.5, 3, 3.5, 4 | tap |
| 6 | じゃがいも | 1, 1.5, 2, 2.5, 3, 3.5, 4 | tap **8分7連（交互キー必須）** |
| 7 | 縮れ毛たまねぎ | hold: 1→3, tap: 4 | hold |
| 8 | かぶ | 1, 2.5, 4, 5.5, 7 | tap（シンコペ） |
| 9 | じゃがいも | 1, 1.5, 2, 3, 3.5, 4, 5, 5.5, 6, 6.5, 7 | tap 連打ロング |
| 10 | 縮れ毛かぶ | hold: 1→2.5, hold: 4→5.5 | hold×2 |
| 11 | たまねぎ | 1, 2, 3, 3.5, 4, 4.5, 5 | tap |
| 12 | じゃがいも | 全8分×15（1〜8） | tap **最難連打** |
| 13 | （テンポアップ演出：農家のおじさん「はやいよ〜！」） | - | - |
| 14 | たまねぎ(BPM132) | 1, 2, 3, 3.5, 4 | tap |
| 15 | じゃがいも(BPM132) | 1, 1.5, 2, 2.5, 3, 3.5, 4 | tap |
| 16 | スイカ（ボス・BPM132） | 1, 1.5, 2, 2.5, 3, 3.5, 4 + hold: 5→7 | tap+hold |

※微調整はプレイフィールで行ってよいが、「裏拍」「8分連打」「hold」「テンポアップ」の4要素は必ず残すこと。

### 演出・グラフィック
- Canvas 2D（devicePixelRatio対応）。オリジナルのかわいい野菜（目・鼻・口・ヒゲをcanvasプリミティブ or 自作インラインSVGで描く。本家スプライトの模写・吸出しは禁止）
- コンベア上を野菜が右→中央へ移動、中央でピンセット（上から降りてくる）がヒゲを掴む
- 判定エフェクト: Perfect=ヒゲが放物線で飛ぶ+キラ星、Good=「イテッ!」吹き出し、Miss=野菜が涙目
- 背景で農家のおじさんがリズムに合わせて頷く（ノリ感の演出）
- モバイル: 画面全体タップ=抜く。縦横両対応レイアウト

### リザルト・ランク
- ノーツ内訳（Perfect/Good/Miss）と精度%を表示
- ランク: 精度95%以上=「ハイレベル!」/ 80%以上=「イイ感じ」/ 60%以上=「平凡」/ 未満=「やりなおし…」
- ハイスコア更新演出

## アーキテクチャ

```
hige-nuki-rhythm/
├── package.json          # npm, vite, react19, hono, wrangler, vitest, playwright
├── wrangler.jsonc        # assets + D1 binding (DB)
├── vite.config.ts        # @cloudflare/vite-plugin + react
├── migrations/0001_init.sql
├── src/
│   ├── worker/index.ts   # Hono API
│   ├── client/           # React UI (Title/Play/Result/Leaderboard)
│   └── game/             # ←UI非依存の純ロジック（テスト対象）
│       ├── charts.ts     # 譜面データ
│       ├── judge.ts      # 判定エンジン（純関数）
│       ├── scheduler.ts  # lookaheadスケジューラ
│       └── synth.ts      # WebAudioチップチューン
├── e2e/                  # Playwright
└── tests/                # vitest
```

### D1スキーマ
```sql
CREATE TABLE players (
  id TEXT PRIMARY KEY,            -- uuid (httpOnly cookie "hnr_uid")
  name TEXT DEFAULT 'ななしの農家',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL REFERENCES players(id),
  accuracy REAL NOT NULL, perfect INTEGER, good INTEGER, miss INTEGER,
  rank TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE progress (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  best_accuracy REAL DEFAULT 0, best_rank TEXT, play_count INTEGER DEFAULT 0,
  updated_at TEXT
);
```

### API（Hono）
- `POST /api/player` … cookie無ければuuid発行してSet-Cookie、プレイヤー作成/復元（**リロード復元の要**）
- `POST /api/scores` … スコア送信（サーバー側でaccuracy範囲バリデーション）
- `GET /api/leaderboard?limit=10`
- `GET /api/progress` … 自己ベスト・プレイ回数

## テスト・受け入れ条件（全部満たすまで完了禁止）

1. `npm run build` 成功、型エラー0、`npm run lint` パス
2. **vitest**: judge.ts（Perfect/Good/Miss境界値、hold判定、二重ヒット防止、同時押し余剰打の無害化）、charts.tsのスキーマ検証、スケジューラのイベント順序
3. **Playwright E2E**:
   - タイトル→プレイ開始→`page.keyboard`で譜面通りに自動演奏→リザルト表示→スコアがD1に保存→リロードして自己ベスト復元、まで通す
   - **交互キー連打テスト**: J/K交互で8分連打野菜(#6)がPerfect判定になること
   - スクショを `.artifacts/hige-nuki-rhythm/` に保存（タイトル/プレイ中/リザルト/モバイル幅375px）
4. スクショを自分の目で確認: レイアウト崩れ・ボタン切れ・文字化けなし（モバイル/デスクトップ両方）
5. 音: ヘッドレスでは自動再生制約があるため、AudioContext resume がユーザー操作（スタートボタン）に紐づいていることをコードとE2Eで確認
6. `wrangler d1 migrations apply` がローカル(--local)で成功し、dev環境でAPI一式が実動作

## 禁止事項
- 本家の音源・画像・「リズム天国」の名称使用（インスパイアであり、名称・アセットはすべてオリジナル）
- 判定・スケジューラのロジックをReactコンポーネント内に書くこと（純関数に分離してテスト可能に）
- 実装だけして動作確認しないこと
