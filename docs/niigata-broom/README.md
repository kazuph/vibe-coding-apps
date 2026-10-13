# ほうきで新潟 — 新潟市中央区フライト

マイクラ風（ボクセル）に再現した新潟市中央区の上空を、魔法のほうきで飛び回るフライトシミュレーターです。
街のあちこちに置いたリングをくぐって、**コンプリート率**（くぐったリングの割合）とポイントを集めます。勝ち負けや時間制限はありません。

- デモ: https://kazuph.github.io/vibe-coding-apps/niigata-broom/
- スマホ対応（画面下の中央にジョイスティック）。PC は矢印キー / WASD、`C` でカメラ切替、`T` で天気切替

## 遊び方

| 要素 | 内容 |
|---|---|
| 速さ | 常に一定（時速約 150km）。加速リングをくぐった直後だけ約 2.3 倍 |
| 操作 | ジョイスティックは下に引くと上昇・上に倒すと下降（飛行機の操縦桿と同じ向き）、左右で旋回。下に引き続けると宙返り（キーボードは ↑ で上昇）（約 6 秒で 1 周、半径約 42m）。手を離すと背中が空を向くように自動で戻る |
| 金のリング（36 個） | 名所のポイント（萬代橋・朱鷺メッセ・NEXT21・新潟駅・りゅーとぴあ・新潟県庁・ビッグスワン・鳥屋野潟・マリンピア日本海・日和山 など） |
| 水色のリング（23 個） | 加速リング。信濃川・海岸線・鳥屋野潟に沿って連なる |
| ピンクのリング（24 個） | 宙返りコース。縦の円に 8 個ずつ（鳥屋野潟・やすらぎ堤・日本海の 3 か所） |
| 左上 | マップ（北が上。タップで全体図、区界は点線） |
| 右上 | ポイント・コンプリート率・天気／カメラ／記録／メニュー |
| 上中央 | いちばん近い未通過リングの方向と距離 |
| 記録 | くぐったリングと日時・ポイント・飛行距離・飛行時間・回数をブラウザの `localStorage`（キー `niigata-broom:v1`）に保存。記録画面から消去可 |

### 天気

晴れ / くもり / 雨 / 雷雨（稲光と雷鳴）/ 雪（屋根や地面に積雪）/ 霧 / 夕焼け（佐渡の方角に沈む太陽）/ 夜（ビルの窓明かり・星・月）に加え、
**いまの新潟**を選ぶと Open-Meteo から新潟市の現在の天気を取得し、実際の太陽の高さ（現在時刻から計算）で空の色を合わせます。

## 使ったオープンデータ

