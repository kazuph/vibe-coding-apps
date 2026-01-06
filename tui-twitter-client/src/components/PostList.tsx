import React from 'react';
import { Box, Text } from '@opentui/react';
import type { Post } from '../types/post.js';

interface PostListProps {
  posts: Post[];
  isActive: boolean;
  selectedIndex: number;
  title: string;
}

export const PostList: React.FC<PostListProps> = ({ posts, isActive, selectedIndex, title }) => {
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

      {posts.length === 0 ? (
        <Box>
          <Text dimColor>No posts yet</Text>
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
                <Text color="white">{post.text.slice(0, 80)}{post.text.length > 80 ? '...' : ''}</Text>
                {post.favorite && <Text color="yellow"> ⭐</Text>}
              </Box>
              <Box marginTop={0}>
                <Text dimColor>
                  {new Date(post.createdAt).toLocaleString()}
                </Text>
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
