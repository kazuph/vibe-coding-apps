import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from '@opentui/react';
import { Effect, Runtime } from 'effect';
import { ComposeBox } from './ComposeBox.js';
import { Timeline } from './Timeline.js';
import { TweetList } from './TweetList.js';
import { TwitterServiceTag } from '../services/twitter.js';
import type { Tweet, WindowType } from '../types/tweet.js';

interface AppProps {
  runtime: Runtime.Runtime<TwitterServiceTag>;
}

export const App: React.FC<AppProps> = ({ runtime }) => {
  const { exit } = useApp();
  const [activeWindow, setActiveWindow] = useState<WindowType>('compose');
  const [composeText, setComposeText] = useState('');
  const [timeline, setTimeline] = useState<Tweet[]>([]);
  const [myTweets, setMyTweets] = useState<Tweet[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [status, setStatus] = useState<string>('Ready');
  const [loading, setLoading] = useState(false);

  // Load timeline on mount
  useEffect(() => {
    const loadTimeline = Effect.gen(function* () {
      const service = yield* TwitterServiceTag;
      const tweets = yield* service.getTimeline(20);
      return tweets;
    });

    setLoading(true);
    setStatus('Loading timeline...');

    Runtime.runPromise(runtime)(loadTimeline)
      .then(tweets => {
        setTimeline(tweets);
        setStatus('Timeline loaded');
        setLoading(false);
      })
      .catch(err => {
        setStatus(`Error: ${err.message}`);
        setLoading(false);
      });
  }, [runtime]);

  const postTweet = useCallback((text: string) => {
    const postEffect = Effect.gen(function* () {
      const service = yield* TwitterServiceTag;
      const tweet = yield* service.postTweet(text);
      return tweet;
    });

    setLoading(true);
    setStatus('Posting tweet...');

    Runtime.runPromise(runtime)(postEffect)
      .then(tweet => {
        setMyTweets(prev => [tweet, ...prev]);
        setStatus('Tweet posted successfully!');
        setComposeText('');
        setLoading(false);
      })
      .catch(err => {
        setStatus(`Error posting tweet: ${err.message}`);
        setLoading(false);
      });
  }, [runtime]);

  const refreshTimeline = useCallback(() => {
    const loadTimeline = Effect.gen(function* () {
      const service = yield* TwitterServiceTag;
      const tweets = yield* service.getTimeline(20);
      return tweets;
    });

    setLoading(true);
    setStatus('Refreshing timeline...');

    Runtime.runPromise(runtime)(loadTimeline)
      .then(tweets => {
        setTimeline(tweets);
        setStatus('Timeline refreshed');
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
      const windows: WindowType[] = ['compose', 'timeline', 'tweets'];
      const currentIndex = windows.indexOf(activeWindow);
      const nextIndex = (currentIndex + 1) % windows.length;
      setActiveWindow(windows[nextIndex]);
      setSelectedIndex(0);
      return;
    }

    // Window-specific controls
    if (activeWindow === 'compose') {
      if (key.ctrl && key.return) {
        // Post tweet
        if (composeText.trim() && composeText.length <= 280) {
          postTweet(composeText);
        }
      } else if (key.backspace || key.delete) {
        setComposeText(prev => prev.slice(0, -1));
      } else if (key.escape) {
        setComposeText('');
      } else if (input && !key.ctrl && !key.meta) {
        setComposeText(prev => prev + input);
      }
    } else if (activeWindow === 'timeline' || activeWindow === 'tweets') {
      const items = activeWindow === 'timeline' ? timeline : myTweets;

      if (input === 'j' || key.downArrow) {
        setSelectedIndex(prev => Math.min(prev + 1, items.length - 1));
      } else if (input === 'k' || key.upArrow) {
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (input === 'r') {
        refreshTimeline();
      }
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box marginBottom={1} justifyContent="center">
        <Text bold color="cyan">
          🐦 TUI Twitter Client
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
            onSubmit={postTweet}
            isActive={activeWindow === 'compose'}
          />
        </Box>

        {/* Middle column - Timeline */}
        <Box width="34%" marginRight={1}>
          <Timeline
            tweets={timeline}
            isActive={activeWindow === 'timeline'}
            selectedIndex={selectedIndex}
          />
        </Box>

        {/* Right column - My Tweets */}
        <Box width="33%">
          <TweetList
            tweets={myTweets}
            isActive={activeWindow === 'tweets'}
            selectedIndex={selectedIndex}
            title="My Tweets"
          />
        </Box>
      </Box>

      {/* Help footer */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>
          Tab: Switch windows | Ctrl+Enter: Post tweet | j/k or ↑/↓: Navigate | r: Refresh | q: Quit
        </Text>
      </Box>
    </Box>
  );
};
