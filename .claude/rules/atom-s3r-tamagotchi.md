# AtomS3R Tamagotchi 運用ルール

このディレクトリ: `atom-s3r-tamagotchi/` の受け継ぎ時は、まず次を実施する。

1. ビルド状態確認
   - `cd atom-s3r-tamagotchi`
   - `pio run`

2. 書き込みポート確定
   - `ls /dev/cu.usbmodem* /dev/tty.usbmodem*`
   - 再接続で番号は変わるので、毎回更新する
   - `./tools/upload_loop.sh` を引数なしで実行する場合もあるので、最初にポート確認は必須

3. 書き込み
   - `pio run -t upload --upload-port /dev/cu.usbmodemXXX`
   - 失敗時は `./tools/upload_loop.sh /dev/cu.usbmodemXXX` を使用
   - `./tools/upload_loop.sh` 単体実行も可（最初に見つかった `usbmodem` を使用）

4. 起動確認
   - `pio device monitor -b 115200 -p /dev/cu.usbmodemXXX` で `IP` を取得
   - `curl http://<IP>:8080/ping`
   - `curl "http://<IP>:8080/status"`

5. 音声/miotts 確認（必要時）
   - `curl "http://<IP>:8080/miotts?probe=1&quick=1&verbose=1"`
   - `curl "http://<IP>:8080/miotts?speak=%E3%81%8A%E3%81%AF%E3%82%88%E3%81%86&quick=1"`
   - 失敗時は 8081 ループバック (`/diag`) も確認し、ネットワーク条件を見直す

## 重要ルール

- `atom-s3r-tamagotchi/.pio/` は `.gitignore` で除外済み。追跡しないこと。
- `.git` に入れないファイル:
  - ビルド成果物（`.pio/`）
  - USB デバイス由来のログや一時ファイル
- `kMiottsHostDefaultOverride` を変更する場合は、同時に README の設定値も更新する。
- 新しい起動/運用手順は `atom-s3r-tamagotchi/README.md` に反映してからコミット。

## 進行テンプレート（新規担当者用）

1. `pio run` が通ることを確認
2. 書き込み
3. `ping` と `status` が 200 を返すことを確認
4. `miotts probe` が成功することを確認
