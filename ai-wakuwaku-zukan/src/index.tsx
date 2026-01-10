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
    createdAt: row.created_at,
    isFavorite: row.is_favorite === 1
  }))
  return c.json(transformed)
})

// 画像削除
app.delete('/api/images/:id', async (c) => {
  const id = c.req.param('id')

  // お気に入りチェック
  const { results } = await c.env.DB.prepare('SELECT is_favorite, image_url FROM Images WHERE id = ?').bind(id).all()
  if (results.length === 0) {
    return c.json({ error: 'Image not found' }, 404)
  }

  const image = results[0] as any
  if (image.is_favorite === 1) {
    return c.json({ error: 'お気に入りの画像は削除できません', code: 'FAVORITE_PROTECTED' }, 400)
  }

  // R2から画像を削除
  try {
    const urlPath = new URL(image.image_url).pathname
    const key = urlPath.split('/').pop()
    if (key) {
      await c.env.BUCKET.delete(key)
    }
  } catch (e) {
    console.error('Failed to delete from R2:', e)
  }

  // DBから削除
  await c.env.DB.prepare('DELETE FROM Images WHERE id = ?').bind(id).run()

  return c.json({ ok: true })
})

// お気に入りトグル
app.post('/api/images/:id/favorite', async (c) => {
  const id = c.req.param('id')

  // 現在の状態を取得
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
  const { categoryId } = await c.req.json()

  // 画像の存在確認
  const { results: imageResults } = await c.env.DB.prepare('SELECT id FROM Images WHERE id = ?').bind(id).all()
  if (imageResults.length === 0) {
    return c.json({ error: 'Image not found' }, 404)
  }

  // カテゴリーの存在確認
  const { results: catResults } = await c.env.DB.prepare('SELECT id, name FROM Categories WHERE id = ?').bind(categoryId).all()
  if (catResults.length === 0) {
    return c.json({ error: 'Category not found' }, 404)
  }

  // カテゴリーを更新
  await c.env.DB.prepare('UPDATE Images SET category_id = ? WHERE id = ?').bind(categoryId, id).run()

  const category = catResults[0] as { id: number; name: string }
  return c.json({ categoryId: category.id, categoryName: category.name })
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

    const normalizeRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
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

  // カテゴリーマッピング (キーワードベース - ひらがな＋漢字両方)
  const categoryKeywords: Record<string, string[]> = {
    'どうぶつ': ['きりん', 'らいおん', 'ぱんだ', 'ぺんぎん', 'くま', 'ぞう', 'うさぎ', 'ねこ', 'いぬ', 'とり', 'さる', 'うま', 'うし', 'ぶた', 'ひつじ', 'やぎ', 'しか', 'きつね', 'たぬき', 'りす', 'ねずみ', 'かば', 'さい', 'わに', 'かめ', 'へび', 'とかげ', 'かえる', 'いるか', 'くじら', 'さめ', 'たこ', 'いか', 'かに', 'えび', 'さかな', 'こあら', 'かんがるー', '動物', '犬', '猫', '鳥', '魚'],
    'のりもの': ['しょうぼうしゃ', 'ぱとかー', 'でんしゃ', 'ひこうき', 'ばす', 'くるま', 'じてんしゃ', 'ばいく', 'ふね', 'へりこぷたー', 'ろけっと', 'きゅうきゅうしゃ', 'たくしー', 'とらっく', 'しんかんせん', 'しょべるかー', 'だんぷかー', 'くれーん', 'かーきゃりあ', 'きゃりあかー', 'れっかーしゃ', 'みきさーしゃ', 'ごみしゅうしゅうしゃ', 'はたらくくるま', '消防車', '救急車', '電車', '飛行機', '新幹線', '自転車', '自動車', '車', 'パトカー', 'バス', 'トラック'],
    'たべもの': ['いちご', 'ばなな', 'おにぎり', 'かれー', 'めろん', 'りんご', 'みかん', 'ぶどう', 'すいか', 'もも', 'さくらんぼ', 'ぱん', 'けーき', 'あいす', 'らーめん', 'すし', 'ぴざ', 'はんばーぐ', 'やさい', 'にんじん', 'とまと', 'きゅうり', 'きゃべつ', 'たまねぎ', '食べ物', '果物', '野菜', 'ラーメン', 'カレー'],
    'むし': ['かぶとむし', 'ちょうちょ', 'とんぼ', 'ばった', 'あり', 'くわがた', 'せみ', 'はち', 'てんとうむし', 'かまきり', 'こおろぎ', 'ほたる', 'かたつむり', '昆虫', '虫', '蝶', '蜂'],
    'おはな': ['ちゅーりっぷ', 'さくら', 'あさがお', 'ひまわり', 'たんぽぽ', 'ばら', 'ゆり', 'すみれ', 'こすもす', 'あじさい', 'つばき', 'もみじ', 'はな', '花', '桜', '植物'],
    'がっこう': ['えんぴつ', 'けしごむ', 'のーと', 'らんどせる', 'つくえ', 'いす', 'こくばん', 'ちょーく', 'じょうぎ', 'はさみ', 'のり', 'くれよん', 'えのぐ', 'ふでばこ', 'きょうかしょ', 'たいいくかん', 'こうてい', 'ぷーる', 'おんがくしつ', '学校', '鉛筆', 'ノート', '机', '椅子'],
  }

  try {
      const { results } = await c.env.DB.prepare('SELECT name, id FROM Categories').all()
      const promptNormalized = normalizeForSearch(prompt)

      // キーワードマッチングでカテゴリーを探す（正規化して比較）
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

      // マッチしなかった場合はGemini APIで推論
      if (!matched) {
          const categories = results.map((r: any) => r.name).join(', ')
          const catPrompt = `
あなたは子供向け図鑑アプリのカテゴリー分類AIです。
「${prompt}」を最も適切なカテゴリーに分類してください。

【重要な分類ルール】
- 車の名前・車種名（シエンタ、プリウス、アルファード、N-BOX、フィット等）→「のりもの」
- 電車の名前（はやぶさ、のぞみ、こまち等）→「のりもの」
- 飛行機の名前（ボーイング、ジャンボ等）→「のりもの」
- 働く車（消防車、救急車、パトカー、ショベルカー等）→「のりもの」

カテゴリー一覧:
- どうぶつ: 動物、生き物（犬、猫、象、魚、鳥、恐竜など）
- のりもの: 乗り物全般（車、車種名、電車、飛行機、バス、トラック、船、バイク、働く車など）
- たべもの: 食べ物、飲み物（果物、野菜、料理、お菓子など）
- むし: 昆虫（カブトムシ、蝶々、バッタなど）
- おはな: 植物、花（チューリップ、桜、ひまわりなど）
- がっこう: 学校用品（鉛筆、ノート、ランドセルなど）
- その他: 上記に当てはまらないもの

回答は必ずJSON形式: { "category": "カテゴリー名" }
          `

          const catRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  contents: [{ parts: [{ text: catPrompt }] }],
                  generationConfig: { responseMimeType: "application/json" }
              })
          })

          const catData = await catRes.json()
          console.log(`[Category] Gemini raw response:`, JSON.stringify(catData).slice(0, 500))
          // @ts-ignore
          const catText = catData.candidates?.[0]?.content?.parts?.[0]?.text
          console.log(`[Category] Gemini parsed text: ${catText}`)
          if (catText) {
              try {
                  const parsed = JSON.parse(catText)
                  if (parsed.category) {
                      categoryName = parsed.category
                      console.log(`[Category] Gemini classified as: ${categoryName}`)
                  }
              } catch (parseErr) {
                  console.error(`[Category] JSON parse error:`, parseErr)
              }
          } else {
              console.log(`[Category] Gemini returned no text, falling back to "その他"`)
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
