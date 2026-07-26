# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Cursor / その他のエディタ AI**: このリポジトリでは `CLAUDE.md` がワークスペースルールとして読み込まれる設定になっていることが多い。ここに書いた方針は **Claude Code だけでなく Cursor 上のエージェントも従うこと**。

## Git worktree（必須）★

**新規ブランチでの作業・タスク単位の開発は、必ず `git worktree` で別ディレクトリを切って行う。** メインのクローン上で直接ブランチを切り替えて作業しない（衝突・取りこぼし防止）。

- 略称 `git wt` をシェルにエイリアスしておくとよい（例: `git config --global alias.wt worktree`）。
- 典型例（`main` から feature 用の別フォルダを追加）:
  ```bash
  git fetch origin main
  git worktree add ../vibe-coding-apps-<ブランチ名> -b feature/<topic> origin/main
  cd ../vibe-coding-apps-<ブランチ名>
  ```
- マージ・片付け後: `git worktree remove ../vibe-coding-apps-<ブランチ名>`（作業ツリー側で未コミットがないことを確認してから）。

## Project Overview

This repository is a **monorepo** containing multiple AI-powered applications built with modern web technologies and IoT Bluetooth Low Energy (BLE) control systems:

1. **AI Face Cropper** - MediaPipe-based face detection and image cropping using Cloudflare Workers
2. **Fitness Bike Controllers** - BLE control systems for fitness bikes with both Node.js/TUI and React/WebBluetooth implementations
3. **Chrome Extensions** - Browser extensions for technical book previews and Tinder-style swiping interfaces
4. **Kids Learning App** - Educational application with hiragana, katakana, alphabet, and number puzzles

## Monorepo Structure

### Project-to-Demo Mapping

| Source Code Directory | Live Demo Path | Description |
|----------------------|----------------|-------------|
| `face-crop-app/` | `docs/face-crop/` | MediaPipe Face Detector |
| `fitness-bike-webbluetooth/` | `docs/fitness-bike/` | Web Bluetooth API version |
| `fitness-bike-node-ble-tui/` | None | Node.js TUI version (Bluetooth control) |
| `techbook-*-extension/` | None | Chrome Extensions |
| None | `docs/kids-learning/` | Standalone learning app |
| None | `docs/walkingpad/` | WalkPad Console (KS-HD-Z1D treadmill via Web Bluetooth, 3D runner) |
| None | `docs/ruby-tanks/` | Ruby Tanks (tank-AI programming battle on ruby.wasm / CRuby 3.4, BGM via Ruby DSL) |
| None | `docs/figure-skating-report/` | Figure skating training guide (docs only) |
| None | `docs/functional-programming-tutorial/` | FP tutorial (docs only) |

### GitHub Pages Integration

- **Live Demo Site**: https://kazuph.github.io/vibe-coding-apps/
- **Source Directory**: `docs/` contains all GitHub Pages content
- **Main Landing Page**: `docs/index.html` with Tailwind CSS styling
- **Auto Deployment**: Changes to `docs/` directory automatically deploy to GitHub Pages

## Architecture Patterns

### Cloudflare Workers Deployment
Most web applications are designed for Cloudflare Workers deployment with Vite as the build system:
- Static assets served from `./dist` directory
- TypeScript compilation with `tsgo` (custom TypeScript build tool)
- Environment variables loaded via Vite's `loadEnv`

### Bluetooth Architecture
The fitness bike applications implement dual-approach BLE communication:
- **Node.js approach**: Uses `@abandonware/noble` for BLE communication with TUI interface via Ink
- **Web approach**: Uses Web Bluetooth API in React with custom hooks architecture

Key BLE characteristics implemented:
- Fitness Machine Service (`00001826-0000-1000-8000-00805f9b34fb`)
- Indoor Bike Data Characteristic (`00002ad2-0000-1000-8000-00805f9b34fb`)
- Fitness Machine Control Point (`00002ad9-0000-1000-8000-00805f9b34fb`)

## Common Development Commands

### Face Crop App
```bash
cd face-crop-app/
pnpm run dev          # Development server
pnpm run build        # Build for production
pnpm run deploy       # Build and deploy to Cloudflare Workers
```

### AtomS3R Tamagotchi
```bash
cd atom-s3r-tamagotchi
pio run                                  # Build
ls /dev/cu.usbmodem* /dev/tty.usbmodem*  # Find connected serial port
pio run -t upload --upload-port /dev/cu.usbmodemXXX   # Write firmware
pio device monitor -b 115200 -p /dev/cu.usbmodemXXX  # Check boot log + IP
python3 tools/log_relay_server.py --host 0.0.0.0 --port 8081  # Optional relay server
```

### Fitness Bike React App
```bash
cd fitness-bike-webbluetooth/react-app/
npm run dev           # Development server
npm run build         # TypeScript check + Vite build
npm run check         # Build + dry-run deployment check
npm run deploy        # Deploy to Cloudflare Workers
npm run lint          # ESLint checking
```

