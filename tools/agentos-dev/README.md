# agentOS Hybrid Dev Runtime

このディレクトリは `vibe-coding-apps` 用の開発オーケストレーション層です。`pnpm-workspace` の一部としてぶら下がっていますが、既存の各アプリの runtime 依存を root に集約するためのものではありません。

## 何をしているか

- `workspaceVm`: `agentOS` 上で Pi と host toolkits を動かす高速な VM
- `codingSandbox`: `sandbox-agent` を `local` provider 経由で起動する coding agent 実行面
- repo 全体を `agentOS` に read-only mount し、host 側で project discovery と script 実行を補助

## 重要な前提

- root の `package.json` と `pnpm-workspace.yaml` は monorepo 管理とこのランタイムの起動導線のためにあります
- 既存プロジェクトの install / build / deploy 手順は引き続き各 project 直下が正です
- root からは `pnpm --filter` で `agentOS` ランタイムだけを叩けます
- 既存アプリの lockfile は残したままですが、今後 root からの操作は `pnpm` を基準にします

## 使い方

```bash
pnpm doctor:agentos
pnpm dev:agentos
```

別ターミナルで self-check:

```bash
pnpm smoke:agentos
```

project 一覧:

```bash
pnpm agentos:list-projects
```

project を開く:

```bash
pnpm agentos:open -- --project lesson-booking
pnpm agentos:open -- --project codraw
pnpm agentos:open -- --project codraw --surface sandbox --agent codex
```

## 環境変数

- `AGENTOS_PORT`: Rivet manager の listen port。既定値 `6420`
- `SANDBOX_AGENT_PORT`: local sandbox-agent provider の port。既定値 `2468`
- `SANDBOX_AGENT_LOG`: `inherit | pipe | silent`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` など: sandbox-agent 側へ引き継ぐ

## mount

- repo: `/mnt/repo` -> monorepo root, read-only
- workspace: `/mnt/workspace` -> `tools/agentos-dev/.agentos-dev/workspace`, read-write
- pi agent home: `/home/user/.pi/agent` -> `tools/agentos-dev/.agentos-dev/pi-agent`, read-write
