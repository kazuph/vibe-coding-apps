import { Hono } from 'hono'
import { cors } from 'hono/cors'
// Basic認証は廃止 → Cloudflare Access に移行済み
import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'

// @ts-ignore - Workers Sites manifest (JSON string)
import manifestStr from '__STATIC_CONTENT_MANIFEST'
const manifest = JSON.parse(manifestStr)

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  GEMINI_API_KEY: string
  __STATIC_CONTENT: KVNamespace
}

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image-preview'

function geminiUrl(model: string, apiKey: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
}

async function callGeminiText(model: string, apiKey: string, prompt: string): Promise<string | null> {
  const res = await fetch(geminiUrl(model, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) return null
  const data: any = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
}

// カタカナをひらがなに変換（検索用正規化）
function katakanaToHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

// 検索用に正規化（カタカナ→ひらがな、小文字化）
function normalizeForSearch(str: string): string {
  return katakanaToHiragana(str).toLowerCase();
}

// DB行をフロントエンド用に変換する共通関数
function transformImageRow(row: any) {
  return {
    id: row.id,
    prompt: row.prompt,
    imageUrl: row.image_url,
    category: row.category_name,
    categoryId: row.category_id,
    createdAt: row.created_at,
    isFavorite: row.is_favorite === 1,
    isPreset: row.is_preset === 1,
    nameJa: row.name_ja || row.prompt,
    nameEn: row.name_en || null,
    nameHiragana: row.name_hiragana || null,
    nameKatakana: row.name_katakana || null,
    nameRomaji: row.name_romaji || null,
    descriptionJa: row.description_ja || null,
    descriptionEn: row.description_en || null,
  }
}

const app = new Hono<{ Bindings: Bindings }>()

// 認証は Cloudflare Access で管理（OTP認証、セッション30日）

app.use('*', async (c, next) => {
    console.log(`[Request] ${c.req.method} ${c.req.path}`)
    await next()
})

app.use('/api/*', cors())

// ユーザー同期 (ログイン)
app.post('/api/sync', async (c) => {
    return c.json({ ok: true })
})

// カテゴリー取得
app.get('/api/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Categories ORDER BY is_default DESC, id ASC').all()
  const transformed = results.map((row: any) => ({
    id: row.id,
    name: row.name,
    nameEn: row.name_en || row.name,
    icon: row.icon,
    isDefault: row.is_default === 1,
  }))
  return c.json(transformed)
})

// 履歴取得 (全ユーザー共有)
app.get('/api/history', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Images ORDER BY created_at DESC').all()
  return c.json(results.map(transformImageRow))
})

