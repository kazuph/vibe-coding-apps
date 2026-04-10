# agentOS Hybrid Dev Runtime

このディレクトリは `vibe-coding-apps` 用の開発オーケストレーション層です。`pnpm-workspace` の一部としてぶら下がっていますが、既存の各アプリの runtime 依存を root に集約するためのものではありません。

## 何をしているか

- `workspaceVm`: `agentOS` 上で Pi と host toolkits を動かす高速な VM
- `codingSandbox`: `sandbox-agent` を `local` provider 経由で起動する coding agent 実行面
- `vibeLocal`: `vibe-local-pyodide` の session / transcript を actor-local SQLite に保存する browser-core actor
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
pnpm dev:vibe-local-agentos
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

`vibe-local-pyodide` を `agentOS` 付きで使う:

```bash
pnpm dev:vibe-local-agentos
pnpm vibe-local:cli health
pnpm vibe-local:cli projects
pnpm vibe-local:cli search "agentOS actor"
pnpm vibe-local:cli run-script vibe-local-pyodide check
pnpm vibe-local:cli agent-run vibe-local-pyodide "git status を見て要約して"
pnpm vibe-local:cli read-file README.md
printf 'hello from cli\n' | pnpm vibe-local:cli write-file tools/agentos-dev/.agentos-dev/workspace/note.txt
```

この状態で `http://localhost:5274/` を開くと、Status が `agentOS actor` になり、会話・セッション一覧・compact artifact が `vibeLocal` actor の SQLite に保存されます。browser からは project 選択、repo search、file open / save、git status / diff stat、script 実行に加えて、選択中 project を優先した tool-calling agent run ができます。CLI からは同じ `vibeLocal` actor を直接叩きます。

## vibe-local parity の優先順位

この repo で `vibe-local` 互換を広げるときは、次の 3 点を必須の優先項目として扱います。

1. ツール実行の強化
2. `Plan / Act / approve` フロー
3. サブエージェント / 並列エージェント

次は採用しません。

- checkpoint / rollback

次は後回しです。

- file watcher
- auto-test loop

## 環境変数

- `AGENTOS_PORT`: Rivet manager の listen port。既定値 `6420`
- `SANDBOX_AGENT_PORT`: local sandbox-agent provider の port。既定値 `2468`
- `SANDBOX_AGENT_LOG`: `inherit | pipe | silent`
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` など: sandbox-agent 側へ引き継ぐ

## mount

- repo: `/mnt/repo` -> monorepo root, read-only
- workspace: `/mnt/workspace` -> `tools/agentos-dev/.agentos-dev/workspace`, read-write
- pi agent home: `/home/user/.pi/agent` -> `tools/agentos-dev/.agentos-dev/pi-agent`, read-write

## vibeLocal actor

- actor key は `["browser-core"]`
- 保存テーブルは `sessions`, `messages`, `artifacts`
- `GET /__vibe_local/agentos/*` と `POST /__vibe_local/agentos/*` は `vibe-local-pyodide` の Vite middleware から actor を叩きます
- backend settings は引き続き browser の localStorage に保存し、会話本体だけを actor-local SQLite に寄せています