### Fitness Bike Node.js TUI
```bash
cd fitness-bike-node-ble-tui/
npm run build         # TypeScript compilation
npm run dev           # Build and start MCP server
npm run tui           # Run TUI application
npm run tui:debug     # Run TUI with debug mode
```

## Technology Stack Details

### Build Tools
- **Vite**: Primary build tool with React plugin and Cloudflare plugin
- **tsgo**: Custom TypeScript compiler (used instead of `tsc` in some projects)
- **TypeScript**: Version 5.x across all projects
- **pnpm**: Package manager for face-crop-app
- **npm**: Package manager for other projects

### Key Dependencies
- **React 19.x**: Latest React version with modern hooks
- **Hono**: Edge-first web framework for Cloudflare Workers
- **MediaPipe**: Face detection in browser environment
- **Ink**: Terminal UI framework for Node.js applications
- **Noble**: Node.js BLE communication library
- **Wrangler**: Cloudflare Workers CLI tool

### Configuration Files
- `wrangler.json`/`wrangler.jsonc`: Cloudflare Workers configuration
- `vite.config.ts`: Build configuration with environment variable injection
- `tsconfig.json`: TypeScript configuration with multiple project references

## Bluetooth Device Integration

### Service Discovery
The fitness bike controllers scan for devices advertising:
- Fitness Machine Service
- Cycling Power Service  
- Cycling Speed and Cadence Service

### Data Processing
Both implementations handle:
- Real-time metrics (speed, cadence, power, resistance)
- Average calculations with rolling windows
- Distance calculation via speed integration
- Resistance control via control point characteristics

### Error Handling
- Connection timeouts and retry logic
- Characteristic discovery fallbacks
- Graceful disconnection handling
- Logging systems for debugging BLE communication

## Chrome Extension Development

### Manifest V3
Extensions use modern Manifest V3 with:
- Content scripts for DOM manipulation
- Background service workers for persistent operations
- Cross-browser compatibility (Chrome/Firefox)

### Build Process
Extensions require manual building for different browsers:
```bash
cd techbook-swipe-extension/
./build-firefox.sh    # Build Firefox version
```

## Deployment Targets

### GitHub Pages
- **Live Demo Site**: https://kazuph.github.io/vibe-coding-apps/
- **Deployment**: Automatic from `docs/` directory
- **Update Process**: Commit changes to `docs/` and push to trigger deployment
- **Content**: Static HTML files with embedded JavaScript and CSS

### Cloudflare Workers/Pages
- **face-cropper**: Production deployment with assets from `face-crop-app/`
- **vite-react-template**: Full-stack app with worker backend from `fitness-bike-webbluetooth/`
- **Deploy Commands**: `npm run deploy` or `pnpm run deploy` from respective directories

### Chrome Web Store
- Extensions deployed manually via developer dashboard
- Separate builds required for different browsers
- Use `./build-firefox.sh` for Firefox-specific builds

## Development Workflow for Monorepo

### Adding New Applications
1. Create source code directory in repository root
2. Add corresponding demo in `docs/` directory if web-based
3. Update `docs/index.html` to include new application card
4. Update both README.md and CLAUDE.md project mappings

### Updating Live Demos
- **Direct Updates**: Modify files in `docs/` directories for immediate deployment
- **Source Sync**: Copy built assets from source directories to corresponding `docs/` paths
- **Testing**: Changes to `docs/` deploy immediately, test locally first

## Development Notes

### TypeScript Configuration
Projects use strict TypeScript with:
- Module resolution for `@` alias pointing to project root
- Worker-specific type definitions in some projects
- React and Node.js type definitions as appropriate

### Environment Variables
- `GEMINI_API_KEY`: Used in face-crop-app for AI services
- Environment variables injected via Vite's define mechanism
- Development vs production environment handling via `loadEnv`

### Asset Management
- Static assets placed in `dist/` for Workers deployment
- Images and media files referenced relatively
- Build processes handle asset optimization and copying

## 品質ルール（絶対厳守）

**実装しただけの状態は単なるゴミを積み上げただけ。確実にテストした宝石だけをユーザーに提供して。**

### つくりっぱなし禁止

- UIを実装したら **必ずスクリーンショットで目視確認** すること
- headless chromiumでスクリーンショットを撮り、Readツールで確認する
- 以下を確認してから完了とする：
  - レイアウト崩れがないか（ボタン切れ、はみ出し、重なり）
  - テキストが正しく表示されているか
  - モバイル・デスクトップ両方で確認
  - インタラクション要素（ボタン等）がすべて画面内に収まっているか
- 問題があれば修正 → 再ビルド → 再スクショ → 確認を繰り返す

### ゴミ出しレベル

ユーザーへの返答の末尾に必ず **ゴミ出しレベル** を付与する：

```
---
ゴミ出しレベル: ⭐⭐⭐⭐⭐ (5/5)
- [x] ビルド成功
- [x] スクリーンショット確認済み
- [x] レイアウト崩れなし
- [x] モバイル対応確認
- [x] 機能テスト済み
```

レベルが3以下の場合、自分でやり直してから返答すること。

