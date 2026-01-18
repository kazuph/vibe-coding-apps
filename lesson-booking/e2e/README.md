# E2E Tests for Lesson Booking System

Playwright を使用したEnd-to-End テスト。

## テスト構成

| ファイル | 説明 | 認証 |
|---------|------|------|
| `landing.spec.ts` | ランディングページ、認証フロー | 不要 |
| `instructor.spec.ts` | 講師ページ（コース管理、空き時間登録） | 講師 |
| `student.spec.ts` | 生徒ページ（検索、予約リクエスト） | 生徒 |
| `booking-flow.spec.ts` | 予約フロー全体（作成→リクエスト→承認） | 両方 |
| `booking-cancellation.spec.ts` | キャンセル・却下機能 | 両方 |
| `booking-validation.spec.ts` | バリデーションとエッジケース | 講師 |

## 前提条件

1. 開発サーバーが起動していること
2. D1データベースにマイグレーションが適用済み
3. Google OAuth設定が完了していること

```bash
# Playwrightブラウザのインストール
npx playwright install chromium
```

## テスト実行手順

### 1. 公開ページのテスト（認証不要）

```bash
npx playwright test --project=public
```

### 2. 認証が必要なテスト

認証済みページのテストには、まず認証セットアップが必要です。

```bash
# 認証セットアップ（手動でGoogleログインが必要）
npx playwright test --project=setup --headed

# ブラウザが開くので、手動でGoogleログインを完了
# 講師アカウントでログイン → 保存
# 生徒アカウントでログイン → 保存
```

### 3. 各ページのテスト

```bash
# 講師ページのテスト
npx playwright test --project=instructor

# 生徒ページのテスト
npx playwright test --project=student

# 予約フロー全体のテスト
npx playwright test --project=booking-flow
```

### 4. 全テスト実行

```bash
npm run test:e2e
```

## テストの原則

1. **UIベースのテスト**: すべてのテストはUI操作で行う
2. **直接ナビゲーション禁止**: `goto('/')` 以外の直接ナビゲーションは禁止（認証済みページへの初期アクセス除く）
3. **プロダクションコード維持**: テスト用のバイパスやショートカットは入れない
4. **実OAuth使用**: テスト環境でも実際のGoogle OAuthを使用

## 認証状態の保存場所

認証状態は `.auth/` ディレクトリに保存されます：

```
.auth/
├── instructor.json   # 講師の認証状態
└── student.json      # 生徒の認証状態
```

このディレクトリは `.gitignore` に追加済みです。

## テストアカウント

テストには以下のGoogleアカウントが必要です：

- **講師アカウント**: DBに `role = 'instructor'` として登録されたアカウント
- **生徒アカウント**: DBに `role = 'student'` として登録されたアカウント

初回ログイン時にユーザーが自動作成されますが、ロールは手動で設定する必要があります：

```sql
-- 講師として登録
UPDATE users SET role = 'instructor' WHERE email = 'instructor@example.com';

-- 生徒として登録
UPDATE users SET role = 'student' WHERE email = 'student@example.com';
```

## テストレポート

テスト結果は以下に保存されます：

- HTMLレポート: `.artifacts/test-reports/`
- スクリーンショット・動画: `.artifacts/test-results/`

```bash
# レポートを開く
npx playwright show-report .artifacts/test-reports
```

## トラブルシューティング

### 認証状態が期限切れ

```bash
# .authディレクトリを削除して再度セットアップ
rm -rf .auth/
npx playwright test --project=setup --headed
```

### テストがタイムアウト

開発サーバーが起動しているか確認：

```bash
npm run dev
```

### ブラウザが開かない

headed モードで実行：

```bash
npx playwright test --headed
```

### トレース確認

```bash
npx playwright show-trace .artifacts/test-results/*/trace.zip
```
