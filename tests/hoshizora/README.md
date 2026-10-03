# 今夜の空 — 位置・方位の検証

対象ベース: `e4f4d9a7b6c80b15a3aebf14ee1180c2bd9c203e`（PR #47）。

## 指摘と修正

|重要度|問題|根拠・影響|修正|
|---|---|---|---|
|P1|横画面補正の符号が逆|画面角±90°で右・上の基底が反転し、画像が180°回転|自然姿勢からの画面回転を逆回転で補償|
|P1|iOSの磁北を真北として使用|WebKitは`CLHeading.magneticHeading`を渡す。WMM2025で2026-10-03の偏角は新潟−8.7473°、Sydney +12.8262°、New York −12.4643°|位置・現在日時からWMM2025を計算し真方位へ補正|
|P1|北基準のない相対姿勢を受理|`absolute=false`、コンパスなしでも任意のalphaから北を決めていた|絶対姿勢か有効なiOSコンパス校正のみ採用。欠損gamma/非有限値/精度無効の値は採用しない|
|P2|iOS直立時にコンパスをカメラ方位と推測|Appleの基準は縦持ちの上端。直立・反り返りでの切替は実機未検証|平らな姿勢で校正し、傾けた後はその補正を保持。初回は平らに持つ案内|
|P2|大気屈折なし|標準大気の見かけ位置との差が地平線付近で39.41分角|Sæmundssonの標準大気補正を恒星・天体・天の川へ適用|
|P2|極付近で不正確な一次歳差近似|Polarisの純粋な歳差誤差は26.75年で0.9591分角、100年で13.0123分角|IAU1976の3回転。天の川も同じ元期変換|
|P2|南半球・西経を北緯・東経と表示|計算への符号は正しいが観測地表示が誤る|南緯/西経と絶対値で表示|

UTC変換、東経正の符号、平均恒星時、赤経赤緯→東北天頂の向き、月の視差補正の方向に大きな誤りは見つからなかった。UIの選択肢は「いま」と「端末ローカル日付の21:00」。日時・観測地の自由入力UIは元から存在しない。観測地はGPS、取得不可なら表示付きの新潟概略値。JST固定にはせず、HUDに端末のタイムゾーンと「端末の時刻」を明示した。

## 独立比較の条件

Python Skyfield 1.55 + NASA/JPL DE421、PyERFA 2.0.1.5を使用。アプリのSchlyter計算・座標変換を参照計算へ転用していない。

- 8地点: 新潟 (37.916,139.036)、Sydney (−33.8688,151.2093)、New York (40.7128,−74.006)、Greenwich (51.4779,0)、赤道の東経180°/西経180°、北極/南極。標高0m。
- 27 UTC時刻: J2000、2024うるう日日付境界、2025→2026年境界、2026年3/6/9/12月21日の0/6/12/18時、2026-10-03の11:59:59/12:00:00/14:59:59/15:00:00、2030夏至、2050年初。各時刻の正確な値は`generate-reference.py`とfixtureに保存。
- 恒星146個 + 太陽・月・水星・金星・火星・木星・土星の7天体 = **33,048方向**。
- 恒星はアプリのJ2000座標をSkyfieldへ入力して変換を独立検証。**独立カタログの検証ではなく、固有運動も含まない。** 恒星の以下の数値を実星の絶対精度と解釈しない。
- SkyfieldはJPL光行時間、光行差、章動、歳差、WGS84観測者を使用。屈折なしと標準大気（10°C、1010hPa）の両方を保存。
- 誤差は方位の単純な差ではなく、単位ベクトル間の球面離角。天頂・極で方位が不定になる問題を避ける。見かけ位置の比較は両実装でモデルが利用できる**参照幾何高度≥−1°**に限定。
- 730歳差ケース: 146星×J2000から−100,0,26.75,50,100年をERFA `pmat76`と比較。
- NOAA公式の12 WMM2025ベクトルを、地表/100km・2025.0/2027.5・北/赤道/南で独立照合。公表丸め精度（磁場0.1nT、偏角0.01°）内で一致。

### 同条件の最大誤差（2026年分、分角）

修正前のソースを`git show e4f4d9a:docs/hoshizora/astro.js`で取り出し、同一fixture・同一比較器で再実行。各行の最大値を取るサンプルは前後で異なる場合がある。

|比較|対象|修正前|修正後|
|---|---|---:|---:|
|屈折なし|恒星変換|1.1680|0.4946|
|屈折なし|月|2.5414|2.5414|
|屈折なし|惑星の最大（土星）|1.4400|1.4400|
|標準大気の見かけ位置|恒星変換|39.4094|0.6904|
|標準大気の見かけ位置|月|39.0103|2.5264|
|標準大気の見かけ位置|土星|37.9993|1.4634|

