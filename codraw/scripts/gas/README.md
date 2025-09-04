# GAS Web App for CoDraw (Proxy)

This directory contains the Google Apps Script (GAS) Web App that proxies image generation to Gemini. It mirrors the Worker API at `/api/generate`.

## Deploy with clasp (CLI)

1) Install clasp

```bash
npm i -g @google/clasp
clasp login
```

2) Create a new Web App project (one time)

```bash
clasp create --title codraw-gas --type webapp --rootDir scripts/gas
```

This will create a `.clasp.json` file (if not, copy `scripts/gas/.clasp.example.json` to `scripts/gas/.clasp.json` and paste your `scriptId`).

3) Push code

```bash
cd scripts/gas
clasp push
```

4) Deploy the Web App

```bash
clasp deploy -d initial
# Get the Web App URL in terminal
clasp run getWebAppUrl --nondev
```

If `getWebAppUrl` returns `null`, open the Apps Script UI once to set the Web App deployment manually, then re-run the command above.

5) Set Script Properties (env)

```bash
# Example: set ACCESS_TOKEN and GEMINI_API_KEY
clasp run setPropsFromJson --params '["{\\"ACCESS_TOKEN\\":\\"YOUR_GAS_TOKEN\\",\\"GEMINI_API_KEY\\":\\"YOUR_GEMINI_KEY\\"}"]' --nondev
```

Required properties:
- `GEMINI_API_KEY` (or `GEMINI_API_TOKEN`): Gemini server API key
- `ACCESS_TOKEN` (recommended): token that the Worker will send as `x_token`

6) Configure Worker fallback

Add to `.dev.vars` in the repo root:

```
GAS_FALLBACK_URL=https://script.google.com/macros/s/XXXXX/exec
GAS_ACCESS_TOKEN=YOUR_GAS_TOKEN
```

## API Contract

- Request (JSON): `{ imageDataUrl: string, prompt: string, historyDataUrls?: string[] }`
- Response (JSON): `{ imageDataUrl: string }` or `{ error: string }`

