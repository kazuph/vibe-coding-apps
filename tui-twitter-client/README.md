# TUI Post Client

A terminal-based note-taking and micro-blogging tool inspired by **Obsidian Thino**. Built with **OpenTUI**, **React**, and **Effect** for a beautiful local-first writing experience.

## Features

- 📝 **Multi-window TUI Interface**: Compose, Timeline, and My Posts in separate panes
- 💾 **Local-First**: All posts stored as JSON files in `~/.tui-posts/`
- ⚡ **Effect-based Architecture**: Robust file operations with Effect's functional programming
- 🎨 **Beautiful Terminal UI**: Clean, responsive interface built with OpenTUI and React
- ⌨️ **Keyboard-driven**: Full navigation and editing with keyboard shortcuts
- ⭐ **Favorites**: Mark important posts (planned)
- 🏷️ **Tags**: Organize posts with hashtags (planned)

## Screenshots

```
┌──────────────────────────────────────────────────────────────┐
│                     📝 TUI Post Client                        │
├──────────────────────────────────────────────────────────────┤
│  Compose         │   Timeline          │  My Posts            │
│                  │                     │                      │
│  [Your post...]  │  2h ago             │  Quick note about... │
│                  │  Working on new...  │  Posted 1d ago       │
│  280 chars left  │  #coding #ideas     │                      │
└──────────────────────────────────────────────────────────────┘
```

## Technology Stack

- **[OpenTUI](https://github.com/opentui/opentui)**: Modern terminal UI framework
- **[React](https://react.dev/)**: Declarative component-based UI
- **[Effect](https://effect.website/)**: Functional programming for TypeScript
- **[@effect/platform-node](https://effect.website/docs/guides/platform/overview)**: File system operations

## Inspired By

This project is inspired by:
- **[Obsidian Thino](https://github.com/Quorafind/Obsidian-Thino)**: Micro-blogging plugin for Obsidian
- **Johannes Schickling's tweet** about Effect + OpenTUI workflow

## Prerequisites

- Node.js 18 or higher
- Terminal with Unicode support

## Installation

1. Clone the repository:
```bash
git clone https://github.com/kazuph/vibe-coding-apps.git
cd vibe-coding-apps/tui-post-client
```

2. Install dependencies:
```bash
npm install
```

3. Run the app:
```bash
npm run dev
```

## Usage

The app stores all posts in `~/.tui-posts/` directory:
- `timeline.json`: All posts in chronological order
- `my-posts.json`: Your created posts

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Switch between windows (Compose → Timeline → My Posts) |
| `Ctrl+Enter` | Create post (when in Compose window) |
| `j` or `↓` | Navigate down in lists |
| `k` or `↑` | Navigate up in lists |
| `r` | Refresh data |
| `Esc` | Clear compose text |
| `Backspace` | Delete last character (in Compose) |
| `q` or `Ctrl+C` | Quit application |

## Project Structure

```
tui-post-client/
├── src/
│   ├── components/
│   │   ├── App.tsx           # Main application component
│   │   ├── ComposeBox.tsx    # Post composition window
│   │   ├── Timeline.tsx      # Timeline view
│   │   └── PostList.tsx      # Post list component
│   ├── services/
│   │   └── storage.ts        # Effect-based file storage service
│   ├── types/
│   │   └── post.ts           # TypeScript type definitions
│   └── index.tsx             # Application entry point
├── package.json
├── tsconfig.json
└── README.md
```

## Data Format

Posts are stored as JSON with the following structure:

```json
{
  "id": "1704067200000-abc123",
  "text": "Your post content here",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "tags": ["coding", "ideas"],
  "favorite": false
}
```

## Architecture Highlights

### Effect-based Storage Layer

File operations use Effect for:
- Type-safe error handling
- Async operation management
- Dependency injection
- Composable file system operations

Example:
```typescript
const createPost = Effect.gen(function* () {
  const service = yield* StorageServiceTag;
  const post = yield* service.createPost(text);
  return post;
});
```

### React + OpenTUI Components

Components are built with React and rendered in the terminal:
- Declarative UI composition
- React hooks for state management
- OpenTUI's `Box` and `Text` primitives for layout

### Multi-Window Navigation

Three concurrent windows with keyboard-based navigation:
1. **Compose**: Write and create posts
2. **Timeline**: View all posts chronologically
3. **My Posts**: See your created posts

## Development

```bash
# Development mode with hot reload
npm run dev

# Type checking and build
npm run build

# Run compiled version
npm start
```

## Roadmap

- [ ] Tag support with #hashtag parsing
- [ ] Favorite/star posts
- [ ] Search functionality
- [ ] Export to Markdown
- [ ] Obsidian vault integration
- [ ] Daily notes view
- [ ] Import from JSON/Markdown

## Use Cases

Perfect for:
- 📝 Quick note-taking from terminal
- 💭 Capturing fleeting thoughts
- 📚 Building a personal knowledge base
- ✍️ Micro-journaling
- 🧠 Second brain / Zettelkasten workflow

## Comparison with Similar Tools

| Feature | TUI Post Client | Obsidian Thino | Twitter |
|---------|----------------|----------------|---------|
| Local-first | ✅ | ✅ | ❌ |
| Terminal UI | ✅ | ❌ | ❌ |
| No API required | ✅ | ✅ | ❌ |
| Markdown support | 🔜 | ✅ | ❌ |
| Offline-first | ✅ | ✅ | ❌ |
| Free & Open Source | ✅ | ✅ | ❌ |

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License

## Credits

Built with:
- OpenTUI by [@thdxr](https://twitter.com/thdxr)
- Effect by the Effect team
- React by Meta

Inspired by Obsidian Thino and Johannes Schickling's Effect + OpenTUI workflow.

---

Made with ❤️ using Effect, React, and OpenTUI - A local-first alternative to social media micro-blogging
