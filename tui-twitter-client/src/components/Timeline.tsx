import React from 'react';
import { Box, Text } from '@opentui/react';
import type { Tweet } from '../types/tweet.js';

interface TimelineProps {
  tweets: Tweet[];
  isActive: boolean;
  selectedIndex: number;
}

export const Timeline: React.FC<TimelineProps> = ({ tweets, isActive, selectedIndex }) => {
  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isActive ? 'cyan' : 'gray'}
      padding={1}
      height="100%"
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Timeline {isActive && '(Active)'}
        </Text>
      </Box>

      {tweets.length === 0 ? (
        <Box>
          <Text dimColor>No tweets to display</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {tweets.map((tweet, index) => (
            <Box
              key={tweet.id}
              flexDirection="column"
              marginBottom={1}
              paddingLeft={1}
              borderStyle={isActive && index === selectedIndex ? 'single' : undefined}
              borderColor="yellow"
            >
              <Box>
                <Text bold color="green">
                  {tweet.author.name}
                </Text>
                <Text dimColor> @{tweet.author.username}</Text>
                <Text dimColor> · {formatDate(tweet.createdAt)}</Text>
              </Box>
              <Box marginTop={0}>
                <Text>{tweet.text}</Text>
              </Box>
              {tweet.metrics && (
                <Box marginTop={0}>
                  <Text dimColor>
                    💬 {tweet.metrics.replies} 🔁 {tweet.metrics.retweets} ❤️ {tweet.metrics.likes}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
