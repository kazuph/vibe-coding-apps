#!/usr/bin/env node
/**
 * E2E Script: Seed 20 articles to the blog
 *
 * Usage:
 *   # Local development
 *   BASIC_AUTH_USER=kazuph BASIC_AUTH_PASS=xxx node scripts/seed-articles.js
 *
 *   # Production
 *   BASE_URL=https://blog-admin-kazu-san.workers.dev BASIC_AUTH_USER=kazuph BASIC_AUTH_PASS=xxx node scripts/seed-articles.js
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';
const AUTH_USER = process.env.BASIC_AUTH_USER;
const AUTH_PASS = process.env.BASIC_AUTH_PASS;

if (!AUTH_USER || !AUTH_PASS) {
  console.error('Error: BASIC_AUTH_USER and BASIC_AUTH_PASS environment variables are required');
  process.exit(1);
}

// 20 articles with diverse topics
const articles = [
  {
    title: 'MoonBit入門：関数型プログラミングの新しい選択肢',
    slug: 'moonbit-introduction',
    content: `# MoonBit入門

MoonBitは、WebAssemblyをターゲットとした新しいプログラミング言語です。

## 特徴

- **型安全性**: 強力な型システム
- **パフォーマンス**: WASMへの効率的なコンパイル
- **関数型**: イミュータブルなデータ構造

## サンプルコード

\`\`\`moonbit
fn fibonacci(n: Int) -> Int {
  match n {
    0 => 0
    1 => 1
    _ => fibonacci(n - 1) + fibonacci(n - 2)
  }
}
\`\`\`

MoonBitで新しい開発体験を始めましょう！`
  },
  {
    title: 'Luna UIでモダンなWebアプリを構築する',
    slug: 'luna-ui-modern-web',
    content: `# Luna UIでモダンなWebアプリを構築する

Luna UIは、MoonBit向けのUIフレームワークです。

## Island Architecture

Luna UIは「Island Architecture」を採用しています：

- サーバーサイドレンダリング（SSR）
- 部分的なハイドレーション
- 高速な初期ロード

## コンポーネント例

\`\`\`moonbit
fn button(label: String, onClick: () -> Unit) -> DomNode {
  div(class="btn", on=events().click(fn(_) { onClick() }), [
    text(label)
  ])
}
\`\`\`

パフォーマンスとDXを両立させましょう。`
  },
  {
    title: 'Cloudflare Workersで高速なエッジコンピューティング',
    slug: 'cloudflare-workers-edge',
    content: `# Cloudflare Workersで高速なエッジコンピューティング

エッジでコードを実行することで、ユーザーに近い場所でレスポンスを返せます。

## メリット

1. **低レイテンシ**: 世界中のエッジロケーション
2. **スケーラビリティ**: 自動スケーリング
3. **コスト効率**: 使った分だけ課金

## D1データベース

\`\`\`sql
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
\`\`\`

グローバルに展開するアプリを簡単に構築できます。`
  },
  {
    title: 'WebAssemblyの未来とMoonBit',
    slug: 'wasm-future-moonbit',
    content: `# WebAssemblyの未来とMoonBit

WebAssemblyは、ブラウザだけでなくサーバーサイドでも活用が広がっています。

## WASI（WebAssembly System Interface）

WASIにより、WASMはサンドボックス化されたシステムアクセスが可能に：

- ファイルシステム
- ネットワーク
- 環境変数

## MoonBitの位置づけ

MoonBitは、WASMファーストの言語として設計されています：

\`\`\`moonbit
pub fn main() -> Unit {
  println("Hello from WebAssembly!")
}
\`\`\`

次世代のWeb開発を先取りしましょう。`
  },
  {
    title: 'Server Actionsパターンの解説',
    slug: 'server-actions-pattern',
    content: `# Server Actionsパターンの解説

Server Actionsは、フォーム送信をサーバーサイドで処理するパターンです。

## 従来のアプローチとの違い

| 従来 | Server Actions |
|------|----------------|
| REST API | 関数呼び出し |
| 手動シリアライズ | 自動 |
| CORS設定必要 | 不要 |

## 実装例

\`\`\`moonbit
let create_post_action = @action.ActionHandler(async fn(ctx) {
  let title = get_str(ctx.body, "title")
  db_create_post(title).wait()
  @action.ActionResult::ok({ message: "Created!" })
})
\`\`\`

シンプルかつ安全なフォーム処理を実現します。`
  },
  {
    title: 'TypeScriptからMoonBitへの移行ガイド',
    slug: 'typescript-to-moonbit',
    content: `# TypeScriptからMoonBitへの移行ガイド

TypeScript開発者向けのMoonBit入門ガイドです。

## 型システムの違い

### TypeScript
\`\`\`typescript
interface User {
  name: string;
  age: number;
}
\`\`\`

### MoonBit
\`\`\`moonbit
struct User {
  name: String
  age: Int
}
\`\`\`

## パターンマッチング

MoonBitでは強力なパターンマッチングが使えます：

\`\`\`moonbit
match result {
  Some(value) => process(value)
  None => default_value
}
\`\`\`

段階的に移行することをお勧めします。`
  },
  {
    title: 'D1データベースのベストプラクティス',
    slug: 'd1-database-best-practices',
    content: `# D1データベースのベストプラクティス

Cloudflare D1はエッジで動作するSQLiteデータベースです。

## スキーマ設計

\`\`\`sql
-- インデックスを適切に設定
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_status ON posts(status);
\`\`\`

## クエリ最適化

- SELECT *を避ける
- 必要なカラムのみ取得
- LIMIT句を活用

## マイグレーション

\`\`\`bash
wrangler d1 migrations apply blog-db
\`\`\`

エッジでのデータ処理を最適化しましょう。`
  },
  {
    title: 'CSSグリッドレイアウトの実践テクニック',
    slug: 'css-grid-techniques',
    content: `# CSSグリッドレイアウトの実践テクニック

モダンなレイアウトにはCSSグリッドが欠かせません。

## 基本構文

\`\`\`css
.container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
\`\`\`

## レスポンシブ対応

\`\`\`css
@media (max-width: 768px) {
  .container {
    grid-template-columns: 1fr;
  }
}
\`\`\`

## 実用パターン

- サイドバーレイアウト
- カードグリッド
- ダッシュボード

柔軟なレイアウトを実現しましょう。`
  },
  {
    title: 'Basic認証とセキュリティ対策',
    slug: 'basic-auth-security',
    content: `# Basic認証とセキュリティ対策

シンプルな認証にはBasic認証が有効です。

## 実装のポイント

\`\`\`typescript
import { timingSafeEqual } from 'hono/utils/buffer';

const secureCompare = async (a: string, b: string) => {
  return await timingSafeEqual(a, b);
};
\`\`\`

## セキュリティ考慮事項

1. **HTTPS必須**: 平文で送信されるため
2. **タイミング攻撃対策**: 定数時間比較を使用
3. **強力なパスワード**: 十分な長さと複雑さ

適切に実装すれば安全に使えます。`
  },
  {
    title: 'Markdownパーサーの仕組み',
    slug: 'markdown-parser-internals',
    content: `# Markdownパーサーの仕組み

Markdownを HTMLに変換する過程を解説します。

## パース処理の流れ

1. **字句解析**: テキストをトークンに分割
2. **構文解析**: トークンからASTを構築
3. **レンダリング**: ASTをHTMLに変換

## MoonBitでの実装

\`\`\`moonbit
let result = @markdown.parse(content)
let html = @markdown.render_html(result.document)
\`\`\`

## 対応構文

- 見出し (#, ##, ###)
- リスト (-, *)
- コードブロック
- リンクと画像

効率的なパーサー実装を学びましょう。`
  },
  {
    title: 'Island Componentの設計原則',
    slug: 'island-component-principles',
    content: `# Island Componentの設計原則

Island Architectureにおけるコンポーネント設計を解説します。

## 設計原則

1. **最小限のJS**: 必要な部分だけハイドレーション
2. **独立性**: 他のIslandに依存しない
3. **遅延ロード**: 必要になるまでロードしない

## シグナルの活用

\`\`\`moonbit
let count = @signal.signal(0)

div([
  button(on=events().click(fn(_) { count.set(count.get() + 1) }), [
    text("Count: "), text_of(count)
  ])
])
\`\`\`

パフォーマンスを意識した設計を心がけましょう。`
  },
  {
    title: 'Honoフレームワークの活用法',
    slug: 'hono-framework-usage',
    content: `# Honoフレームワークの活用法

HonoはエッジランタイムのためのWebフレームワークです。

## 特徴

- 超軽量（12KB以下）
- TypeScript対応
- マルチランタイム

## ミドルウェア

\`\`\`typescript
app.use('/admin/*', basicAuth({
  verifyUser: async (username, password) => {
    return username === 'admin' && password === 'secret';
  }
}));
\`\`\`

## ルーティング

\`\`\`typescript
app.get('/posts/:id', (c) => {
  const id = c.req.param('id');
  return c.json({ id });
});
\`\`\`

軽量で高速なAPIを構築しましょう。`
  },
  {
    title: 'エラーハンドリングのベストプラクティス',
    slug: 'error-handling-best-practices',
    content: `# エラーハンドリングのベストプラクティス

堅牢なアプリケーションにはエラーハンドリングが不可欠です。

## MoonBitでのエラー処理

\`\`\`moonbit
fn divide(a: Int, b: Int) -> Result[Int, String] {
  if b == 0 {
    Err("Division by zero")
  } else {
    Ok(a / b)
  }
}
\`\`\`

## パターン

1. **早期リターン**: エラーは早めに処理
2. **型で表現**: OptionやResultを活用
3. **ログ出力**: デバッグ情報を残す

ユーザーフレンドリーなエラー処理を実装しましょう。`
  },
  {
    title: 'Playwrightでの E2Eテスト入門',
    slug: 'playwright-e2e-testing',
    content: `# PlaywrightでのE2Eテスト入門

Playwrightは最新のブラウザ自動化ツールです。

## セットアップ

\`\`\`bash
npm install -D @playwright/test
npx playwright install
\`\`\`

## テスト例

\`\`\`typescript
test('create post', async ({ page }) => {
  await page.goto('/admin/posts/new');
  await page.fill('input#title', 'Test Post');
  await page.click('button[type="submit"]');
  await expect(page.locator('.success')).toBeVisible();
});
\`\`\`

## ベストプラクティス

- セレクタは安定したものを使う
- 適切な待機を入れる
- スクリーンショットを活用

信頼性の高いテストを書きましょう。`
  },
  {
    title: 'Wranglerによるデプロイ自動化',
    slug: 'wrangler-deployment-automation',
    content: `# Wranglerによるデプロイ自動化

Cloudflare Workersのデプロイを自動化しましょう。

## 基本コマンド

\`\`\`bash
# 開発
wrangler dev

# デプロイ
wrangler deploy

# ログ確認
wrangler tail
\`\`\`

## 環境変数

\`\`\`toml
# wrangler.toml
[vars]
ENVIRONMENT = "production"
\`\`\`

## シークレット

\`\`\`bash
wrangler secret put API_KEY
\`\`\`

CI/CDパイプラインに組み込んで効率化しましょう。`
  },
  {
    title: 'Content Security Policyの設定',
    slug: 'content-security-policy',
    content: `# Content Security Policyの設定

CSPでXSS攻撃を防御しましょう。

## 基本ディレクティブ

\`\`\`
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline';
\`\`\`

## Luna UIでの設定

\`\`\`moonbit
@mw.security_headers_relaxed()
\`\`\`

## 注意点

- Google Fontsは外部ドメイン
- インラインスクリプトの扱い
- 段階的に厳格化

セキュリティと機能のバランスを取りましょう。`
  },
  {
    title: 'フォームバリデーションの実装',
    slug: 'form-validation-implementation',
    content: `# フォームバリデーションの実装

ユーザー入力の検証は重要です。

## クライアントサイド

\`\`\`html
<input type="text" required pattern="[a-z0-9-]+" />
\`\`\`

## サーバーサイド

\`\`\`moonbit
if title == "" {
  return @action.ActionResult::bad_request("タイトルは必須です")
}
\`\`\`

## 両方で検証する理由

1. クライアント: UX向上（即時フィードバック）
2. サーバー: セキュリティ（改ざん防止）

多層防御でデータの整合性を保ちましょう。`
  },
  {
    title: 'レスポンシブデザインの実践',
    slug: 'responsive-design-practice',
    content: `# レスポンシブデザインの実践

あらゆるデバイスに対応するデザインを実装しましょう。

## ブレークポイント

\`\`\`css
/* モバイル */
@media (max-width: 480px) { }

