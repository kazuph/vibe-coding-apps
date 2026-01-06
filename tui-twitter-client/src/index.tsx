#!/usr/bin/env node
import React from 'react';
import { render } from '@opentui/react';
import { Effect, Layer, Runtime } from 'effect';
import { App } from './components/App.js';
import { StorageServiceLive, defaultConfig } from './services/storage.js';

// Create the runtime with Storage service
const layer = StorageServiceLive(defaultConfig);
const runtime = Effect.runSync(Layer.toRuntime(layer));

// Render the app
render(<App runtime={runtime} />);