| 再現したもの | データ | 提供元・ライセンス |
|---|---|---|
| 建物の形・高さ・用途（約 16.5 万棟） | 3D都市モデル **Project PLATEAU 新潟市 2023年度**（CityGML。LOD1 の外形と計測高さ `measuredHeight`、用途 `usage`。LOD2 がある約 3,000 棟は屋根面ごとの高さ） | 国土交通省 [PLATEAU](https://www.mlit.go.jp/plateau/)（[G空間情報センター](https://www.geospatial.jp/ckan/dataset/plateau-15100-niigata-shi-2023)）。[PLATEAU Site Policy](https://www.mlit.go.jp/plateau/site-policy/)（CC BY 4.0 相当）に従い出典を表示 |
| 地面の高さ・海岸線（砂丘など） | **国土地理院 標高タイル**（DEM5A / DEM5B / DEM10B。標高が無いセルを海として判定） | [国土地理院 地理院タイル](https://maps.gsi.go.jp/development/ichiran.html)（出典: 国土地理院） |
| 遠景の山（佐渡島・弥彦山・角田山・五頭連峰・飯豊連峰） | **国土地理院 標高タイル**（DEM10B, ズーム 11） | 同上 |
| 川・潟・池（信濃川・関屋分水・鳥屋野潟・通船川など） | **OpenStreetMap** の `natural=water` / `waterway=riverbank` | © OpenStreetMap contributors（[ODbL](https://www.openstreetmap.org/copyright)） |
| 道路・鉄道・橋・防波堤 | **OpenStreetMap** の `highway=*`・`railway=rail`・`bridge=yes`・`man_made=breakwater/groyne/pier` | 同上 |
| 公園・林・田んぼ・砂浜・運動場・工業地 | **OpenStreetMap** の `leisure=*`・`landuse=*`・`natural=wood/beach/sand` | 同上 |
| 中央区の区界（マップの点線） | **OpenStreetMap** の行政界リレーション（`boundary=administrative` 中央区） | 同上 |
| リングの位置（名所の座標） | **OpenStreetMap** の名称付き地物（萬代橋・朱鷺メッセ・NEXT21 ほか） | 同上 |
| 「いまの新潟」の天気 | **Open-Meteo** Forecast API（`weather_code`・`is_day`・`cloud_cover`・気温） | [Open-Meteo](https://open-meteo.com/)（CC BY 4.0、非商用は API キー不要） |

OSM と PLATEAU の取得日は 2026年10月13日です。

## デフォルメしているところ

- 1 ブロック = 8m（横も縦も）。建物の高さは 8m 単位に丸め、PLATEAU の用途が「不明」の建物は高さから住宅・マンション・ビルを推定して色を付けています。屋根や壁の色は架空です。
- 川・海の水面は陸より 1 ブロック低い位置に揃えています（実際の標高差ではありません）。
- 木は OSM の林・公園・草地にランダムに植えています（実在の木の位置ではありません）。海に近い林は松にしています。
- 遠景は、中心から 9km より遠い所を 0.45 倍に縮め、高さを 1.5 倍に強調しています（佐渡が実際より近く大きく見えます）。
- リングの高さは周りの建物より上になるよう自動で決めています。

## ファイル構成

```
index.html        画面（HUD・タイトル・記録）
js/main.js        飛行・カメラ・入力・ミニマップ・記録の保存・効果音
js/world.js       ボクセル地形と建物のメッシュ化（上面は貪欲法でまとめる）・ブロック模様のシェーダー・水面
js/sky.js         空・雲・雨/雪・雷・天気プリセット・太陽位置・Open-Meteo
js/rings.js       リングの配置・描画・通過判定
js/broom.js       魔女と黒猫のボクセルモデル・きらきらの軌跡
data/near.bin.gz  中央区 1375×1400 セル（8m）: 地面の高さ・材質・建物の高さ・用途・建物番号・区内フラグ
data/far.bin.gz   遠景 440×440 セル（200m、距離圧縮済み）の高さ
data/ward.json    中央区の区界
tools/            データの再生成スクリプト
```

## データの再生成

作業用ディレクトリで `tools/` のスクリプトを順に実行します（Python 3 + numpy + Pillow）。

1. `python3 download_plateau.py` … PLATEAU の zip（約 4.3GB）から中央区の建物 GML 112 ファイルだけを HTTP Range で取得（約 90MB）
2. `python3 parse_plateau.py` … 外形・高さ・用途・LOD2 屋根面を `bldg.pkl` に
3. `python3 fetch_dem.py` … 国土地理院の標高タイルを `dem/` に
4. `sh fetch_osm.sh` … Overpass API で `q.txt` の地物を `osm_raw.json` に
5. `python3 build.py out` … `out/near.bin.gz`・`out/far.bin.gz`・`out/ward.json` を作る

## クレジット

- 3D都市モデル: 国土交通省 Project PLATEAU（新潟市 2023年度）
- 標高: 国土地理院 標高タイル
- 地図データ: © OpenStreetMap contributors
- 天気: Open-Meteo.com（CC BY 4.0）
- 3D 描画: three.js / フォント: DotGothic16（Google Fonts, SIL OFL）
