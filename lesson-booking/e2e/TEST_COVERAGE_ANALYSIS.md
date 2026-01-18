# レッスン予約システム E2Eテストカバレッジ分析

## 📊 現在のテストカバレッジ

### ✅ カバー済み機能

#### 1. ランディングページ (`landing.spec.ts`)
- ✅ ホームページの表示
- ✅ ログインボタンの動作
- ✅ Google OAuthへのリダイレクト
- ✅ レスポンシブデザイン（モバイル、タブレット）
- ✅ JavaScriptエラーの監視
- ✅ 未認証状態での保護ルートへのアクセス制御

#### 2. 認証 (`auth.setup.ts`)
- ✅ 講師アカウントでのログイン
- ✅ 生徒アカウントでのログイン
- ✅ 認証状態の保存と再利用

#### 3. 講師機能 (`instructor.spec.ts`)
- ✅ ダッシュボードの表示
- ✅ コース管理ページへのナビゲーション
- ✅ コース作成フォーム
- ✅ コースのバリデーション（空欄チェック）
- ✅ 空き時間管理ページ
- ✅ 空き時間登録フォーム
- ✅ 日付の最小値チェック（今日以降）
- ✅ リクエスト管理ページ
- ✅ 空のリクエスト状態の表示

#### 4. 生徒機能 (`student.spec.ts`)
- ✅ ダッシュボードの表示
- ✅ 空き時間検索ページ
- ✅ 予約リクエストフォーム
- ✅ リクエスト送信
- ✅ リクエスト一覧表示
- ✅ リクエスト状態の表示

#### 5. 予約フロー (`booking-flow.spec.ts`)
- ✅ 完全な予約フロー
  - 講師が空き時間を作成
  - 生徒が予約リクエストを送信
  - 講師がリクエストを承認
  - 生徒が承認済み予約を確認
- ✅ グループレッスンの予約フロー
- ✅ 複数リクエストの一括承認

---

## 🔍 不足しているテストケース

### 1. キャンセル機能
**優先度: 高**

```typescript
// 推奨テストケース
test('student can cancel pending request', async ({ page }) => {
  // 生徒が送信済みリクエストをキャンセル
});

test('instructor can cancel availability slot', async ({ page }) => {
  // 講師が空き時間をキャンセル（リクエストがない場合）
});

test('instructor cannot cancel slot with approved bookings', async ({ page }) => {
  // 承認済み予約がある場合、削除できないことを確認
});
```

### 2. リクエストの却下
**優先度: 高**

```typescript
test('instructor can reject booking request', async ({ page }) => {
  // 講師がリクエストを却下
});

test('student sees rejected request status', async ({ page }) => {
  // 生徒が却下されたリクエストを確認できる
});
```

### 3. バリデーションとエッジケース
**優先度: 中**

```typescript
test('cannot create availability with end time before start time', async ({ page }) => {
  // 終了時刻 < 開始時刻のバリデーション
});

test('cannot create availability in the past', async ({ page }) => {
  // 過去の日付でのバリデーション
});

test('cannot book already full slot', async ({ page }) => {
  // 定員超過の防止
});

test('cannot submit duplicate booking request', async ({ page }) => {
  // 同じスロットへの重複リクエスト防止
});

test('max participants validation on availability form', async ({ page }) => {
  // 最大参加者数のバリデーション（1-10など）
});
```

### 4. 検索・フィルター機能
**優先度: 中**

```typescript
test('student can filter slots by date', async ({ page }) => {
  // 日付フィルター
});

test('student can filter slots by instructor', async ({ page }) => {
  // 講師でフィルター
});

test('student can filter slots by course', async ({ page }) => {
  // コースタイプでフィルター
});

test('search shows "no results" message when no slots match', async ({ page }) => {
  // 検索結果なしの表示
});
```

### 5. エラーハンドリング
**優先度: 中**

```typescript
test('shows error message when booking submission fails', async ({ page }) => {
  // サーバーエラー時のエラー表示
});

test('handles network timeout gracefully', async ({ page }) => {
  // ネットワークタイムアウトの処理
});

test('form validation errors are displayed clearly', async ({ page }) => {
  // バリデーションエラーの表示
});
```

### 6. Google Calendar連携
**優先度: 中**

```typescript
test('approved booking creates Google Calendar event', async ({ page }) => {
  // 承認時にカレンダーイベントが作成される
});

test('shows error if calendar integration fails', async ({ page }) => {
  // カレンダー連携エラー時のフォールバック
});
```

### 7. アクセシビリティ
**優先度: 低**

```typescript
test('booking form is keyboard navigable', async ({ page }) => {
  // Tabキーでのナビゲーション
});

test('form inputs have proper labels', async ({ page }) => {
  // ラベルとaria属性の確認
});

test('error messages are announced to screen readers', async ({ page }) => {
  // aria-live領域の確認
});
```

### 8. パフォーマンス
**優先度: 低**

```typescript
test('landing page loads within 3 seconds', async ({ page }) => {
  // ページ読み込み時間の測定
});

test('availability list handles 100+ slots efficiently', async ({ page }) => {
  // 大量データでのパフォーマンス
});
```

### 9. 通知機能
**優先度: 低**

```typescript
test('student receives notification when request is approved', async ({ page }) => {
  // 承認時の通知
});

test('instructor receives notification for new request', async ({ page }) => {
  // 新規リクエスト時の通知
});
```

### 10. Island Componentのハイドレーション
**優先度: 低**

```typescript
test('booking form island hydrates correctly', async ({ page }) => {
  // Island Componentのハイドレーション確認
});

test('form remains functional if JavaScript fails to load', async ({ page }) => {
  // プログレッシブエンハンスメントの確認
});
```

---

## 🎯 推奨される次のステップ

### Phase 1: 重要機能の追加（優先度: 高）
1. キャンセル機能のテスト
2. リクエスト却下のテスト

### Phase 2: ロバスト性の向上（優先度: 中）
1. バリデーションとエッジケースのテスト
2. 検索・フィルター機能のテスト
3. エラーハンドリングのテスト

### Phase 3: 品質とUXの向上（優先度: 低）
1. アクセシビリティテスト
2. パフォーマンステスト
3. 通知機能のテスト

---

## 📝 テスト作成のベストプラクティス

1. **UIベースのテスト**: すべてのナビゲーションはUIを通じて行う
2. **独立性**: 各テストは独立して実行可能
3. **明確な命名**: テスト名から何をテストしているか明確
4. **適切な待機**: `waitForLoadState('networkidle')` や Island hydration の待機
5. **エラーハンドリング**: 要素が存在しない場合のgracefulな処理

---

## 📊 現在のテスト統計

- **テストファイル数**: 5ファイル（レッスン予約関連）
- **総テストケース数**: 約40ケース
- **カバレッジ推定**: 60-70%（主要フロー）

---

## 🔧 テスト実行コマンド

```bash
# 全テスト実行
npm run test:e2e

# 公開ページのみ
npm run test:e2e:public

# 認証セットアップ
npm run test:e2e:setup

# UIモード（デバッグ用）
npm run test:e2e:ui

# ヘッドモード（ブラウザ表示）
npm run test:e2e:headed
```
