# AtomS3R Tamagotchi (FreeRTOS)

Atom S3R（AtomS3R）向けに、フルカラーのたまごっち風キャラクターアプリを始めるための最小実装です。

## 確認したデバイス仕様（調査結果）

- 画面: 0.85inch、カラー IPS、解像度 `128 x 128`
- 本体: `M5AtomS3R`（ESP32-S3-PICO-1-N8R8）
- ボタン: ユーザボタン 1 つ（`M5.BtnA`）
- サイズ: 約 `24.0 x 24.0 x 12.9 mm`
- 参考: M5Stack 公式ドキュメント（AtomS3R / Atom Unified API）

## 実装内容

このサンプルは FreeRTOS で 3 タスクを分離しています。

- 入力処理タスク
  - `M5.update()` を回してボタンイベントを拾い、キューに投入
  - 単押し: `M5.BtnA.wasSingleClicked()`
  - 長押し: `M5.BtnA.wasHold()`
- ゲームロジックタスク
  - 単押しで現在のキャラが「喜び/悲しみ」を切り替え
  - 長押しで 3 キャラクターを循環
  - 一定時間ごとにうんち状態を発生
  - うんち中に単押しで掃除アニメ + サウンド
- 表示タスク
  - 毎フレーム（約30FPS）で状態を描画
  - 3体の異なる見た目のキャラクター + 表情アニメ

## ビルド / 書き込み

```bash
cd atom-s3r-tamagotchi
pio run -t upload
```

書き込みが通らない場合は、再試行し続けるスクリプトも使えます（ダウンロードモードへ入れた瞬間に掴みます）。

```bash
cd atom-s3r-tamagotchi
./tools/upload_loop.sh /dev/cu.usbmodem11301
```

（PlatformIO が未導入なら先に `python -m pip install platformio`）

## 画面での操作

- 単押し: キャラクターが「ハッピー↔サッド」を切り替え（うんち中は掃除）
- 長押し: キャラクター 3体を順番に切り替え
- 時間経過: ランダムでうんちが発生（画面上にアニメ表示）

## 音声

M5Unified の `M5.Speaker` API を使って、イベント時に短いトーンを鳴らしています。  
初期音量は `17%` に設定しています。  
`Atomic Echo` 接続時は外部スピーカー経由でも鳴らせます。  
`WAV` ファイルを Web から落として再生するようにできます（`playWav`）。  
このバージョンはデフォルトで Web の `WAV` URL を 3種類ダウンロードしてキャラクターイベント音に使う実装です。
`miotts` が同一ネットワーク上で起動していれば、まず `miotts` で喋らせ、失敗時のみ既存の `WAV` URL 再生へフォールバックします。

`miotts` の探索は以下です。
- 既定ターゲット: Wi-Fi のゲートウェイ（必要なら `kMiottsHostOverride` で固定）
- ポート候補: `80`, `8080`, `8000`, `5000`, `3000`
- パス候補: `/tts`, `/v1/tts`, `/audio/speech`, `/v1/audio/speech`, `/api/tts`, `/speak`, `/api/speak`（GET/POST）

### 事前設定

`src/main.cpp` の先頭定数を編集してください（`kWiFiSsid`, `kWiFiPassword`, `kVoice*Url`）。

- Wi-Fi SSID / PASS が未設定だと、従来のトーン鳴動（内部生成音）で動作します。
- URL が失敗した場合も、失敗イベントで自動的にトーンへフォールバックします。

## カスタムのヒント

- `kPooIntervalMs`, `kEmotionTimeMs` を変えると頻度や感情持続を調整できます
- キャラクターの配色や形は `kCharacters` と `drawCharacterVariant()` に集約
- 喋る・効果音を増やす場合は `playEventSound()` を拡張

## デバッグサーバー

`AtomS3R` 側で HTTP サーバーを立てています（既定ポート: `8080`）。

- 書き込みが失敗する場合（`No serial data received`）は、Atom を **ダウンロードモード**に入れる必要があります。  
  多くの AtomS3 系は「`RESET` を 2 秒ほど長押しして（緑LED点灯など）から離す」と ROM 書き込み待ちになります。

- `http://<IP>:8080/status`  
  稼働状態（Wi-Fi、スピーカー、音声ロード状況、最近のログ行数、mDNS、ログ出力、miotts 最終試行）を JSON で返します。
- `http://<IP>:8080/diag`  
  最近のデバッグログを時系列で表示します。
- `http://<IP>:8080/beep`  
  デバイス側でテスト音を再生します（成功/失敗を返します）。
- `http://<IP>:8080/beep2`  
  第二パターンのテストボイスを再生します。
- `http://<IP>:8080/voice`  
  ダウンロード済みの WAV を再生します。
- `http://<IP>:8080/download`  
  音声の再ダウンロードを開始します。
- `http://<IP>:8080/relay`  
  設定されているリレー先へログ送信を即時実行します。
- `http://<IP>:8080/ping`  
  サーバー生存確認用。
- 同時に `http://<IP>:8081/status` でも最低限の同様レスポンスを返します（描画負荷に依らない軽量版）。
- `http://<IP>:8080/miotts?probe=1`  
  接続先を `/health` 系で探し、`miotts` API状態を簡易チェックします。  
  `miotts` 側が起動していれば `probe` 結果が文字列で返ります。
- `http://<IP>:8080/miotts?probe=1&quick=1&verbose=1`  
  Atom 側から到達を step-by-step で確認するための高速版です。  
  各候補の `code` と `ct`、`ms` を確認できます。
- `http://<IP>:8080/miotts?speak=%E3%81%93%E3%82%8C%E3%81%AF%E3%83%86%E3%82%B9%E3%83%88%E3%80%82`  
  日本語を `miotts` に即座に投げて再生を試みます（デバッグ用）。
- `http://<IP>:8080/miotts?probe=1&speak=%E3%81%84%E3%81%A1%E3%81%B0%E3%82%93...`  
  先にAPI状態確認してから読み上げテストできます（`%`エンコードは自動）。
- `http://<IP>:8080/miotts?probe=1&quick=1&host=<host>&port=<port>&verbose=1&speak=%E3%81%82%E3%82%8A%E3%81%8C%E3%81%A8%E3%81%86...`  
  候補を固定して `miotts` API を呼び、成功する組み合わせを短時間で検証します。

#### Atom側からの順番確認（おすすめ）

  1. 生存確認: `curl http://<IP>:8080/ping`
 2. 候補検査: `curl "http://<IP>:8080/miotts?probe=1&quick=1&verbose=1"`
3. 検証結果で `code=200` の `host:port` を固定して再確認:  
   `curl "http://<IP>:8080/miotts?host=<host>&port=<port>&probe=1&quick=1&verbose=1"`
4. そのまま発話テスト:  
   `curl "http://<IP>:8080/miotts?host=<host>&port=<port>&speak=%E3%82%84%E3%81%82%E3%82%88%E3%81%86&quick=1"`

起動時は `atom-tamagotchi.local` でも名前解決できるよう `mDNS` を試行します。  
（ネットワーク環境により解決できない場合もあるため、`IP` 直打ちでも確認できます）

### ログ受け取りサーバー（推奨）

`src/main.cpp` の `kLogRelayUrl` を設定すると、デバイスが一定間隔でログをプッシュできます。  
ローカル側で受けるなら以下を実行してください。

```bash
cd atom-s3r-tamagotchi
python3 tools/log_relay_server.py --host 0.0.0.0 --port 8081
```

受信後、`kLogRelayUrl` を `http://<PC_IP>:8081/log` に変更して書き込み再ビルドしてください。
