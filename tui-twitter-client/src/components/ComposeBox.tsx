import React from 'react';
import { Box, Text } from '@opentui/react';

interface ComposeBoxProps {
  text: string;
  onSubmit: (text: string) => void;
  isActive: boolean;
}

export const ComposeBox: React.FC<ComposeBoxProps> = ({ text, onSubmit, isActive }) => {
  const maxLength = 280;
  const remaining = maxLength - text.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={isActive ? 'cyan' : 'gray'}
      padding={1}
    >
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Compose Tweet {isActive && '(Active)'}
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{text || '(Type your tweet here...)'}</Text>
      </Box>

      <Box justifyContent="space-between">
        <Text color={remaining < 0 ? 'red' : remaining < 20 ? 'yellow' : 'white'}>
          {remaining} characters remaining
        </Text>
        <Text dimColor>
          Press Ctrl+Enter to tweet
        </Text>
      </Box>
    </Box>
  );
};
