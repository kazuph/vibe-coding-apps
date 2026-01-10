import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { basicAuth } from 'hono/basic-auth'
import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'

// @ts-ignore - Workers Sites manifest (JSON string)
import manifestStr from '__STATIC_CONTENT_MANIFEST'
const manifest = JSON.parse(manifestStr)

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  GEMINI_API_KEY: string
  BASIC_AUTH_USER: string
  BASIC_AUTH_PASSWORD: string
  __STATIC_CONTENT: KVNamespace
}

const app = new Hono<{ Bindings: Bindings }>()

// Basic認証 (全リクエストに適用)
app.use('*', async (c, next) => {
  const authMiddleware = basicAuth({
    username: c.env.BASIC_AUTH_USER,
    password: c.env.BASIC_AUTH_PASSWORD,
  })
  return authMiddleware(c, next)
})

app.use('*', async (c, next) => {
    console.log(`[Request] ${c.req.method} ${c.req.path}`)
    await next()
})

app.use('/api/*', cors())

// ユーザー同期 (ログイン)
app.post('/api/sync', async (c) => {
    // 実際はここでユーザー登録確認などを行うが、
    // 今回はクライアント側でPassphraseを持つだけでDBには画像保存時に作成する運用にする
    // (もしくはここで作成)
    return c.json({ ok: true })
})

// カテゴリー取得
app.get('/api/categories', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Categories ORDER BY is_default DESC, id ASC').all()
  return c.json(results)
})

// 履歴取得 (全ユーザー共有)
app.get('/api/history', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM Images ORDER BY created_at DESC').all()
  // DB列名(snake_case)をフロントエンド用(camelCase)に変換
  const transformed = results.map((row: any) => ({
    id: row.id,
    prompt: row.prompt,
    imageUrl: row.image_url,
    category: row.category_name,
    categoryId: row.category_id,
    createdAt: row.created_at
  }))
  return c.json(transformed)
})

