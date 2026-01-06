import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from '@opentui/react';
import { Effect, Runtime } from 'effect';
import { ComposeBox } from './ComposeBox.js';
import { Timeline } from './Timeline.js';
import { PostList } from './PostList.js';
import { StorageServiceTag } from '../services/storage.js';
import type { Post, WindowType } from '../types/post.js';

interface AppProps {
  runtime: Runtime.Runtime<StorageServiceTag>;
}

export const App: React.FC<AppProps> = ({ runtime }) => {
  const { exit } = useApp();
  const [activeWindow, setActiveWindow] = useState<WindowType>('compose');
  const [composeText, setComposeText] = useState('');
  const [timeline, setTimeline] = useState<Post[]>([]);
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<string>('Ready');
  const [loading, setLoading] = useState(false);

  // Load timeline and posts on mount
  useEffect(() => {
    const loadData = Effect.gen(function* () {
      const service = yield* StorageServiceTag;
      const timelineData = yield* service.getTimeline();
      const postsData = yield* service.getMyPosts();
      return { timeline: timelineData, posts: postsData };
    });

    setLoading(true);
    setStatus('Loading data...');

    Runtime.runPromise(runtime)(loadData)
      .then(({ timeline: timelineData, posts: postsData }) => {
        setTimeline(timelineData);
        setMyPosts(postsData);
        setStatus('Ready');
        setLoading(false);
      })
      .catch(err => {
        setStatus(`Error: ${err.message}`);
        setLoading(false);
      });
  }, [runtime]);

  const createPost = useCallback((text: string) => {
    const postEffect = Effect.gen(function* () {
      const service = yield* StorageServiceTag;
      const post = yield* service.createPost(text);
      return post;
    });

    setLoading(true);
    setStatus('Creating post...');

    Runtime.runPromise(runtime)(postEffect)
      .then(post => {
        setMyPosts(prev => [post, ...prev]);
        setTimeline(prev => [post, ...prev]);
        setStatus('Post created!');
        setComposeText('');
        setLoading(false);
      })
      .catch(err => {
        setStatus(`Error: ${err.message}`);
        setLoading(false);
      });
  }, [runtime]);

  const refreshData = useCallback(() => {
    const loadData = Effect.gen(function* () {
      const service = yield* StorageServiceTag;
      const timelineData = yield* service.getTimeline();
      const postsData = yield* service.getMyPosts();
      return { timeline: timelineData, posts: postsData };
    });

    setLoading(true);
    setStatus('Refreshing...');

    Runtime.runPromise(runtime)(loadData)
      .then(({ timeline: timelineData, posts: postsData }) => {
        setTimeline(timelineData);
        setMyPosts(postsData);
        setStatus('Refreshed');
        setLoading(false);
      })
      .catch(err => {
        setStatus(`Error: ${err.message}`);
        setLoading(false);
      });
  }, [runtime]);

  useInput((input, key) => {
    // Exit on Ctrl+C or q
    if ((key.ctrl && input === 'c') || input === 'q') {
      exit();
      return;
    }

    // Window switching
    if (key.tab) {
      const windows: WindowType[] = ['compose', 'timeline', 'posts'];
      const currentIndex = windows.indexOf(activeWindow);
      const nextIndex = (currentIndex + 1) % windows.length;
      setActiveWindow(windows[nextIndex]);
      setSelectedIndex(0);
      return;
    }

    // Window-specific controls
    if (activeWindow === 'compose') {
      if (key.ctrl && key.return) {
        // Create post
        if (composeText.trim() && composeText.length <= 280) {
          createPost(composeText);
        }
      } else if (key.backspace || key.delete) {
        setComposeText(prev => prev.slice(0, -1));
      } else if (key.escape) {
        setComposeText('');
      } else if (input && !key.ctrl && !key.meta) {
        setComposeText(prev => prev + input);
      }
    } else if (activeWindow === 'timeline' || activeWindow === 'posts') {
      const items = activeWindow === 'timeline' ? timeline : myPosts;

      if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (input === 'r') {
        refreshData();
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="center">
        <Text bold color="cyan">
          📝 TUI Post Client
        </Text>
      </Box>

      {/* Status bar */}
      <Box marginBottom={1}>
        <Text color={loading ? 'yellow' : 'green'}>
          Status: {status}
        </Text>
      </Box>

      {/* Main content - 3 columns */}
      <Box flexDirection="row" height={30}>
        {/* Left column - Compose */}
        <Box width="33%" marginRight={1}>
          <ComposeBox
            text={composeText}
            onSubmit={createPost}
            isActive={activeWindow === 'compose'}
          />
        </Box>

        {/* Middle column - Timeline */}
        <Box width="34%" marginRight={1}>
          <Timeline
            posts={timeline}
            isActive={activeWindow === 'timeline'}
            selectedIndex={selectedIndex}
          />
        </Box>

        {/* Right column - My Posts */}
        <Box width="33%">
          <PostList
            posts={myPosts}
            isActive={activeWindow === 'posts'}
            selectedIndex={selectedIndex}
            title="My Posts"
          />
        </Box>
      </Box>

      {/* Help footer */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Tab: Switch windows | Ctrl+Enter: Post | j/k or ↑/↓: Navigate | r: Refresh | q: Quit
        </Text>
      </Box>
    </Box>
  );
};
