import React from 'react';
import { Box, Text } from '@opentui/react';
import type { Tweet } from '../types/tweet.js';

interface TweetListProps {
  tweets: Tweet[];
  isActive: boolean;
  selectedIndex: number;
  title: string;
}

export const TweetList: React.FC<TweetListProps> = ({ tweets, isActive, selectedIndex, title }) => {
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
          {title} {isActive && '(Active)'}
        </Text>
      </Box>

      {tweets.length === 0 ? (
        <Box>
          <Text dimColor>No tweets yet</Text>
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
                <Text color="white">{tweet.text.slice(0, 80)}{tweet.text.length > 80 ? '...' : ''}</Text>
              </Box>
              <Box marginTop={0}>
                <Text dimColor>
                  {new Date(tweet.createdAt).toLocaleString()}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};
