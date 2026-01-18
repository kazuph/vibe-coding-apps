# Test Pyramid Structure

このプロジェクトはテストピラミッドに基づいたテスト構造を採用しています。

```
       /\
      /  \
     / E2E \         <- e2e/ (少数、高コスト、実環境テスト)
    /------\
   /        \
  / Integration \    <- tests/integration/ (中程度、API・DOM統合)
 /--------------\
/                \
/      Unit       \  <- tests/unit/ + app/**/*_test.mbt (多数、低コスト)
\------------------/
```

## Directory Structure

```
tests/
├── unit/          # MoonBit純粋関数テスト
├── integration/   # DOM・API統合テスト
└── README.md      # このファイル

e2e/               # E2Eテスト (ルート直下)
├── *.spec.ts
├── playwright.config.ts
└── README.md

app/
├── **/*_test.mbt  # MoonBitコードと同居するユニットテスト
```

## Test Types

### Unit Tests (tests/unit/ + app/**/*_test.mbt)

**目的**: 純粋関数やモジュール単位のロジック検証

**技術**:
- MoonBit native test (`moon test`)
- 外部依存なし、純粋関数のみ

**実行**:
```bash
npm run test:moon    # MoonBitテスト実行
moon test            # 直接実行
```

**ベストプラクティス**:
- 1関数1テスト原則
- 境界値テスト必須
- テストファイルは `*_test.mbt` 命名規則

### Integration Tests (tests/integration/)

**目的**: DOM操作、API呼び出し、複数モジュール連携の検証

**技術**:
- MoonBit + happy-dom / jsdom
- API統合テスト

**実行**:
```bash
npm run test:integration  # (将来実装予定)
```

**ベストプラクティス**:
- 実際のDOMを使用（モック禁止）
- ネットワーク呼び出しは実環境またはローカルエミュレータのみ

### E2E Tests (e2e/)

詳細は [e2e/README.md](../e2e/README.md) を参照。

## Running All Tests

```bash
# 全テスト実行
npm test

# MoonBitテストのみ
npm run test:moon

# E2Eテストのみ
npm run test:e2e
```

## Test Policy

このプロジェクトでは以下のポリシーを厳守します:

1. **モック禁止**: ショートカットや簡略化は長期的に有害
2. **DI活用**: テスト時のみローカルエミュレータに接続切り替え
3. **問題検知優先**: 実装前に検知機構を整備

## Future Work

- [ ] `tests/unit/` にMoonBit純粋関数テストを追加
- [ ] `tests/integration/` にDOM統合テストを追加
- [ ] CI/CDでのテストピラミッド実行
