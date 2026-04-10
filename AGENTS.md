# Repo Rules

このリポジトリの `vibe-local + agentOS` 系の開発では、以下を固定ルールとして扱うこと。

## 優先順位

最優先は次の 3 点。

1. ツール実行の強化
2. `Plan / Act / approve` フロー
3. サブエージェント / 並列エージェント

## やらないこと

- checkpoint / rollback は実装しない
- checkpoint / rollback を roadmap に戻さない

## 後回し

- file watcher
- auto-test loop

上の 2 点は必要になってから再検討する。`vibe-local` 互換の優先項目として先に進めないこと。