/* タブレット */
@media (max-width: 768px) { }

/* デスクトップ */
@media (min-width: 1024px) { }
\`\`\`

## モバイルファースト

小さい画面から設計を始めることで：

- 本質的なコンテンツに集中
- パフォーマンス向上
- 段階的な機能追加

ユーザー体験を最適化しましょう。`
  },
  {
    title: 'パフォーマンス最適化のヒント',
    slug: 'performance-optimization-tips',
    content: `# パフォーマンス最適化のヒント

高速なWebアプリを実現するためのヒント集です。

## 測定ツール

- Lighthouse
- Web Vitals
- ブラウザDevTools

## 最適化ポイント

### JavaScript
- バンドルサイズの削減
- 遅延ロード
- Tree Shaking

### CSS
- 未使用スタイルの削除
- Critical CSSの抽出

### 画像
- 適切なフォーマット（WebP）
- 遅延読み込み

継続的な計測と改善を行いましょう。`
  },
  {
    title: 'GitHubActionsでCI/CDを構築',
    slug: 'github-actions-cicd',
    content: `# GitHub ActionsでCI/CDを構築

自動化されたビルド・テスト・デプロイパイプラインを構築しましょう。

## ワークフロー例

\`\`\`yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CF_TOKEN }}
\`\`\`

## ベストプラクティス

- シークレットは環境変数で管理
- キャッシュを活用
- 並列実行で高速化

安全で効率的なデプロイを実現しましょう。`
  }
];

