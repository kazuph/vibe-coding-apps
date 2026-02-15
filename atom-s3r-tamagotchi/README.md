# AtomS3R Tamagotchi (FreeRTOS)

Atom S3R（M5AtomS3R）向けのたまごっち風デモアプリです。  
`src/main.cpp` は FreeRTOS 3 タスク構成（入力 / ゲームロジック / 描画）で、ボタン入力・内部状態・音声 API・ローカル HTTP デバッグ API を持ちます。

このドキュメントは次担当者が最短で再現できることを重視して、ビルド・書き込み・起動確認・音声検証までを時系列でまとめたものです。

## デバイス確認

- ディスプレイ: 128x128（0.85インチ）
- 本体: `M5AtomS3R`（ESP32-S3-PICO-1）
- 操作ボタン: 1 個（`M5.BtnA`）
- ローカル HTTP: `:8080`（メイン）と `:8081`（軽量）

## 引き継ぎ開始チェックリスト（順番）

1. `cd atom-s3r-tamagotchi`
2. `pio run`
3. `ls /dev/cu.usbmodem* /dev/tty.usbmodem*`
4. `pio run -t upload --upload-port /dev/cu.usbmodem101`
5. `pio device monitor -b 115200 -p /dev/cu.usbmodem101`
6. `curl "http://<IP>:8080/ping"`
7. `curl "http://<IP>:8080/status"`
8. `curl "http://<IP>:8080/miotts?probe=1&quick=1&verbose=1"`

`<IP>` は起動ログまたは LAN の DHCP リストから取得してください。  
`upload_loop.sh` を使う場合は書き込み前に実行前提で `upload_loop.sh` を使用します（引数なしで自動検出でも可）。

## ビルド & 書き込み（引き継ぎ用）

### 1) 初回/通常ビルド

```bash
cd atom-s3r-tamagotchi
pio run
```

### 2) ポート確認

USB 再接続で番号が変わるため、毎回確認します。

```bash
ls /dev/cu.usbmodem* /dev/tty.usbmodem*
```

表示されたポート（例: `/dev/cu.usbmodem101`）を使用してください。  
`upload_loop.sh` は引数なしで最初に見つかった `usbmodem` を使って再試行します。

### 3) 書き込み

```bash
pio run -t upload --upload-port /dev/cu.usbmodem101
```

### 4) 失敗時の再試行

失敗が続く場合は再試行ループを使います（書き込み直前はボードをダウンロードモードにしておくと通りやすいです）。

```bash
./tools/upload_loop.sh /dev/cu.usbmodem101
```

`./tools/upload_loop.sh` は引数を省略しても、最初に見つかった `usbmodem` で動作します。

### 5) シリアル確認

```bash
pio device monitor -b 115200 -p /dev/cu.usbmodem101
```

※ 環境で `esptool` が見つからない、または pio が使えない場合は先に導入してください。  
`python -m pip install platformio`

## 起動後の最短チェック

```bash
curl "http://<IP>:8080/ping"
curl "http://<IP>:8080/status"
curl "http://<IP>:8080/diag"
curl "http://<IP>:8081/status"
curl "http://<IP>:8080/miotts?probe=1&quick=1&verbose=1"
```

## 画面仕様・操作仕様

- 単押し: 喜び / 悲しみの切り替え（うんち状態なら掃除）
- 長押し: キャラを 3 体循環
- 一定時間ごとに「うんち」発生
- うんち中の単押し: 掃除アニメ + サウンド

## 音声仕様

- 起動音声とイベント音は TTS 優先 (`miotts`)、失敗時は WAV フォールバック
- 既定音量: `30%`（`0.30`）
- `/beep2` で補助音声を再生

### miotts 設定

- 既定ターゲット: `kMiottsHostDefaultOverride = "192.168.11.12:8001"`
- 候補ホスト: `miotts.local`, `miotts`, `audio.local`, `localhost`
- ポート候補: `8001`, `7860`, `80`, `8080`, `8000`, `5000`, `3000`
- Probe エンドポイント: `/health`, `/v1/health`, `/v1/presets`, `/openapi.json`, `/`

## デバッグ API

IP ベースURL を `http://<IP>` とし、優先ポート `8080` / 軽量 `8081` を使用します。

- `GET /ping` : 生存確認
- `GET /status` : 主要状態
- `GET /diag` : 直近ログ
- `GET /beep` : テスト音
- `GET /beep2` : 補助音
- `GET /voice` : 既定フレーズ
- `GET /miotts?speak=<URLEncoded>&quick=1` : TTS 再生
- `GET /miotts?probe=1&quick=1&verbose=1` : 接続 Probe
- `GET /download` : 音声再取得
- `GET /relay` : ログ中継の即時送信

```bash
curl "http://<IP>:8080/miotts?speak=%E3%81%8A%E3%81%AF%E3%82%88%E3%81%86&quick=1"
curl "http://<IP>:8080/miotts?probe=1&quick=1&verbose=1"
```

## ログ受信（任意）

必要であれば、PC でログ受信用サーバを立てます。

```bash
python3 tools/log_relay_server.py --host 0.0.0.0 --port 8081
```

`src/main.cpp` の `kLogRelayUrl` を `http://<PC_IP>:8081/log` に差し替え、再ビルドして再導入します。

## トラブルシュート

- 書き込み失敗（`No serial data received`）
  - USB を抜き差しして `upload_loop.sh` で再試行
  - 必要なら BOOT/RST を使って書き込みモードへ（または赤/緑点滅挙動を再確認）
- `ping` が返らない
  - `pio device monitor` の IP ログを再取得し、ルータ DHCP も併せて確認
- 音声が鳴らない
  - `miotts` との接続確認は `probe=1` で確認し、ネットワーク/ポートを変えて再試行
  - それでも再生しない場合、起動時のログ（`/diag`）を確認

## カスタムポイント

- 画面更新周期: `kFramePeriodMs`
- うんち発生周期: `kPooIntervalMs`
- 感情継続時間: `kEmotionTimeMs`
- キャラクター定義: `kCharacters`
- 音声文言: `kMiottsPhrase*`

## 引き継ぎメモ

- `.pio/` は `.gitignore` で除外済みで、Git 追跡しない
- 主要ハンドオフは `README` → まず `git status`/`pio run` → 書き込み → `/ping` → `/status` → `miotts probe`
- `kMiottsHostDefaultOverride` を変更する場合は、この README も同時に更新する
