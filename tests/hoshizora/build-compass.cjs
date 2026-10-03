const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const out = path.resolve(__dirname, '../../docs/hoshizora/vendor');
fs.mkdirSync(out, {recursive:true});
esbuild.buildSync({entryPoints:[path.join(__dirname,'compass-entry.cjs')], bundle:true,
  platform:'browser', format:'iife', outfile:path.join(out,'compass.js'),
  banner:{js:'/* Generated from geomagnetism 0.2.0 + NOAA/BGS WMM2025. Apache-2.0; see geomagnetism-LICENSE.txt.\n   hoshizora wrapper changes decimal-year calculation and validity handling; rebuild: npm --prefix tests/hoshizora run build */'}});
fs.copyFileSync(require.resolve('geomagnetism/LICENSE'),path.join(out,'geomagnetism-LICENSE.txt'));