// 画像削除
app.delete('/api/images/:id', async (c) => {
  const id = c.req.param('id')

  const { results } = await c.env.DB.prepare('SELECT is_favorite, image_url FROM Images WHERE id = ?').bind(id).all()
  if (results.length === 0) {
    return c.json({ error: 'Image not found' }, 404)
  }

  const image = results[0] as any
  if (image.is_favorite === 1) {
    return c.json({ error: 'お気に入りの画像は削除できません', code: 'FAVORITE_PROTECTED' }, 400)
  }

  try {
    const urlPath = new URL(image.image_url, 'https://dummy').pathname
    const key = urlPath.split('/').pop()
    if (key) {
      await c.env.BUCKET.delete(key)
    }
  } catch (e) {
    console.error('Failed to delete from R2:', e)
  }

  await c.env.DB.prepare('DELETE FROM Images WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// お気に入りトグル
app.post('/api/images/:id/favorite', async (c) => {
  const id = c.req.param('id')

  const { results } = await c.env.DB.prepare('SELECT is_favorite FROM Images WHERE id = ?').bind(id).all()
  if (results.length === 0) {
    return c.json({ error: 'Image not found' }, 404)
  }

  const currentFav = (results[0] as any).is_favorite === 1
  const newFav = currentFav ? 0 : 1

  await c.env.DB.prepare('UPDATE Images SET is_favorite = ? WHERE id = ?').bind(newFav, id).run()

  return c.json({ isFavorite: newFav === 1 })
})

// カテゴリー変更
app.patch('/api/images/:id/category', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const categoryId = body?.categoryId
  if (typeof categoryId !== 'number' || !Number.isInteger(categoryId)) {
    return c.json({ error: 'Invalid categoryId' }, 400)
  }

  const { results: imageResults } = await c.env.DB.prepare('SELECT id FROM Images WHERE id = ?').bind(id).all()
  if (imageResults.length === 0) {
    return c.json({ error: 'Image not found' }, 404)
  }

  const { results: catResults } = await c.env.DB.prepare('SELECT id, name FROM Categories WHERE id = ?').bind(categoryId).all()
  if (catResults.length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }

  await c.env.DB.prepare('UPDATE Images SET category_id = ?, category_name = ? WHERE id = ?').bind(categoryId, (catResults[0] as any).name, id).run()

  const category = catResults[0] as { id: number; name: string }
  return c.json({ categoryId: category.id, categoryName: category.name })
})

// 多言語メタデータ生成（画像生成とは独立）
async function generateMultilingualMetadata(prompt: string, apiKey: string): Promise<{
  name_ja: string; name_en: string; name_hiragana: string;
  name_katakana: string; name_romaji: string;
  description_ja: string; description_en: string;
} | null> {
  try {
    const metaPrompt = `
あなたは子供向け図鑑アプリの多言語データ生成AIです。
「${prompt}」について、以下のJSON形式で回答してください。

{
  "name_ja": "日本語名（漢字可）",
  "name_en": "English name",
  "name_hiragana": "ひらがな読み",
  "name_katakana": "カタカナ読み",
  "name_romaji": "romaji (lowercase)",
  "description_ja": "子供向けの短い説明文（2-3文、ひらがな多め）",
  "description_en": "Short description for children (2-3 sentences)"
}

必ずJSON形式で回答してください。`

    const text = await callGeminiText(GEMINI_MODEL, apiKey, metaPrompt)
    if (!text) return null
    return JSON.parse(text)
  } catch (e) {
    console.error('[Metadata] Generation failed:', e)
    return null
  }
}

// 画像生成
app.post('/api/generate', async (c) => {
  const userId = 'default'
  const body = await c.req.json()
  const rawPrompt = body?.prompt
  if (!rawPrompt || typeof rawPrompt !== 'string' || rawPrompt.length > 500) {
    return c.json({ error: 'Invalid prompt' }, 400)
  }
  const apiKey = c.env.GEMINI_API_KEY

  if (!apiKey) return c.json({ error: 'API Key not configured' }, 500)

  // 0. プロンプトを正規化
  let prompt = rawPrompt
  try {
    const normalizePrompt = `
      子供が図鑑に追加したいものを話しています。
      入力文から、図鑑に登録すべき「もの」の名前だけを抽出してください。

      例:
      - 「働く車のショベルカーを追加して」→「ショベルカー」
      - 「かわいいねこがみたい」→「ねこ」
      - 「お花のチューリップ」→「チューリップ」
      - 「きりんさん」→「きりん」
      - 「赤い消防車」→「しょうぼうしゃ」

      入力: "${rawPrompt}"

      必ず次のJSON形式で回答: { "name": "抽出した名前" }
      名前は必ずひらがな・カタカナで、「〜さん」などの敬称は除去してください。
    `

    const normalizeText = await callGeminiText(GEMINI_MODEL, apiKey, normalizePrompt)
    console.log(`[Normalize] Raw: "${rawPrompt}" -> Response: ${normalizeText}`)

    if (normalizeText) {
      const parsed = JSON.parse(normalizeText)
      if (parsed.name) {
        prompt = parsed.name
        console.log(`[Normalize] Final: "${prompt}"`)
      }
    }
  } catch (e) {
    console.error('[Normalize] Failed, using raw prompt:', e)
  }

  // 1. デフォルトユーザー確認・作成
  const user = await c.env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(userId).first()
  if (!user) {
    await c.env.DB.prepare('INSERT INTO Users (id) VALUES (?)').bind(userId).run()
  }

  // 2. カテゴリー推論 (ルールベース + Geminiフォールバック)
  let categoryId: any = null
  let categoryName = 'その他'

  const categoryKeywords: Record<string, string[]> = {
    'どうぶつ': ['きりん', 'らいおん', 'ぱんだ', 'ぺんぎん', 'くま', 'ぞう', 'うさぎ', 'ねこ', 'いぬ', 'とり', 'さる', 'うま', 'うし', 'ぶた', 'ひつじ', 'やぎ', 'しか', 'きつね', 'たぬき', 'りす', 'ねずみ', 'かば', 'さい', 'わに', 'かめ', 'へび', 'とかげ', 'かえる', 'いるか', 'くじら', 'さめ', 'たこ', 'いか', 'かに', 'えび', 'さかな', 'こあら', 'かんがるー', '動物', '犬', '猫', '鳥', '魚'],
    'のりもの': ['しょうぼうしゃ', 'ぱとかー', 'でんしゃ', 'ひこうき', 'ばす', 'くるま', 'じてんしゃ', 'ばいく', 'ふね', 'へりこぷたー', 'ろけっと', 'きゅうきゅうしゃ', 'たくしー', 'とらっく', 'しんかんせん', 'しょべるかー', 'だんぷかー', 'くれーん', 'れっかーしゃ', 'みきさーしゃ', 'ごみしゅうしゅうしゃ', 'はたらくくるま', '消防車', '救急車', '電車', '飛行機', '新幹線', '自転車', '自動車', '車', 'パトカー', 'バス', 'トラック'],
    'たべもの': ['いちご', 'ばなな', 'おにぎり', 'かれー', 'めろん', 'りんご', 'みかん', 'ぶどう', 'すいか', 'もも', 'さくらんぼ', 'ぱん', 'けーき', 'あいす', 'らーめん', 'すし', 'ぴざ', 'はんばーぐ', 'やさい', 'にんじん', 'とまと', 'きゅうり', 'きゃべつ', 'たまねぎ', '食べ物', '果物', '野菜', 'ラーメン', 'カレー'],
    'むし': ['かぶとむし', 'ちょうちょ', 'とんぼ', 'ばった', 'あり', 'くわがた', 'せみ', 'はち', 'てんとうむし', 'かまきり', 'こおろぎ', 'ほたる', 'かたつむり', '昆虫', '虫', '蝶', '蜂'],
    'おはな': ['ちゅーりっぷ', 'さくら', 'あさがお', 'ひまわり', 'たんぽぽ', 'ばら', 'ゆり', 'すみれ', 'こすもす', 'あじさい', 'つばき', 'もみじ', 'はな', '花', '桜', '植物'],
    'しぜん': ['たいよう', 'にじ', 'やま', 'うみ', 'ほし', 'つき', 'もり', 'かわ', 'ゆき', 'くも', 'あめ', 'かぜ', '太陽', '虹', '山', '海', '星', '月', '森', '川', '雪'],
    'うちゅう': ['ちきゅう', 'かせい', 'もくせい', 'どせい', 'すいせい', 'きんせい', 'うちゅう', 'ぎんが', 'いんせき', 'ぶらっくほーる', '地球', '火星', '木星', '宇宙', '銀河'],
    'がっこう': ['えんぴつ', 'けしごむ', 'のーと', 'らんどせる', 'つくえ', 'いす', 'こくばん', 'ちょーく', 'じょうぎ', 'はさみ', 'のり', 'くれよん', 'えのぐ', 'ふでばこ', 'きょうかしょ', 'たいいくかん', 'こうてい', 'ぷーる', 'おんがくしつ', '学校', '鉛筆', 'ノート', '机', '椅子'],
  }

  try {
    await c.env.DB.prepare('SELECT name, id FROM Categories').all()
    const promptNormalized = normalizeForSearch(prompt)

    let matched = false
    for (const [catName, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (promptNormalized.includes(keyword)) {
          categoryName = catName
          matched = true
          break
        }
      }
      if (matched) break
    }

    if (!matched) {
      const catPrompt = `
あなたは子供向け図鑑アプリのカテゴリー分類AIです。
「${prompt}」を最も適切なカテゴリーに分類してください。

【重要な分類ルール】
- 車の名前・車種名→「のりもの」
- 電車の名前→「のりもの」
- 自然現象（虹、山、海、星等）→「しぜん」
- 宇宙関連（惑星、ロケット等）→「うちゅう」

カテゴリー一覧:
- どうぶつ: 動物、生き物
- のりもの: 乗り物全般
- たべもの: 食べ物、飲み物
- むし: 昆虫
- おはな: 植物、花
- しぜん: 自然現象（虹、山、海、太陽等）
- うちゅう: 宇宙関連（惑星、銀河等）
- がっこう: 学校用品
- その他: 上記に当てはまらないもの

回答は必ずJSON形式: { "category": "カテゴリー名" }`

      const catText = await callGeminiText(GEMINI_MODEL, apiKey, catPrompt)
      console.log(`[Category] Gemini response: ${catText}`)
      if (catText) {
        try {
          const parsed = JSON.parse(catText)
          if (parsed.category) categoryName = parsed.category
        } catch (parseErr) {
          console.error(`[Category] JSON parse error:`, parseErr)
        }
      }
    }

    console.log(`[Category] "${prompt}" -> "${categoryName}"`)

    const existingCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind(categoryName).first()
    if (existingCat) {
      categoryId = existingCat.id
    } else {
      const otherCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind('その他').first()
      if (otherCat) {
        categoryId = otherCat.id
        categoryName = 'その他'
      }
    }
  } catch (e) {
    console.error('Category inference failed', e)
    const otherCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind('その他').first()
    if (otherCat) categoryId = otherCat.id
  }

  // 3. 画像生成 (Nano Banana 2)
  const enhancedPrompt = `A high-quality, clear illustration for a children's educational picture book of: ${prompt}. Use realistic and natural colors based on real life. Avoid neon or overly bright artificial colors. Soft, clean illustration style with an authentic and educational appearance. Plain off-white background. No text, no letters, no signature, no watermark.`

  const imgRes = await fetch(geminiUrl(GEMINI_IMAGE_MODEL, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: enhancedPrompt }] }],
      generationConfig: { responseModalities: ['IMAGE'] }
    })
  })

  if (!imgRes.ok) {
    const err = await imgRes.text()
    console.error(err)
    return c.json({ error: 'Image generation failed' }, 500)
  }

  const imgData: any = await imgRes.json()
  const base64 = imgData.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData?.data

  if (!base64) return c.json({ error: 'No image data' }, 500)

  // 4. R2保存
  const imageId = crypto.randomUUID()
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))

  await c.env.BUCKET.put(`${imageId}.png`, buffer, {
    httpMetadata: { contentType: 'image/png' }
  })

  const imageUrl = `/images/${imageId}.png`

  // 5. 多言語メタデータ生成（画像生成とは独立、失敗してもOK）
  const metadata = await generateMultilingualMetadata(prompt, apiKey)
  console.log(`[Metadata] Generated:`, metadata ? 'OK' : 'FAILED')

  // 6. DB保存
  await c.env.DB.prepare(
    `INSERT INTO Images (id, user_id, prompt, image_url, category_id, category_name,
     name_ja, name_en, name_hiragana, name_katakana, name_romaji, description_ja, description_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    imageId, userId, prompt, imageUrl, categoryId, categoryName,
    metadata?.name_ja ?? prompt,
    metadata?.name_en ?? null,
    metadata?.name_hiragana ?? null,
    metadata?.name_katakana ?? null,
    metadata?.name_romaji ?? null,
    metadata?.description_ja ?? null,
    metadata?.description_en ?? null
  ).run()

  return c.json({
    id: imageId,
    prompt,
    imageUrl,
    category: categoryName,
    categoryId,
    nameJa: metadata?.name_ja ?? prompt,
    nameEn: metadata?.name_en ?? null,
    nameHiragana: metadata?.name_hiragana ?? null,
    nameKatakana: metadata?.name_katakana ?? null,
    nameRomaji: metadata?.name_romaji ?? null,
    descriptionJa: metadata?.description_ja ?? null,
    descriptionEn: metadata?.description_en ?? null,
  })
})

// バックフィルAPI: 既存画像のメタデータを後付け生成
app.post('/api/backfill-metadata', async (c) => {
  const apiKey = c.env.GEMINI_API_KEY
  if (!apiKey) return c.json({ error: 'API Key not configured' }, 500)

  const { results } = await c.env.DB.prepare(
    'SELECT id, prompt FROM Images WHERE name_en IS NULL LIMIT 10'
  ).all()

  let updated = 0
  for (const row of results) {
    const r = row as any
    const metadata = await generateMultilingualMetadata(r.prompt, apiKey)
    if (metadata) {
      await c.env.DB.prepare(
        `UPDATE Images SET name_ja = ?, name_en = ?, name_hiragana = ?, name_katakana = ?,
         name_romaji = ?, description_ja = ?, description_en = ? WHERE id = ?`
      ).bind(
        metadata.name_ja, metadata.name_en, metadata.name_hiragana, metadata.name_katakana,
        metadata.name_romaji, metadata.description_ja, metadata.description_en, r.id
      ).run()
      updated++
    }
  }

  return c.json({ ok: true, updated, remaining: results.length - updated })
})

// 画像配信 (R2)
app.get('/images/:key', async (c) => {
  const key = c.req.param('key')
  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()

  c.header('Content-Type', 'image/png')
  c.header('Cache-Control', 'public, max-age=31536000')
  return c.body(object.body)
})

// Frontend Serving
app.get('/*', async (c) => {
  try {
    const url = new URL(c.req.url)
    let pathname = url.pathname

    if (pathname === '/' || pathname === '') {
      pathname = '/index.html'
    }

    const asset = await getAssetFromKV(
      {
        request: c.req.raw,
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
      },
      {
        ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
        ASSET_MANIFEST: manifest,
        mapRequestToAsset: (request) => {
          const url = new URL(request.url)
          url.pathname = pathname
          return new Request(url.toString(), request)
        },
      }
    )
    return new Response(asset.body, asset)
  } catch (e) {
    if (e instanceof NotFoundError) {
      try {
        const asset = await getAssetFromKV(
          {
            request: c.req.raw,
            waitUntil: (promise) => c.executionCtx.waitUntil(promise),
          },
          {
            ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
            ASSET_MANIFEST: manifest,
            mapRequestToAsset: () => new Request(new URL('/index.html', c.req.url).toString()),
          }
        )
        return new Response(asset.body, asset)
      } catch {
        return c.notFound()
      }
    }
    return c.text('Internal Error', 500)
  }
})

export default app
