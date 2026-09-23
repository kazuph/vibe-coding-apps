// エリアのプリセットと解説（出典付き）
export const AREAS = [
  { id: 'station', name: '🚉 新潟駅 万代広場', target: [-25, -50], dist: 250, az: 205, el: 30, info: 'bandai' },
  { id: 'south', name: '🚌 駅 高架・南口', target: [40, 60], dist: 520, az: 20, el: 32, info: 'station' },
  { id: 'bandai', name: '🌉 萬代橋・万代', target: [-640, -700], dist: 760, az: 150, el: 30, info: 'bandaibashi' },
  { id: 'toki', name: '🏢 朱鷺メッセ・万代島', target: [-150, -1440], dist: 820, az: 205, el: 26, ty: 30, info: 'bandaijima' },
  { id: 'hakusan', name: '🎭 りゅーとぴあ・白山', target: [-1880, -190], dist: 640, az: 150, el: 32, info: 'ryutopia' },
  { id: 'all', name: '🗺 全体', target: [-850, -650], dist: 3300, az: 200, el: 48, info: 'about' },
];

const src = (items) => `<p style="margin-top:10px;font-size:12px;color:var(--sub)">出典</p><ul style="font-size:12px">${items.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${t}</a></li>`).join('')}</ul>`;
const M = '<span class="badge b-m">実測</span>', P = '<span class="badge b-p">計画</span>', E = '<span class="badge b-e">推定</span>', O = '<span class="badge b-o">公表値</span>';
const CITY = ['新潟市「万代広場の整備」', 'https://www.city.niigata.lg.jp/kurashi/doro/ekisyu/ekimaehiroba/ekishu_bandai.html'];
const PLAN = ['新潟市「(仮称)新潟駅万代広場整備計画」令和2年10月 (PDF)', 'https://www.city.niigata.lg.jp/kurashi/doro/ekisyu/ekimaehiroba/bandai_seibikeikaku.files/seibikeikaku.pdf'];
const PLATEAU = ['国土交通省 Project PLATEAU 新潟市 2023年度 3D都市モデル', 'https://www.geospatial.jp/ckan/dataset/plateau-15100-niigata-shi-2023'];

export const INFO = {
  about: { html: `<h2>このマップについて</h2>
    <p>工事中の新潟駅（万代広場は <b>2027年春</b> 全面供用予定）の完成形と、万代島・白山エリアを1つの3D空間で見られるようにしたものです。</p>
    <ul>
      <li>${M} 既存建物: PLATEAU（航空測量による建物の外形と実測高さ。主要部は屋根形状まで反映した LOD2）</li>
      <li>${P} オレンジのラベル: 新潟市の公式図・完成イメージから再現した計画要素</li>
      <li>${E} 寸法が公表されていないもの（上屋やデッキの高さなど）は推定値で、パネルに明記しています</li>
      <li>道路・川・鉄道・橋の位置: OpenStreetMap（半透明オレンジの帯は OSM 上の計画道路: 新潟駅西線・新潟駅東線・万代島ルート線など）</li>
    </ul>
    <p style="font-size:12px;color:var(--sub)">建物をクリックすると、PLATEAU の実測高さを表示します。</p>
    ${src([PLATEAU, ['© OpenStreetMap contributors (ODbL)', 'https://www.openstreetmap.org/copyright'], CITY])}` },

  bandai: { html: `<h2>万代広場（新潟駅 北口）</h2>
    <div class="meta">${P} 全面供用 2027年4月予定 ・ 約18,500㎡（旧広場の約2倍）</div>
    <p>コンセプトは「都市の庭」。水色の上屋で信濃川・阿賀野川・潟を表し、中央の芝生広場のまわりに築山の「8つのステージ（里山）」を放射状に並べています。</p>
    <ul>
      <li><b>東エリア</b>: バス乗降場とシェルター（2024年3月完成）。駅直下のバスターミナル（約4,000㎡・全18乗り場）につながります</li>
      <li><b>西エリア</b>: タクシーのりば、送迎待機、トイレとガラス屋根（2026年3月までに完成）。一般車整理場は整備準備中</li>
      <li><b>中央エリア</b>: ガラス屋根・造園・舗装を工事中（2026年8月末時点）</li>
      <li>ペデストリアンデッキの中央大屋根は 2024年10月末に完成</li>
    </ul>
    <p style="font-size:12.5px">${E} 上屋の高さ 5.2m（設計条件「歩行空間 3.2m以上・バス車道 4.7m以上」から推定）、円形ユニットの径 約11m、デッキ床高 7m、大屋根 15.5m、築山の高さ 0.9m は推定値です。平面配置は市のエリア区分図を実座標に合わせて置いたもので、±5〜10m ほどずれている可能性があります。</p>
    ${src([CITY, PLAN, ['新潟市 駅周辺整備 検討委員会 第8回 資料（上屋の設計条件）', 'https://www.city.niigata.lg.jp/shisei/gyoseiunei/sonota/fuzokukikankonwakai/konwakai/sonota/toshiseisaku/ekiseibi/ekishukentouiinkai.files/dai8_05siryou1.pdf'], ['新潟交通 新潟駅バスのりば案内 (PDF)', 'https://www.niigata-kotsu.co.jp/~noriai/news/infomation/2024/files/new_noriba.pdf']])}` },
  east: { html: `<h2>東エリア（バス乗降場）</h2><div class="meta">${P} 2024年3月完成</div>
    <p>東大通から入ったバスが、広場東側の車路を通って駅直下バスターミナルへ向かいます。円形のガラス屋根ユニットを樹状の柱で支える上屋がつらなり、施工面積は 2,072㎡（丸運建設 施工実績）です。</p>
    ${src([CITY, ['丸運建設 施工実績（東エリア バスシェルター）', 'https://www.maruun.co.jp/works/3512/']])}` },
  west: { html: `<h2>西エリア（タクシー・一般車）</h2><div class="meta">${P} タクシーのりば 2026年2月供用 ・ 一般車整理場は準備中</div>
    <p>タクシープール、タクシーのりば、送迎の待機場、一般車の降車場をまとめたエリアです。バス・タクシー・一般車の動線を分けて計画されています。</p>
    <p style="font-size:12.5px">${E} 車両は配置のイメージで、区画数は公表されていません。</p>${src([CITY, PLAN])}` },
  central: { html: `<h2>中央エリア（8つのステージ）</h2><div class="meta">${P} 工事中 → 2027年春</div>
    <p>中央の芝生広場のまわりに、植栽のある築山のステージを並べます。駅舎側には大屋根の下のイベント空間（約1,000㎡）が一体となり、芝生広場は約250㎡です（中間報告）。</p>
    <p style="font-size:12.5px">${E} 築山の高さと樹木の数・種類はイメージです。</p>${src([CITY, PLAN])}` },
  toilet: { html: `<h2>トイレ・西側ガラス屋根</h2><div class="meta">${P} 2026年4月1日 供用開始</div>
    <p>白い格子状のガラス屋根の下に公衆トイレがあります。</p><p style="font-size:12.5px">${E} 屋根の形と高さは完成写真とエリア区分図から推定しています。</p>${src([CITY])}` },
  deck: { html: `<h2>ペデストリアンデッキ・中央大屋根</h2><div class="meta">${P} 大屋根 2024年10月完成 ・ デッキ 2026年4月供用</div>
    <p>駅2階のコンコースと広場・周辺の街をつなぐデッキです。中央に大屋根と昇降棟（階段・エスカレーター・エレベーター）を設けています。</p>
    <p style="font-size:12.5px">${E} 大屋根の平面寸法と高さは公表されていないため、完成写真をもとにした概略形状です。</p>${src([CITY])}` },
  lift: { html: `<h2>中央昇降棟</h2><div class="meta">${P}</div><p>デッキと広場の地上レベルをつなぐ、階段・エスカレーター・エレベーターの棟です。</p>${src([CITY])}` },
  station: { html: `<h2>新潟駅（高架駅）</h2><div class="meta">${M} 駅舎・高架は PLATEAU 実測 ・ ${O} JR東日本建築設計</div>
    <ul>
      <li>在来線 約2.5km を高架化。2022年6月5日に全線が高架になりました</li>
      <li>在来線は3面5線（1〜5番線）、新幹線は3面4線（11〜14番線）で、どちらも3階。5番線「いなほ」と11番線「とき」は同じホームで乗り換えられます</li>
      <li>駅舎は地上3階、建築面積 30,069㎡、延床面積 53,626㎡</li>
      <li>高架下の商業施設 CoCoLo新潟 は 2024年4月25日にグランドオープン</li>
      <li>南口広場（約14,000㎡）は平成21年度に完成済み。高架下交通広場は約4,400㎡</li>
    </ul>
    <p style="font-size:12.5px">${E} 高架橋（線路）の高さ 12.5〜13.5m は推定です。レール面の高さは公表資料で確認できませんでした。</p>
    ${src([['新潟市 連続立体交差事業', 'https://www.city.niigata.lg.jp/kurashi/doro/ekisyu/renzoku/renritsu.html'], ['JR東日本建築設計 新潟駅', 'https://www.jred.co.jp/projects/p172.html'], ['Wikipedia「新潟駅」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E9%A7%85'], PLATEAU])}` },
  south: { html: `<h2>南口広場</h2><div class="meta">${M} 建物は PLATEAU ・ ${O} 平成21年度完成</div>
    <p>約14,000㎡。東側のロータリーがバスターミナル、西側がタクシー・一般車の乗降場で、その間の南口中央広場（約1,350㎡）はけやきの「緑の屋根」に覆われています。</p>
    <p>今後は国と市が南口に「バスタ新潟」（約6,000㎡、上部に集客施設）を整備する計画で、2030年代中頃の完成を目指しています（このマップには未反映）。</p>
    ${src([['新潟市 整備計画 (PDF)', 'https://www.city.niigata.lg.jp/kurashi/doro/ekisyu/ekimaehiroba/bandai_seibikeikaku.files/seibikeikaku.pdf'], ['国土交通省 北陸地方整備局 新潟駅交通ターミナル', 'https://www.hrr.mlit.go.jp/niikoku/now/niigata_transportationterminal/pdf/260309plan.pdf']])}` },
  busterminal: { html: `<h2>駅直下バスターミナル（高架下交通広場）</h2><div class="meta">${O} 2024年3月31日開業 ・ 約4,400㎡</div>
    <p>高架の下を南北に抜けるバスターミナルで、乗り場は全部で18あります（1〜4番: 万代口側 / 5〜10・15〜18番: 高架下 / 11〜14番: 南口側）。南北方向の一方通行の車路が2本あり、一般車は進入できません。</p>
    ${src([['新潟交通 新潟駅バスのりば案内 (PDF)', 'https://www.niigata-kotsu.co.jp/~noriai/news/infomation/2024/files/new_noriba.pdf'], CITY])}` },
  bandaieast: { html: `<h2>万代口東地区の開発（JR東日本）</h2><div class="meta">${P} 2026年5月着工 → 2028年夏開業予定</div>
    <ul><li>オフィス棟: 地上14階・高さ約59m</li><li>住宅棟: 地上10階・高さ約31m・103戸</li><li>敷地 約4,500㎡、延床 約21,600㎡。駅のデッキとオフィス棟をデッキで結ぶ計画</li></ul>
    <p style="font-size:12.5px">${E} 棟の配置は公表されていないため、建物は置かず、敷地（旧在来線仮設ホーム跡地と推定）の輪郭だけを表示しています。</p>
    ${src([['Impress Watch（2026年）', 'https://www.watch.impress.co.jp/docs/news/2109874.html']])}` },
  iconic: { html: `<h2>アイコニックタワー新潟ステーション</h2><div class="meta">${O} 高さ 103.85m ・ 30階 ・ 2025年6月竣工</div>
    <p>PLATEAU 2023年度データの後に竣工したため、OpenStreetMap の外形に公表されている高さを当てはめて補っています。併設のオフィス棟（10階・42.70m）と駐車場棟（8階・29.99m）は外形データがないため省略しています。</p>
    ${src([['超高層ビル・都市データ skyskysky', 'https://skyskysky.net/construction/202573.html']])}` },

  bandaibashi: { html: `<h2>萬代橋</h2><div class="meta">${O} 国の重要文化財（2004年指定）・ 1929年竣工（3代目）</div>
    <ul><li>全長 306.9m、幅員 21.9m</li><li>鉄筋コンクリートの6連アーチ（径間 39.0 / 41.5 / 42.4 / 42.4 / 41.5 / 39.0m）</li><li>御影石 約9,000個を張った外観。鋳鉄製の照明灯10基を復元</li></ul>
    <p style="font-size:12.5px">${E} 位置と外形は OSM。アーチのライズと桁の高さは推定です。</p>
    ${src([['Wikipedia「萬代橋」', 'https://ja.wikipedia.org/wiki/%E8%90%AC%E4%BB%A3%E6%A9%8B']])}` },
  ryuto: { html: `<h2>柳都大橋</h2><div class="meta">${O} 2002年5月19日 開通</div><p>橋長 212.1m、幅員 40m の3径間連続PC箱桁橋。萬代橋の約350m下流にあります。</p>${src([['Wikipedia「柳都大橋」', 'https://ja.wikipedia.org/wiki/%E6%9F%B3%E9%83%BD%E5%A4%A7%E6%A9%8B']])}` },
  showa: { html: `<h2>昭和大橋</h2><div class="meta">${O} 1964年完成</div><p>長さ 303.9m、幅員 24.8m の12径間鋼鈑桁橋。完成した年の新潟地震で5径間が落ちました。</p>${src([['Wikipedia「昭和大橋 (新潟市)」', 'https://ja.wikipedia.org/wiki/%E6%98%AD%E5%92%8C%E5%A4%A7%E6%A9%8B_(%E6%96%B0%E6%BD%9F%E5%B8%82)']])}` },
  mediaship: { html: `<h2>新潟日報メディアシップ</h2><div class="meta">${M} PLATEAU ・ ${O} 地上20階・最頂部105m ・ 2013年</div><p>コンセプトは「現代の北前船」。南面は帆をモチーフにした緩やかな曲面で、20階に展望室「そらの広場」があります。</p>${src([['Wikipedia「新潟日報メディアシップ」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E6%97%A5%E5%A0%B1%E3%83%A1%E3%83%87%E3%82%A3%E3%82%A2%E3%82%B7%E3%83%83%E3%83%97'], PLATEAU])}` },

  bandaijima: { html: `<h2>万代島ビル（朱鷺メッセ）</h2><div class="meta">${M} PLATEAU ・ ${O} 地上31階・最高部140.5m ・ 2003年</div>
    <ul><li>31階（地上125m）に無料の展望室「Befcoばかうけ展望室」</li><li>ホテル日航新潟: 客室は22〜30階</li><li>5階に新潟県立万代島美術館</li><li>設計: 槇総合計画事務所（マスターアーキテクト）・鹿島</li></ul>
    ${src([['Wikipedia「朱鷺メッセ」', 'https://ja.wikipedia.org/wiki/%E6%9C%B1%E9%B7%BA%E3%83%A1%E3%83%83%E3%82%BB'], ['槇総合計画事務所', 'https://www.maki-and-associates.co.jp/projects/NBP?lang=ja'], PLATEAU])}` },
  tokimesse: { html: `<h2>朱鷺メッセ 新潟コンベンションセンター</h2><div class="meta">${M} PLATEAU ・ ${O} 地上4階・延床 31,434㎡ ・ 2003年全面開業</div>
    <ul><li>展示ホール「ウェーブマーケット」: 7,800㎡（130m×60m）、柱なし、天井高 最大25.5m</li><li>メインホール「スノーホール」: 1,133㎡</li><li>国際会議室「マリンホール」: 649㎡の円形ホール</li><li>佐渡汽船ターミナルへの連絡デッキ（全長 220m）は2016年に全区間開通</li></ul>
    ${src([['朱鷺メッセ 施設案内', 'https://www.tokimesse.com/sponsor/guide/wavemarket.html'], ['槇総合計画事務所', 'https://www.maki-and-associates.co.jp/projects/NBP?lang=ja'], PLATEAU])}` },
  sado: { html: `<h2>佐渡汽船 新潟港ターミナル</h2><div class="meta">${M} PLATEAU</div><p>佐渡（両津）へのカーフェリー・ジェットフォイルが発着します。待合室と改札は3階。朱鷺メッセとは連絡デッキでつながっています。</p>${src([PLATEAU])}` },

  ryutopia: { html: `<h2>りゅーとぴあ（新潟市民芸術文化会館）</h2><div class="meta">${M} PLATEAU ・ ${O} 1998年開館 ・ 設計 長谷川逸子</div>
    <ul><li>「タマゴ形」の平面をガラスのダブルスキンで包んだ外観（DPG工法）</li><li>コンサートホール（2階・約1,900〜2,000席）、劇場（868〜903席）、能楽堂（5階）</li><li>SRC造、地下1階・地上6階、延床 25,099㎡</li><li>駐車場の屋上を「空中庭園」にして、ペデストリアンデッキで白山公園・やすらぎ堤とつないでいます</li></ul>
    ${src([['りゅーとぴあ 屋外施設', 'https://www.ryutopia.or.jp/information/facility/outside/'], ['Wikipedia「新潟市民芸術文化会館」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E5%B8%82%E6%B0%91%E8%8A%B8%E8%A1%93%E6%96%87%E5%8C%96%E4%BC%9A%E9%A4%A8'], PLATEAU])}` },
  kenmin: { html: `<h2>新潟県民会館</h2><div class="meta">${M} PLATEAU ・ ${O} 1967年開館 ・ 設計 佐藤武夫</div><p>RC造（一部鉄骨）で地下2階・地上4階。大ホール1,730席、小ホール300席。高さ20mの記念塔があります。</p>${src([['新潟県民会館', 'https://www.niigata-kenminkaikan.jp/information/about/'], PLATEAU])}` },
  onbun: { html: `<h2>新潟市音楽文化会館</h2><div class="meta">${M} PLATEAU ・ ${O} 1977年開館</div><p>RC造5階建てで、ホールは530席です。</p>${src([['Wikipedia「新潟市音楽文化会館」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E5%B8%82%E9%9F%B3%E6%A5%BD%E6%96%87%E5%8C%96%E4%BC%9A%E9%A4%A8'], PLATEAU])}` },
  kensei: { html: `<h2>新潟県政記念館</h2><div class="meta">${M} PLATEAU ・ ${O} 国の重要文化財 ・ 1883年</div><p>木造2階建ての擬洋風建築で、正面幅 43.7m。2022年12月から2028年3月まで、耐震工事のため休館しています。</p>${src([['Wikipedia「新潟県政記念館」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E7%9C%8C%E6%94%BF%E8%A8%98%E5%BF%B5%E9%A4%A8'], PLATEAU])}` },
  hakusan: { html: `<h2>白山神社</h2><div class="meta">${M} PLATEAU</div><p>新潟の総鎮守。本殿は正保4年（1647）の竣工です。</p>${src([['白山神社 由緒', 'https://www.niigatahakusanjinja.or.jp/about/yuisho.html']])}` },
  rikujo: { html: `<h2>新潟市陸上競技場</h2><div class="meta">${O} 1936年開場</div><p>400m×8レーン、収容 約18,671人。信濃川を埋め立てた土地にあります。</p>${src([['Wikipedia「新潟市陸上競技場」', 'https://ja.wikipedia.org/wiki/%E6%96%B0%E6%BD%9F%E5%B8%82%E9%99%B8%E4%B8%8A%E7%AB%B6%E6%8A%80%E5%A0%B4']])}` },
  hakusanpark: { html: `<h2>白山公園</h2><div class="meta">${O} 1873年開園 ・ 国の名勝（2018年）</div><p>日本で最初期の都市公園の一つ。東にひょうたん池、西に蓮池があります。りゅーとぴあや県民会館とはデッキでつながっています。</p>${src([['新潟市「白山公園」', 'https://www.city.niigata.lg.jp/kanko/bunka/rekishi/bunkazai/shokai/hakusankoen.html']])}` },
};