// 画像生成
app.post('/api/generate', async (c) => {
  const userId = 'default' // シングルユーザーモード
  const { prompt: rawPrompt } = await c.req.json()
  const apiKey = c.env.GEMINI_API_KEY

  if (!apiKey) return c.json({ error: 'API Key not configured' }, 500)

  // 0. プロンプトを正規化 (Geminiで主要な名詞だけを抽出)
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

    const normalizeRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: normalizePrompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    })

    const normalizeData = await normalizeRes.json()
    // @ts-ignore
    const normalizeText = normalizeData.candidates?.[0]?.content?.parts?.[0]?.text
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
    // 失敗した場合は元のプロンプトを使用
  }

  // 1. デフォルトユーザー確認・作成
  const user = await c.env.DB.prepare('SELECT id FROM Users WHERE id = ?').bind(userId).first()
  if (!user) {
      await c.env.DB.prepare('INSERT INTO Users (id) VALUES (?)').bind(userId).run()
  }

  // 2. カテゴリー推論 (ルールベース + Geminiフォールバック)
  let categoryId = null
  let categoryName = 'その他'

  // カテゴリーマッピング (キーワードベース)
  const categoryKeywords: Record<string, string[]> = {
    'どうぶつ': ['きりん', 'らいおん', 'ぱんだ', 'ぺんぎん', 'くま', 'ぞう', 'うさぎ', 'ねこ', 'いぬ', 'とり', 'さる', 'うま', 'うし', 'ぶた', 'ひつじ', 'やぎ', 'しか', 'きつね', 'たぬき', 'りす', 'ねずみ', 'かば', 'さい', 'わに', 'かめ', 'へび', 'とかげ', 'かえる', 'いるか', 'くじら', 'さめ', 'たこ', 'いか', 'かに', 'えび', 'さかな', 'こあら', 'かんがるー'],
    'のりもの': ['しょうぼうしゃ', 'パトカー', 'でんしゃ', 'ひこうき', 'バス', 'くるま', 'じてんしゃ', 'バイク', 'ふね', 'ヘリコプター', 'ロケット', 'きゅうきゅうしゃ', 'タクシー', 'トラック', 'しんかんせん', 'ショベルカー', 'ダンプカー', 'クレーン'],
    'たべもの': ['いちご', 'バナナ', 'おにぎり', 'カレー', 'メロン', 'りんご', 'みかん', 'ぶどう', 'すいか', 'もも', 'さくらんぼ', 'パン', 'ケーキ', 'アイス', 'ラーメン', 'すし', 'ピザ', 'ハンバーグ', 'やさい', 'にんじん', 'トマト', 'きゅうり', 'キャベツ', 'たまねぎ'],
    'むし': ['かぶとむし', 'ちょうちょ', 'とんぼ', 'ばった', 'あり', 'くわがた', 'せみ', 'はち', 'てんとうむし', 'かまきり', 'こおろぎ', 'ほたる', 'かたつむり'],
    'おはな': ['チューリップ', 'さくら', 'あさがお', 'ひまわり', 'たんぽぽ', 'ばら', 'ゆり', 'すみれ', 'コスモス', 'あじさい', 'つばき', 'もみじ', 'はな'],
    'がっこう': ['えんぴつ', 'けしごむ', 'ノート', 'ランドセル', 'つくえ', 'いす', 'こくばん', 'チョーク', 'じょうぎ', 'はさみ', 'のり', 'クレヨン', 'えのぐ', 'ふでばこ', 'きょうかしょ', 'たいいくかん', 'こうてい', 'プール', 'おんがくしつ'],
  }

  try {
      const { results } = await c.env.DB.prepare('SELECT name, id FROM Categories').all()
      const promptLower = prompt.toLowerCase()

      // キーワードマッチングでカテゴリーを探す
      let matched = false
      for (const [catName, keywords] of Object.entries(categoryKeywords)) {
          for (const keyword of keywords) {
              if (promptLower.includes(keyword.toLowerCase())) {
                  categoryName = catName
                  matched = true
                  break
              }
          }
          if (matched) break
      }

      // マッチしなかった場合はGemini APIで推論
      if (!matched) {
          const categories = results.map((r: any) => r.name).join(', ')
          const catPrompt = `
            "${prompt}"を次のカテゴリーのどれかに分類してください: [${categories}]
            必ず次のJSON形式で回答: { "category": "カテゴリー名" }
            カテゴリー名は必ず上記リストから選んでください。
          `

          const catRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  contents: [{ parts: [{ text: catPrompt }] }],
                  generationConfig: { responseMimeType: "application/json" }
              })
          })

          const catData = await catRes.json()
          // @ts-ignore
          const catText = catData.candidates?.[0]?.content?.parts?.[0]?.text
          console.log(`[Category] Gemini response: ${catText}`)
          if (catText) {
              const parsed = JSON.parse(catText)
              categoryName = parsed.category
          }
      }

      console.log(`[Category] "${prompt}" -> "${categoryName}"`)

      // カテゴリーID解決
      const existingCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind(categoryName).first()
      if (existingCat) {
          categoryId = existingCat.id
      } else {
          // 存在しないカテゴリーの場合は「その他」にフォールバック
          const otherCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind('その他').first()
          if (otherCat) {
              categoryId = otherCat.id
              categoryName = 'その他'
          }
      }
  } catch (e) {
      console.error('Category inference failed', e)
      // エラー時は「その他」
      const otherCat = await c.env.DB.prepare('SELECT id FROM Categories WHERE name = ?').bind('その他').first()
      if (otherCat) {
          categoryId = otherCat.id
      }
  }

  // 3. 画像生成 (Gemini 2.5 Flash Image Preview)
  // プロンプト加工 (文字なし)
  const enhancedPrompt = `A high-quality, clear illustration for a children's educational picture book of: ${prompt}. Use realistic and natural colors based on real life. Avoid neon or overly bright artificial colors. Soft, clean illustration style with an authentic and educational appearance. Plain off-white background. No text, no letters, no signature, no watermark.`

  const imgRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: enhancedPrompt }] }],
        generationConfig: { responseModalities: ['IMAGE'] } // TEXT, IMAGE ? API depends.
        // Note: gemini-pro-vision etc uses specific params. 
        // Assuming Imagen-like or Gemini multimodal generation.
        // If 2.5 flash supports image gen via generateContent, it returns base64 inlineData.
      })
  })
  
  if (!imgRes.ok) {
      const err = await imgRes.text()
      console.error(err)
      return c.json({ error: 'Image generation failed' }, 500)
  }

  const imgData = await imgRes.json()
  // @ts-ignore
  const base64 = imgData.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data

  if (!base64) return c.json({ error: 'No image data' }, 500)

  // 4. R2保存
  const imageId = crypto.randomUUID()
  const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  
  await c.env.BUCKET.put(`${imageId}.png`, buffer, {
      httpMetadata: { contentType: 'image/png' }
  })
  
  const imageUrl = `/images/${imageId}.png`

  // 5. DB保存
  await c.env.DB.prepare(
      'INSERT INTO Images (id, user_id, prompt, image_url, category_id, category_name) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(imageId, userId, prompt, imageUrl, categoryId, categoryName).run()

  return c.json({
      id: imageId,
      prompt,
      imageUrl,
      category: categoryName,
      categoryId
  })
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

    // Default to index.html for root
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
      // Try index.html for SPA routing
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
