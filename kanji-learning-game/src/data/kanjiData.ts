// 文科省 学年別漢字配当表 (平成29年改訂)
// https://www.mext.go.jp/a_menu/shotou/new-cs/youryou/syo/koku/001.htm

export interface KanjiEntry {
  kanji: string;
  grade: number;
  readings: {
    onyomi: string[];
    kunyomi: string[];
  };
  meanings: string[];
  examples: { word: string; reading: string; meaning: string }[];
}

// 学年別漢字リスト
export const GRADE_1_KANJI = '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
export const GRADE_2_KANJI = '引羽雲園遠何科夏家歌画回会海絵外角楽活間丸岩顔汽記帰弓牛魚京強教近兄形計元言原戸古午後語工公広交光考行高黄合谷国黒今才細作算止市矢姉思紙寺自時室社弱首秋週春書少場色食心新親図数西声星晴切雪船線前組走多太体台地池知茶昼長鳥朝直通弟店点電刀冬当東答頭同道読内南肉馬売買麦半番父風分聞米歩母方北毎妹万明鳴毛門夜野友用曜来里理話';
export const GRADE_3_KANJI = '悪安暗医委意育員院飲運泳駅央横屋温化荷界開階寒感漢館岸起期客究急級宮球去橋業曲局銀区苦具君係軽血決研県庫湖向幸港号根祭皿仕死使始指歯詩次事持式実写者主守取酒受州拾終習集住重宿所暑助昭消商章勝乗植申身神真深進世整昔全相送想息速族他打対待代第題炭短談着注柱丁帳調追定庭笛鉄転都度投豆島湯登等動童農波配倍箱畑発反坂板皮悲美鼻筆氷表秒病品負部服福物平返勉放味命面問役薬由油有遊予羊洋葉陽様落流旅両緑礼列練路和';
export const GRADE_4_KANJI = '愛案以衣位囲胃印英栄塩億加果貨課芽改械害街各覚完官管関観願希季紀喜旗器機議求泣救給挙漁共協鏡競極訓軍郡径型景芸欠結建健験固功好候航康告差菜最材昨札刷殺察参産散残士氏史司試児治辞失借種周祝順初松笑唱焼象照賞臣信成省清静席積折節説浅戦選然争倉巣束側続卒孫帯隊達単置仲貯兆腸低底停的典伝徒努灯堂働特得毒熱念敗梅博飯飛費必票標不夫付府副粉兵別辺変便包法望牧末満未脈民無約勇要養浴利陸良料量輪類令冷例歴連老労録';
export const GRADE_5_KANJI = '圧移因永営衛易益液演応往桜恩可仮価河過賀快解格確額刊幹慣眼基寄規技義逆久旧居許境均禁句群経潔件券険検限現減故個護効厚耕鉱構興講混査再災妻採際在財罪雑酸賛支志枝師資飼示似識質舎謝授修述術準序招承証条状常情織職制性政勢精製税責績接設舌絶銭祖素総造像増則測属率損退貸態団断築張提程適敵統銅導徳独任燃能破犯判版比肥非備俵評貧布婦富武復複仏編弁保墓報豊防貿暴務夢迷綿輸余預容略留';
export const GRADE_6_KANJI = '異遺域宇映延沿我灰拡革閣割株干巻看簡危机揮貴疑吸供胸郷勤筋系敬警劇激穴絹権憲源厳己呼誤后孝皇紅降鋼刻穀骨困砂座済裁策冊蚕至私姿視詞誌磁射捨尺若樹収宗就衆従縦縮熟純処署諸除将傷障城蒸針仁垂推寸盛聖誠宣専泉洗染善奏窓創装層操蔵臓存尊宅担探誕段暖値宙忠著庁頂潮賃痛展討党糖届難乳認納脳派拝背肺俳班晩否批秘腹奮並陛閉片補暮宝訪亡忘棒枚幕密盟模訳郵優幼欲翌乱卵覧裏律臨朗論';

