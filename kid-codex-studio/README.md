# Kid Codex Studio

子どもの iPad からローカルネットワーク越しに使う、Codex app-server 仲介の制作アプリです。

## できること

- 写真をアップロードしてライブラリ化
- プロンプトから gpt-image-2 限定で画像生成を Codex app-server に依頼
- `/pet` 系の雰囲気に寄せたキャラづくり。内部アセットは `library/characters/<id>/` に束ね、表面は動く GIF サムネで表示
- 選んだ画像を素材にして Codex app-server にブラウザゲーム作成を依頼
- fal.ai Seedance 動画生成を Codex app-server の dynamic tool として実行
- 依頼を待っている間でも別の依頼を追加可能。サーバー側は `MAX_PARALLEL_JOBS` 本まで同時実行

## 起動

```bash
cp .env.example .env.local
# .env.local の FAL_KEY をローカルだけで設定
pnpm install
pnpm dev
```

開発中は Vite が表示する `http://<MacのIP>:5277` を iPad で開きます。
`pnpm build && pnpm start` で本番起動した場合は `http://<MacのIP>:4177` を開きます。

## 設計メモ

- ブラウザはこの Node サーバーだけにアクセスします。
- Codex app-server はサーバー側で `stdio://` 起動し、JSON-RPC を仲介します。
- 生成物は `library/` 配下に保存し、`/assets/*` で配信します。
- 秘密鍵は `.env.local` の `FAL_KEY` に置き、フロントエンドへは渡しません。
- `MAX_PARALLEL_JOBS` 未指定時は 3 本まで同時実行します。