async function seedArticles() {
  console.log(`\nSeeding ${articles.length} articles to ${BASE_URL}\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    httpCredentials: { username: AUTH_USER, password: AUTH_PASS },
    viewport: { width: 1440, height: 900 }
  });

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const page = await context.newPage();

    try {
      console.log(`[${i + 1}/${articles.length}] Creating: ${article.title}`);

      // Listen for action response
      let actionStatus = null;
      page.on('response', res => {
        if (res.url().includes('/_action/create-post')) {
          actionStatus = res.status();
        }
      });

      await page.goto(`${BASE_URL}/admin/posts/new`, { waitUntil: 'networkidle' });

      // Fill form
      await page.fill('input#title', article.title);
      await page.fill('input#slug', article.slug);

      // Set status to published
      await page.selectOption('select#status', 'published');

      // Fill content
      await page.fill('textarea#content', article.content);

      // Submit
      await page.click('button[type="submit"]');

      // Wait for response
      await page.waitForTimeout(2000);

      // Check success
      const successMessage = await page.locator('.success-message').isVisible().catch(() => false);
      const resultMessage = await page.locator('.form-result').textContent().catch(() => '');

      if (successMessage || resultMessage.includes('作成しました') || actionStatus === 200) {
        console.log(`  ✓ Success: ${article.slug}`);
        successCount++;
      } else {
        console.log(`  ✗ Failed: ${article.slug} (status: ${actionStatus})`);
        failCount++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${article.slug} - ${error.message}`);
      failCount++;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log(`\n========================================`);
  console.log(`Results: ${successCount} success, ${failCount} failed`);
  console.log(`========================================\n`);

  process.exit(failCount > 0 ? 1 : 0);
}

seedArticles().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