// 漢字の読み・意味データ（漢検対応）
export const kanjiDetails: Record<string, Omit<KanjiEntry, 'kanji' | 'grade'>> = {
  // 1年生
  '一': { readings: { onyomi: ['イチ', 'イツ'], kunyomi: ['ひと', 'ひと-つ'] }, meanings: ['one', '一つ'], examples: [{ word: '一人', reading: 'ひとり', meaning: '一人' }, { word: '一月', reading: 'いちがつ', meaning: '1月' }] },
  '右': { readings: { onyomi: ['ウ', 'ユウ'], kunyomi: ['みぎ'] }, meanings: ['right'], examples: [{ word: '右手', reading: 'みぎて', meaning: '右手' }] },
  '雨': { readings: { onyomi: ['ウ'], kunyomi: ['あめ', 'あま'] }, meanings: ['rain'], examples: [{ word: '大雨', reading: 'おおあめ', meaning: '大雨' }] },
  '円': { readings: { onyomi: ['エン'], kunyomi: ['まる', 'まる-い'] }, meanings: ['circle', 'yen'], examples: [{ word: '円形', reading: 'えんけい', meaning: '円形' }] },
  '王': { readings: { onyomi: ['オウ'], kunyomi: [] }, meanings: ['king'], examples: [{ word: '王様', reading: 'おうさま', meaning: '王様' }] },
  '音': { readings: { onyomi: ['オン', 'イン'], kunyomi: ['おと', 'ね'] }, meanings: ['sound'], examples: [{ word: '音楽', reading: 'おんがく', meaning: '音楽' }] },
  '下': { readings: { onyomi: ['カ', 'ゲ'], kunyomi: ['した', 'しも', 'もと', 'さ-げる', 'くだ-る'] }, meanings: ['below', 'down'], examples: [{ word: '下手', reading: 'へた', meaning: '下手' }] },
  '火': { readings: { onyomi: ['カ'], kunyomi: ['ひ', 'ほ'] }, meanings: ['fire'], examples: [{ word: '火曜日', reading: 'かようび', meaning: '火曜日' }] },
  '花': { readings: { onyomi: ['カ'], kunyomi: ['はな'] }, meanings: ['flower'], examples: [{ word: '花火', reading: 'はなび', meaning: '花火' }] },
  '貝': { readings: { onyomi: ['バイ'], kunyomi: ['かい'] }, meanings: ['shellfish'], examples: [{ word: '貝がら', reading: 'かいがら', meaning: '貝殻' }] },
  '学': { readings: { onyomi: ['ガク'], kunyomi: ['まな-ぶ'] }, meanings: ['study', 'learning'], examples: [{ word: '学校', reading: 'がっこう', meaning: '学校' }] },
  '気': { readings: { onyomi: ['キ', 'ケ'], kunyomi: [] }, meanings: ['spirit', 'mind', 'air'], examples: [{ word: '天気', reading: 'てんき', meaning: '天気' }] },
  '九': { readings: { onyomi: ['キュウ', 'ク'], kunyomi: ['ここの', 'ここの-つ'] }, meanings: ['nine'], examples: [{ word: '九月', reading: 'くがつ', meaning: '9月' }] },
  '休': { readings: { onyomi: ['キュウ'], kunyomi: ['やす-む', 'やす-まる'] }, meanings: ['rest'], examples: [{ word: '休日', reading: 'きゅうじつ', meaning: '休日' }] },
  '玉': { readings: { onyomi: ['ギョク'], kunyomi: ['たま'] }, meanings: ['ball', 'jewel'], examples: [{ word: '玉入れ', reading: 'たまいれ', meaning: '玉入れ' }] },
  '金': { readings: { onyomi: ['キン', 'コン'], kunyomi: ['かね', 'かな'] }, meanings: ['gold', 'money'], examples: [{ word: '金曜日', reading: 'きんようび', meaning: '金曜日' }] },
  '空': { readings: { onyomi: ['クウ'], kunyomi: ['そら', 'あ-く', 'から'] }, meanings: ['sky', 'empty'], examples: [{ word: '空気', reading: 'くうき', meaning: '空気' }] },
  '月': { readings: { onyomi: ['ゲツ', 'ガツ'], kunyomi: ['つき'] }, meanings: ['moon', 'month'], examples: [{ word: '月曜日', reading: 'げつようび', meaning: '月曜日' }] },
  '犬': { readings: { onyomi: ['ケン'], kunyomi: ['いぬ'] }, meanings: ['dog'], examples: [{ word: '子犬', reading: 'こいぬ', meaning: '子犬' }] },
  '見': { readings: { onyomi: ['ケン'], kunyomi: ['み-る', 'み-える', 'み-せる'] }, meanings: ['see', 'look'], examples: [{ word: '見学', reading: 'けんがく', meaning: '見学' }] },
  '五': { readings: { onyomi: ['ゴ'], kunyomi: ['いつ', 'いつ-つ'] }, meanings: ['five'], examples: [{ word: '五月', reading: 'ごがつ', meaning: '5月' }] },
  '口': { readings: { onyomi: ['コウ', 'ク'], kunyomi: ['くち'] }, meanings: ['mouth'], examples: [{ word: '入口', reading: 'いりぐち', meaning: '入口' }] },
  '校': { readings: { onyomi: ['コウ'], kunyomi: [] }, meanings: ['school'], examples: [{ word: '学校', reading: 'がっこう', meaning: '学校' }] },
  '左': { readings: { onyomi: ['サ'], kunyomi: ['ひだり'] }, meanings: ['left'], examples: [{ word: '左手', reading: 'ひだりて', meaning: '左手' }] },
  '三': { readings: { onyomi: ['サン'], kunyomi: ['み', 'み-つ', 'みっ-つ'] }, meanings: ['three'], examples: [{ word: '三月', reading: 'さんがつ', meaning: '3月' }] },
  '山': { readings: { onyomi: ['サン'], kunyomi: ['やま'] }, meanings: ['mountain'], examples: [{ word: '山道', reading: 'やまみち', meaning: '山道' }] },
  '子': { readings: { onyomi: ['シ', 'ス'], kunyomi: ['こ'] }, meanings: ['child'], examples: [{ word: '子ども', reading: 'こども', meaning: '子供' }] },
  '四': { readings: { onyomi: ['シ'], kunyomi: ['よ', 'よ-つ', 'よっ-つ', 'よん'] }, meanings: ['four'], examples: [{ word: '四月', reading: 'しがつ', meaning: '4月' }] },
  '糸': { readings: { onyomi: ['シ'], kunyomi: ['いと'] }, meanings: ['thread'], examples: [{ word: '糸車', reading: 'いとぐるま', meaning: '糸車' }] },
  '字': { readings: { onyomi: ['ジ'], kunyomi: ['あざ'] }, meanings: ['character', 'letter'], examples: [{ word: '文字', reading: 'もじ', meaning: '文字' }] },
  '耳': { readings: { onyomi: ['ジ'], kunyomi: ['みみ'] }, meanings: ['ear'], examples: [{ word: '耳', reading: 'みみ', meaning: '耳' }] },
  '七': { readings: { onyomi: ['シチ'], kunyomi: ['なな', 'なな-つ', 'なの'] }, meanings: ['seven'], examples: [{ word: '七月', reading: 'しちがつ', meaning: '7月' }] },
  '車': { readings: { onyomi: ['シャ'], kunyomi: ['くるま'] }, meanings: ['car', 'vehicle'], examples: [{ word: '自動車', reading: 'じどうしゃ', meaning: '自動車' }] },
  '手': { readings: { onyomi: ['シュ'], kunyomi: ['て', 'た'] }, meanings: ['hand'], examples: [{ word: '手紙', reading: 'てがみ', meaning: '手紙' }] },
  '十': { readings: { onyomi: ['ジュウ', 'ジッ'], kunyomi: ['とお', 'と'] }, meanings: ['ten'], examples: [{ word: '十月', reading: 'じゅうがつ', meaning: '10月' }] },
  '出': { readings: { onyomi: ['シュツ', 'スイ'], kunyomi: ['で-る', 'だ-す'] }, meanings: ['exit', 'leave'], examples: [{ word: '出口', reading: 'でぐち', meaning: '出口' }] },
  '女': { readings: { onyomi: ['ジョ', 'ニョ'], kunyomi: ['おんな', 'め'] }, meanings: ['woman', 'female'], examples: [{ word: '女の子', reading: 'おんなのこ', meaning: '女の子' }] },
  '小': { readings: { onyomi: ['ショウ'], kunyomi: ['ちい-さい', 'こ', 'お'] }, meanings: ['small', 'little'], examples: [{ word: '小学校', reading: 'しょうがっこう', meaning: '小学校' }] },
  '上': { readings: { onyomi: ['ジョウ', 'ショウ'], kunyomi: ['うえ', 'うわ', 'かみ', 'あ-げる', 'のぼ-る'] }, meanings: ['above', 'up'], examples: [{ word: '上手', reading: 'じょうず', meaning: '上手' }] },
  '森': { readings: { onyomi: ['シン'], kunyomi: ['もり'] }, meanings: ['forest'], examples: [{ word: '森林', reading: 'しんりん', meaning: '森林' }] },
  '人': { readings: { onyomi: ['ジン', 'ニン'], kunyomi: ['ひと'] }, meanings: ['person'], examples: [{ word: '日本人', reading: 'にほんじん', meaning: '日本人' }] },
  '水': { readings: { onyomi: ['スイ'], kunyomi: ['みず'] }, meanings: ['water'], examples: [{ word: '水曜日', reading: 'すいようび', meaning: '水曜日' }] },
  '正': { readings: { onyomi: ['セイ', 'ショウ'], kunyomi: ['ただ-しい', 'まさ'] }, meanings: ['correct', 'right'], examples: [{ word: '正月', reading: 'しょうがつ', meaning: '正月' }] },
  '生': { readings: { onyomi: ['セイ', 'ショウ'], kunyomi: ['い-きる', 'う-まれる', 'なま'] }, meanings: ['life', 'birth'], examples: [{ word: '先生', reading: 'せんせい', meaning: '先生' }] },
  '青': { readings: { onyomi: ['セイ', 'ショウ'], kunyomi: ['あお', 'あお-い'] }, meanings: ['blue', 'green'], examples: [{ word: '青空', reading: 'あおぞら', meaning: '青空' }] },
  '夕': { readings: { onyomi: ['セキ'], kunyomi: ['ゆう'] }, meanings: ['evening'], examples: [{ word: '夕方', reading: 'ゆうがた', meaning: '夕方' }] },
  '石': { readings: { onyomi: ['セキ', 'シャク', 'コク'], kunyomi: ['いし'] }, meanings: ['stone'], examples: [{ word: '石ころ', reading: 'いしころ', meaning: '石ころ' }] },
  '赤': { readings: { onyomi: ['セキ', 'シャク'], kunyomi: ['あか', 'あか-い'] }, meanings: ['red'], examples: [{ word: '赤ちゃん', reading: 'あかちゃん', meaning: '赤ちゃん' }] },
  '千': { readings: { onyomi: ['セン'], kunyomi: ['ち'] }, meanings: ['thousand'], examples: [{ word: '千円', reading: 'せんえん', meaning: '千円' }] },
  '川': { readings: { onyomi: ['セン'], kunyomi: ['かわ'] }, meanings: ['river'], examples: [{ word: '川', reading: 'かわ', meaning: '川' }] },
  '先': { readings: { onyomi: ['セン'], kunyomi: ['さき'] }, meanings: ['ahead', 'previous'], examples: [{ word: '先生', reading: 'せんせい', meaning: '先生' }] },
  '早': { readings: { onyomi: ['ソウ', 'サッ'], kunyomi: ['はや-い', 'はや-まる'] }, meanings: ['early', 'fast'], examples: [{ word: '早朝', reading: 'そうちょう', meaning: '早朝' }] },
  '草': { readings: { onyomi: ['ソウ'], kunyomi: ['くさ'] }, meanings: ['grass'], examples: [{ word: '草花', reading: 'くさばな', meaning: '草花' }] },
  '足': { readings: { onyomi: ['ソク'], kunyomi: ['あし', 'た-りる', 'た-す'] }, meanings: ['foot', 'leg'], examples: [{ word: '足音', reading: 'あしおと', meaning: '足音' }] },
  '村': { readings: { onyomi: ['ソン'], kunyomi: ['むら'] }, meanings: ['village'], examples: [{ word: '村人', reading: 'むらびと', meaning: '村人' }] },
  '大': { readings: { onyomi: ['ダイ', 'タイ'], kunyomi: ['おお', 'おお-きい', 'おお-いに'] }, meanings: ['big', 'large'], examples: [{ word: '大人', reading: 'おとな', meaning: '大人' }] },
  '男': { readings: { onyomi: ['ダン', 'ナン'], kunyomi: ['おとこ'] }, meanings: ['man', 'male'], examples: [{ word: '男の子', reading: 'おとこのこ', meaning: '男の子' }] },
  '竹': { readings: { onyomi: ['チク'], kunyomi: ['たけ'] }, meanings: ['bamboo'], examples: [{ word: '竹やぶ', reading: 'たけやぶ', meaning: '竹藪' }] },
  '中': { readings: { onyomi: ['チュウ'], kunyomi: ['なか'] }, meanings: ['middle', 'inside'], examples: [{ word: '中学校', reading: 'ちゅうがっこう', meaning: '中学校' }] },
  '虫': { readings: { onyomi: ['チュウ'], kunyomi: ['むし'] }, meanings: ['insect', 'bug'], examples: [{ word: '虫', reading: 'むし', meaning: '虫' }] },
  '町': { readings: { onyomi: ['チョウ'], kunyomi: ['まち'] }, meanings: ['town'], examples: [{ word: '町', reading: 'まち', meaning: '町' }] },
  '天': { readings: { onyomi: ['テン'], kunyomi: ['あめ', 'あま'] }, meanings: ['heaven', 'sky'], examples: [{ word: '天気', reading: 'てんき', meaning: '天気' }] },
  '田': { readings: { onyomi: ['デン'], kunyomi: ['た'] }, meanings: ['rice field'], examples: [{ word: '田んぼ', reading: 'たんぼ', meaning: '田んぼ' }] },
  '土': { readings: { onyomi: ['ド', 'ト'], kunyomi: ['つち'] }, meanings: ['earth', 'soil'], examples: [{ word: '土曜日', reading: 'どようび', meaning: '土曜日' }] },
  '二': { readings: { onyomi: ['ニ'], kunyomi: ['ふた', 'ふた-つ'] }, meanings: ['two'], examples: [{ word: '二月', reading: 'にがつ', meaning: '2月' }] },
  '日': { readings: { onyomi: ['ニチ', 'ジツ'], kunyomi: ['ひ', 'か'] }, meanings: ['day', 'sun'], examples: [{ word: '日曜日', reading: 'にちようび', meaning: '日曜日' }] },
  '入': { readings: { onyomi: ['ニュウ'], kunyomi: ['い-る', 'い-れる', 'はい-る'] }, meanings: ['enter'], examples: [{ word: '入口', reading: 'いりぐち', meaning: '入口' }] },
  '年': { readings: { onyomi: ['ネン'], kunyomi: ['とし'] }, meanings: ['year'], examples: [{ word: '今年', reading: 'ことし', meaning: '今年' }] },
  '白': { readings: { onyomi: ['ハク', 'ビャク'], kunyomi: ['しろ', 'しら', 'しろ-い'] }, meanings: ['white'], examples: [{ word: '白い', reading: 'しろい', meaning: '白い' }] },
  '八': { readings: { onyomi: ['ハチ'], kunyomi: ['や', 'や-つ', 'やっ-つ', 'よう'] }, meanings: ['eight'], examples: [{ word: '八月', reading: 'はちがつ', meaning: '8月' }] },
  '百': { readings: { onyomi: ['ヒャク'], kunyomi: [] }, meanings: ['hundred'], examples: [{ word: '百円', reading: 'ひゃくえん', meaning: '百円' }] },
  '文': { readings: { onyomi: ['ブン', 'モン'], kunyomi: ['ふみ'] }, meanings: ['writing', 'sentence'], examples: [{ word: '文字', reading: 'もじ', meaning: '文字' }] },
  '木': { readings: { onyomi: ['ボク', 'モク'], kunyomi: ['き', 'こ'] }, meanings: ['tree', 'wood'], examples: [{ word: '木曜日', reading: 'もくようび', meaning: '木曜日' }] },
  '本': { readings: { onyomi: ['ホン'], kunyomi: ['もと'] }, meanings: ['book', 'origin'], examples: [{ word: '本', reading: 'ほん', meaning: '本' }] },
  '名': { readings: { onyomi: ['メイ', 'ミョウ'], kunyomi: ['な'] }, meanings: ['name'], examples: [{ word: '名前', reading: 'なまえ', meaning: '名前' }] },
  '目': { readings: { onyomi: ['モク', 'ボク'], kunyomi: ['め', 'ま'] }, meanings: ['eye'], examples: [{ word: '目', reading: 'め', meaning: '目' }] },
  '立': { readings: { onyomi: ['リツ', 'リュウ'], kunyomi: ['た-つ', 'た-てる'] }, meanings: ['stand'], examples: [{ word: '立つ', reading: 'たつ', meaning: '立つ' }] },
  '力': { readings: { onyomi: ['リョク', 'リキ'], kunyomi: ['ちから'] }, meanings: ['power', 'strength'], examples: [{ word: '力', reading: 'ちから', meaning: '力' }] },
  '林': { readings: { onyomi: ['リン'], kunyomi: ['はやし'] }, meanings: ['grove', 'forest'], examples: [{ word: '林', reading: 'はやし', meaning: '林' }] },
  '六': { readings: { onyomi: ['ロク'], kunyomi: ['む', 'む-つ', 'むっ-つ', 'むい'] }, meanings: ['six'], examples: [{ word: '六月', reading: 'ろくがつ', meaning: '6月' }] },
};

// 学年別漢字配列を取得
export function getKanjiByGrade(grade: number | readonly number[]): string[] {
  const grades = Array.isArray(grade) ? grade : [grade];
  let result = '';

  for (const g of grades) {
    switch (g) {
      case 1: result += GRADE_1_KANJI; break;
      case 2: result += GRADE_2_KANJI; break;
      case 3: result += GRADE_3_KANJI; break;
      case 4: result += GRADE_4_KANJI; break;
      case 5: result += GRADE_5_KANJI; break;
      case 6: result += GRADE_6_KANJI; break;
    }
  }

  return result.split('');
}

// 学年グループの定義
export const GRADE_GROUPS = {
  'grade1-3': { label: '1〜3年生', grades: [1, 2, 3] },
  'grade4': { label: '4年生', grades: [4] },
  'grade5': { label: '5年生', grades: [5] },
  'grade6': { label: '6年生', grades: [6] },
} as const;

export type GradeGroupKey = keyof typeof GRADE_GROUPS;
