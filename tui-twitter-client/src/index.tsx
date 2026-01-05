#!/usr/bin/env node
import React from 'react';
import { render } from '@opentui/react';
import { Effect, Layer, Runtime } from 'effect';
import { App } from './components/App.js';
import { TwitterServiceLive, TwitterServiceTag } from './services/twitter.js';
import type { TwitterConfig } from './types/tweet.js';

// Load Twitter API credentials from environment variables
const config: TwitterConfig = {
  apiKey: process.env.TWITTER_API_KEY || '',
  apiSecret: process.env.TWITTER_API_SECRET || '',
  accessToken: process.env.TWITTER_ACCESS_TOKEN || '',
  accessSecret: process.env.TWITTER_ACCESS_SECRET || '',
};

// Validate configuration
if (!config.apiKey || !config.apiSecret || !config.accessToken || !config.accessSecret) {
  console.error('Error: Twitter API credentials not found!');
  console.error('Please set the following environment variables:');
  console.error('  TWITTER_API_KEY');
  console.error('  TWITTER_API_SECRET');
  console.error('  TWITTER_ACCESS_TOKEN');
  console.error('  TWITTER_ACCESS_SECRET');
  console.error('\nYou can create a .env file with these variables.');
  process.exit(1);
}

// Create the runtime with Twitter service
const layer = TwitterServiceLive(config);
const runtime = Effect.runSync(Layer.toRuntime(layer));

// Render the app
render(<App runtime={runtime} />);
