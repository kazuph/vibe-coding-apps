#!/usr/bin/env node
/**
 * Bundle Sol CLI generated client entry points and MoonBit-compiled loaders
 * for Cloudflare Workers
 *
 * This script:
 * 1. Bundles Sol CLI generated entry points from .sol/prod/client/
 * 2. Creates loader.js from MoonBit-compiled client code
 * 3. Creates sw.js from MoonBit-compiled worker code (if exists)
 */
import { build } from 'esbuild';
import { readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const solClientDir = join(projectRoot, '.sol/prod/client');
const moonbitClientDir = join(projectRoot, 'target/js/release/build/client');
const moonbitWorkerDir = join(projectRoot, 'target/js/release/build/worker');
const outputDir = join(projectRoot, 'static');

// Ensure output directory exists
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// ============================================================================
// 1. Bundle Sol CLI client entry points
// ============================================================================
if (existsSync(solClientDir)) {
  const entryPoints = readdirSync(solClientDir)
    .filter(f => f.endsWith('.js'))
    .map(f => join(solClientDir, f));

  if (entryPoints.length > 0) {
    console.log(`Bundling ${entryPoints.length} Sol CLI client entry points...`);

    for (const entry of entryPoints) {
      const outputFile = join(outputDir, basename(entry));

      try {
        await build({
          entryPoints: [entry],
          bundle: true,
          format: 'esm',
          outfile: outputFile,
          minify: process.env.NODE_ENV === 'production',
          sourcemap: process.env.NODE_ENV !== 'production',
          platform: 'browser',
          target: ['es2020'],
          external: [],
          logLevel: 'info',
        });

        console.log(`  Bundled: ${basename(entry)}`);
      } catch (error) {
        console.error(`  Failed to bundle ${basename(entry)}:`, error.message);
        process.exit(1);
      }
    }
  }
} else {
  console.log('No .sol/prod/client/ directory found, skipping Sol CLI bundles');
}

// ============================================================================
// 2. Create loader.js from MoonBit client
// ============================================================================
const moonbitClientJs = join(moonbitClientDir, 'client.js');
if (existsSync(moonbitClientJs)) {
  console.log('Creating loader.js from MoonBit client...');

  // Create a loader entry point that imports and initializes the MoonBit loader
  const loaderEntry = `
// Luna UI Loader - Generated from MoonBit
import { start } from '${moonbitClientJs}';
start();
`.trim();

  const loaderEntryPath = join(outputDir, '_loader_entry.js');
  writeFileSync(loaderEntryPath, loaderEntry);

  try {
    await build({
      entryPoints: [loaderEntryPath],
      bundle: true,
      format: 'iife', // IIFE for loader (needs to run immediately)
      outfile: join(outputDir, 'loader.js'),
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV !== 'production',
      platform: 'browser',
      target: ['es2020'],
      logLevel: 'info',
    });
    console.log('  Created: loader.js');

    // Clean up temp entry file
    const { unlinkSync } = await import('fs');
    unlinkSync(loaderEntryPath);
  } catch (error) {
    console.error('  Failed to create loader.js:', error.message);
    // Don't exit - loader might not be in client package yet
  }
} else {
  console.log('No MoonBit client output found, keeping existing loader.js');
}

// ============================================================================
// 3. Create sw.js from MoonBit worker (if exists)
// ============================================================================
const moonbitWorkerJs = join(moonbitWorkerDir, 'worker.js');
if (existsSync(moonbitWorkerJs)) {
  console.log('Creating sw.js from MoonBit worker...');

  // Create a SW entry point that imports and initializes the MoonBit SW
  const swEntry = `
// Service Worker - Generated from MoonBit
import { start } from '${moonbitWorkerJs}';
start();
`.trim();

  const swEntryPath = join(outputDir, '_sw_entry.js');
  writeFileSync(swEntryPath, swEntry);

  try {
    await build({
      entryPoints: [swEntryPath],
      bundle: true,
      format: 'iife', // IIFE for SW
      outfile: join(outputDir, 'sw.js'),
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV !== 'production',
      platform: 'browser', // SW runs in browser-like context
      target: ['es2020'],
      logLevel: 'info',
    });
    console.log('  Created: sw.js');

    // Clean up temp entry file
    const { unlinkSync } = await import('fs');
    unlinkSync(swEntryPath);
  } catch (error) {
    console.error('  Failed to create sw.js:', error.message);
    // Don't exit - worker package might not exist yet
  }
} else {
  console.log('No MoonBit worker output found, keeping existing sw.js');
}

console.log('✓ Client bundling complete');
