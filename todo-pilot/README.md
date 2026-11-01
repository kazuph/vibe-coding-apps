# とどパイロット

```sh
npm install
npm run dev
```

## 地図と音声

地図生成とボクセル描画は、kazuph 氏の [ほうきでニッポン](https://github.com/kazuph/vibe-coding-apps/tree/main/docs/niigata-broom) を参考にしています。新潟市中央区の作成済み地図に、空港を中心とした 5.12 km 四方の地図を接続しました。地図は横・縦 8 m 単位で簡略化しています。建物は国土交通省 Project PLATEAU 新潟市 2023 年度データ、地形は国土地理院の標高タイル、道路・水域などは OpenStreetMap に基づきます。空港周辺の追加部分の建物等は OpenFreeMap / OpenMapTiles が配信する OpenStreetMap データに基づき、建物の高さがない場合は推定しています。色、描画や飛行場の調整はゲーム向けです。遠景は距離が圧縮されています。

- 出典: 国土交通省 [Project PLATEAU 新潟市](https://www.geospatial.jp/ckan/dataset/plateau-15100-niigata-shi-2023)
- 国土地理院の[標高タイル](https://maps.gsi.go.jp/development/ichiran.html)を加工して作成
- 地図データ: [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) / [OpenFreeMap](https://openfreemap.org/) / OpenMapTiles

日本語音声は [sanoTTS-jp](https://github.com/ayutaz/sanoTTS-jp) をブラウザ上で動作させています。モデルおよび辞書の条件・帰属表示は `public/voice/` にあります。モデルと辞書は初回取得後に Cache Storage に保存されます。


音声の利用条件（LICENSE-MODEL.md §3.2）

本モデルが生成した音声の利用には、次の禁止事項を課します。

> 【禁止事項】
> ■人を批判・攻撃すること。（「批判・攻撃」の定義は、つくよみちゃんキャラクターライセンスに準じます）
> ■特定の政治的立場・宗教・思想への賛同または反対を呼びかけること。
> ■刺激の強い表現をゾーニングなしで公開すること。
> ■他者に対して二次利用（素材としての利用）を許可する形で公開すること。

LICENSE-MODEL.md §3.3 により、本モデルまたは派生物の再配布先にも、この条件を課します。
