import React from 'react';
import { Box, Text } from '@opentui/react';
import type { Post } from '../types/post.js';

interface TimelineProps {
  posts: Post[];
  isActive: boolean;
  selectedIndex: number;
}

export const Timeline: React.FC<TimelineProps> = ({ posts, isActive, selectedIndex }) => {
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

      {posts.length === 0 ? (
        <Box>
          <Text dimColor>No posts to display</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {posts.map((post, index) => (
            <Box
              key={post.id}
              flexDirection="column"
              marginBottom={1}
              paddingLeft={1}
              borderStyle={isActive && index === selectedIndex ? 'single' : undefined}
              borderColor="yellow"
            >
              <Box>
                <Text dimColor>{formatDate(post.createdAt)}</Text>
                {post.favorite && <Text color="yellow"> ⭐</Text>}
              </Box>
              <Box marginTop={0}>
                <Text>{post.text}</Text>
              </Box>
              {post.tags && post.tags.length > 0 && (
                <Box marginTop={0}>
                  <Text dimColor>
                    {post.tags.map(tag => `#${tag}`).join(' ')}
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
