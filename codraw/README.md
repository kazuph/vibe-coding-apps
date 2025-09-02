<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ZqMyHQeli3j4XYmfMr94himCqUa-FewM

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Deploy to Cloudflare Workers (Assets)

Prerequisites:
- Cloudflare account and `wrangler` logged in (`npx wrangler login`)

Steps:
- Build and deploy: `npm run deploy`

Notes:
- Static assets are served from `dist/` via Workers Assets (see `wrangler.toml`).
- SPA fallback is enabled (`not_found_handling = "single-page-application"`).
- Minimal worker delegates to assets (`worker.ts`).
