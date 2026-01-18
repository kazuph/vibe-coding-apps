# レッスン予約システム - 開発ガイド

## 技術スタック

- **言語**: MoonBit
- **UIフレームワーク**: Luna UI (Sol Framework)
- **ランタイム**: Cloudflare Workers
- **データベース**: D1 (SQLite)
- **認証**: Google OAuth 2.0
- **HTTPフレームワーク**: Hono

## アーキテクチャ原則

### MoonBit最大化

アプリケーションロジックは可能な限りMoonBitで実装する。TypeScriptは以下の目的のみに使用:

1. **Honoエントリーポイント**: `src/worker.ts`
2. **Google OAuth**: ブラウザリダイレクトとトークン交換
3. **Google Calendar API**: カレンダーイベント作成

### Island Architecture

- **SSR**: Sol Frameworkでサーバーサイドレンダリング
- **Island Components**: インタラクティブな部分のみクライアントでハイドレーション
- **Signal-based Reactivity**: `@signal.signal()` で状態管理

## ディレクトリ構成

```
app/
├── server/              # サーバーサイド（MoonBit）
│   ├── routes.mbt       # ルーティング、ページ、Server Actions
│   ├── db.mbt           # D1データベースアクセス
│   └── types.mbt        # 型定義
├── client/              # クライアントサイド（MoonBit）
│   ├── booking_form.mbt
│   ├── course_form.mbt
│   ├── availability_calendar.mbt
│   ├── approval_ui.mbt
│   └── loader.mbt       # Island Componentローダー
└── __gen__/             # 自動生成ファイル

src/
└── worker.ts            # Honoエントリー + Google OAuth
```

## FFI使用箇所

以下のFFIはブラウザ/ランタイムAPIの制約により必要:

### サーバーサイド (db.mbt)

1. `get_global_db()` - D1バインディング取得
2. `get_timestamp()` - 現在時刻取得
3. `generate_uuid()` - UUID生成

### クライアントサイド

1. `reload_page()` - ページリロード
2. `redirect_to()` - ページ遷移
3. `set_timeout()` - タイマー
4. `get_current_user_id()` - globalThis.__CURRENT_USERからユーザーID取得

## Server Actions

Island ComponentsからServer Actionsを呼び出す:

```moonbit
@action.invoke_action("/_action/create-course", form_data, handle_response)
```

レスポンスハンドリング:
- `ActionResponse::Success(data)` - 成功
- `ActionResponse::Error(status, msg)` - エラー
- `ActionResponse::NetworkError(msg)` - ネットワークエラー
- `ActionResponse::Redirect(url)` - リダイレクト

## ユーザーコンテキスト

TypeScript側で設定:
```typescript
globalThis.__CURRENT_USER = user;
```

MoonBit側で取得:
```moonbit
extern "js" fn get_current_user() -> @js.Any =
  #| () => globalThis.__CURRENT_USER || null
```

## コマンド

```bash
moon build        # MoonBitビルド
moon check        # 型チェック
npm run dev       # 開発サーバー
npm run deploy    # デプロイ
```

## データベース操作

`@cloudflare.D1Database` を使用:

```moonbit
let db = get_global_db()
let stmt = db.prepare("SELECT * FROM users WHERE id = ?").bind([id])
let result = stmt.first()
```
