# TUI Twitter Client

A beautiful terminal user interface (TUI) Twitter client built with **OpenTUI**, **React**, and **Effect**.

## Features

- 🐦 **Multi-window Interface**: Compose tweets, view timeline, and see your tweets in separate windows
- ⚡ **Effect-based Architecture**: Robust error handling and async operations powered by Effect
- 🎨 **Beautiful TUI**: Clean, responsive terminal UI built with OpenTUI and React
- ⌨️ **Keyboard Shortcuts**: Full keyboard navigation support
- 📱 **Real-time Updates**: Refresh timeline and post tweets directly from your terminal

## Screenshots

```
┌──────────────────────────────────────────────────────────────┐
│                    🐦 TUI Twitter Client                      │
├──────────────────────────────────────────────────────────────┤
│  Compose (Tab 1)  │   Timeline (Tab 2)   │  My Tweets (Tab 3)│
│                   │                      │                   │
│  [Tweet here...]  │  @user: Tweet text   │  My recent tweet  │
│                   │  💬 2 🔁 5 ❤️ 10    │  Posted 2m ago    │
│  280 chars left   │                      │                   │
└──────────────────────────────────────────────────────────────┘
```

## Technology Stack

- **[OpenTUI](https://github.com/opentui/opentui)**: Terminal UI framework
- **[React](https://react.dev/)**: Declarative component-based UI
- **[Effect](https://effect.website/)**: Functional programming for TypeScript
- **[twitter-api-v2](https://github.com/PLhery/node-twitter-api-v2)**: Twitter API v2 client

## Prerequisites

- Node.js 18 or higher
- Twitter Developer Account with API credentials
- Terminal with Unicode support

## Installation

1. Clone the repository:
```bash
git clone https://github.com/kazuph/vibe-coding-apps.git
cd vibe-coding-apps/tui-twitter-client
```

2. Install dependencies:
```bash
npm install
```

3. Configure Twitter API credentials:
```bash
cp .env.example .env
```

4. Edit `.env` and add your Twitter API credentials:
```env
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_SECRET=your_access_secret_here
```

## Getting Twitter API Credentials

1. Go to [Twitter Developer Portal](https://developer.twitter.com/en/portal/dashboard)
2. Create a new app (or use an existing one)
3. Navigate to "Keys and tokens"
4. Generate/copy:
   - API Key and Secret
   - Access Token and Secret
5. Make sure your app has **Read and Write** permissions

## Usage

Run the application:

```bash
npm run dev
```

Or build and run:

```bash
npm run build
npm start
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between windows (Compose → Timeline → My Tweets) |
| `Ctrl+Enter` | Post tweet (when in Compose window) |
| `j` or `↓` | Navigate down in lists |
| `k` or `↑` | Navigate up in lists |
| `r` | Refresh timeline |
| `Esc` | Clear compose text |
| `Backspace` | Delete last character (in Compose) |
| `q` or `Ctrl+C` | Quit application |

## Project Structure

```
tui-twitter-client/
├── src/
│   ├── components/
│   │   ├── App.tsx           # Main application component
│   │   ├── ComposeBox.tsx    # Tweet composition window
│   │   ├── Timeline.tsx      # Timeline view
│   │   └── TweetList.tsx     # Tweet list component
│   ├── services/
│   │   └── twitter.ts        # Effect-based Twitter API service
│   ├── types/
│   │   └── tweet.ts          # TypeScript type definitions
│   └── index.tsx             # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture Highlights

### Effect-based Service Layer

The Twitter API integration uses Effect for:
- Type-safe error handling
- Async operation management
- Dependency injection
- Composable effects

Example:
```typescript
const postTweet = Effect.gen(function* () {
  const service = yield* TwitterServiceTag;
  const tweet = yield* service.postTweet(text);
  return tweet;
});
```

### React + OpenTUI Components

Components are built with React and rendered in the terminal:
- Declarative UI composition
- React hooks for state management
- OpenTUI's `Box` and `Text` primitives

### Multi-Window Navigation

Three concurrent windows with keyboard-based navigation:
1. **Compose**: Write and post tweets
2. **Timeline**: View home timeline
3. **My Tweets**: See your posted tweets

## Development

```bash
# Development mode with hot reload
npm run dev

# Type checking
npm run build

# Format code
npm run format   # (if configured)
```

## Troubleshooting

### API Rate Limits

Twitter API has rate limits. If you see errors, wait a few minutes before retrying.

### Authentication Errors

Make sure your API credentials are correct and have Read/Write permissions.

### Terminal Issues

For best results, use a modern terminal with Unicode support:
- iTerm2 (macOS)
- Windows Terminal (Windows)
- GNOME Terminal or Alacritty (Linux)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License

## Credits

Inspired by [Johannes Schickling's](https://x.com/schickling) tweet about Effect + OpenTUI.

Built with:
- OpenTUI by [@thdxr](https://twitter.com/thdxr)
- Effect by the Effect team
- React by Meta

---

Made with ❤️ using Effect, React, and OpenTUI
