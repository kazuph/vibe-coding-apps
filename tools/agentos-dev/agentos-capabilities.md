# agentOS で今できること

- monorepo 内の project を自動検出して一覧表示できる
- 任意の project を `workspaceVm + pi` で agentOS セッションとして開ける
- repo 全体を `/mnt/repo` に read-only mount して安全に参照できる
- writable な `/mnt/workspace` を使って agentOS 内の作業領域を分離できる
- `package.json` を読んで project 名や scripts を確認できる
- host toolkit 経由で code search を実行できる
- host toolkit 経由で `git status` / `git diff --stat` を取れる
- host toolkit 経由で project ごとの script を `pnpm --dir <project>` で実行できる
- `sandbox-agent` を併用して coding agent を別実行面で動かせる
- manager の actor state に session を永続化できる
- 同じ repo でも project ごとに別 actor key / 別 session として扱える