元PRの非公開4地点×4時刻をそのまま再現したものではない。独自の条件で、元PRの「恒星1.2分角/月4.8分角/惑星1.5分角」の**2026年・同じJ2000カタログ・屈折なし**の主張を支持する結果。一方、2000–2050年へ広げると木星は2050年に2.2853分角なので、全年代に1.5分角以内とは言えない。旧Polarisの2050年離角は3.5531分角、修正後の全恒星変換最大は0.9197分角。IAU1976への変更後はERFA歳差との差が全730ケースで1e−7分角未満。

`review-results.json`に参照暦SHA256、各指標の最大となった日時/地点/天体、前後の生の値を保存している。

## 再実行

リポジトリルートから:

```sh
npm --prefix tests/hoshizora ci
npm --prefix tests/hoshizora run build
npm --prefix tests/hoshizora run check
npm --prefix tests/hoshizora test
npm --prefix tests/hoshizora run test:e2e
node tests/hoshizora/compare.cjs
```

既存のこの静的ページにはlint/test/buildの設定がなかった。`check`は外部JS・インラインJSの構文検査、`build`は磁気計算の静的ファイルの再現生成、`test`はNode組み込みランナーによる回帰テスト9件。GitHub Pagesは従来どおり`docs/`を公開する。別アプリの依存やビルドは変更していない。

E2Eは既存Chrome、ローカルポート18764を使用。20件（5操作系列×4画面/時差設定）で、UTCデスクトップ1440×900、Pixel7/JST、iPhone15/New York、iPhone15横/JSTを検証。スクリーンショットとJSON結果は`.artifacts/hoshizora/`。JS例外、ボタン/ドラッグ、時刻切替、GPS、符号表示、合成DeviceOrientationイベントの校正/拒否/縦横基底を確認。端末ローカル21時は別途UTC/JST日付境界・New Yorkの夏時間開始/終了もテスト。

参照fixtureの再生成には`skyfield==1.55`と`pyerfa==2.0.1.5`をPython環境へ入れ、[DE421](https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp)をローカルに取得して:

```sh
python tests/hoshizora/generate-reference.py /path/to/de421.bsp
```

JPLファイルSHA256: `a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`。巨大な暦ファイル自体はリポジトリへ追加しない。回帰テストは保存fixtureでオフライン実行できる。

## 精度・検証範囲の限界

- **スマホ実機のコンパス・Safari・屋外の実星照合は未実施。** ChromeのiPhone画面/合成イベントでの成功は実機精度の証明ではない。局所磁場や磁気センサーの誤差はWMMで除けない。
- iOSは画面を上にして平らに校正する。既存の−15°境界を左右の平らさにも適用した操作上の受付範囲であり、実機で精度を保証する閾値ではない。絶対センサーはW3C定義の真北基準を前提とする。
- WMM2025の有効期間は2025–2029年。以後はモデル更新が必要。有効範囲外やNOAAの水平磁場2000nT未満では推測の北を表示せず、手動操作を案内する。新規APIや外部サービス、位置送信は追加していない。
- 恒星カタログは丸めた固定J2000座標のまま。固有運動、年周光行差、章動をアプリの恒星位置には追加していない。
- 太陽系は元のSchlyter近似暦。UTCをUT1として扱い、惑星光行時間などを明示補正しない。月は球形地球/海面の観測者。誤差を上記の条件で測った上で維持している。
- 屈折は標準気象での近似。実際の地平線付近は温度・気圧・地形に依存する。−1°未満の淡い地中表示は連続描画のための外挿で、見かけ高度の精度を主張しない。

## 一次資料

- [USNO: 恒星時と東経正](https://aa.usno.navy.mil/faq/GAST)
- [Schlyter: 軌道要素・摂動・月の視差](https://stjarnhimlen.se/comp/ppcomp.html)
- [Skyfield: 見かけ位置・座標系・大気屈折](https://rhodesmill.org/skyfield/positions.html)
- [JPL: 惑星・月暦](https://ssd.jpl.nasa.gov/planets/eph_export.html)
- [ERFA: IAU1976歳差行列](https://github.com/liberfa/erfa/blob/master/src/pmat76.c)
- [W3C DeviceOrientation](https://www.w3.org/TR/orientation-event/)、[Screen Orientation](https://www.w3.org/TR/screen-orientation/)
- [WebKit: magneticHeadingを渡す実装](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/ios/WebCoreMotionManager.mm)
- [Apple: headingOrientation](https://developer.apple.com/documentation/corelocation/cllocationmanager/headingorientation)、[magneticHeading](https://developer.apple.com/documentation/corelocation/clheading/magneticheading)
- [NOAA/BGS WMM2025](https://www.ncei.noaa.gov/products/world-magnetic-model)、[公式テスト値](https://www.ncei.noaa.gov/sites/default/files/2025-02/WMM2025_TEST_VALUES.txt)

第三者コード: geomagnetism 0.2.0 / Apache-2.0、ライセンスは`docs/hoshizora/vendor/geomagnetism-LICENSE.txt`。生成エントリーは`compass-entry.cjs`。WMM係数はNOAA/BGSの公有データ。生成物は可読形式、追加通信なし。
