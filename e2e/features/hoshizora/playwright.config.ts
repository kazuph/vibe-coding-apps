import path from 'node:path';
import {defineConfig,devices} from '../../../tests/hoshizora/playwright';
export default defineConfig({
  testDir:'.',testMatch:'*.spec.ts',timeout:30000,fullyParallel:true,workers:2,retries:0,
  outputDir:path.resolve(__dirname,'../../../.artifacts/hoshizora/playwright'),
  reporter:[['list'],['json',{outputFile:path.resolve(__dirname,'../../../.artifacts/hoshizora/e2e-results.json')}]],
  use:{baseURL:process.env.HOSHIZORA_BASE_URL || 'http://127.0.0.1:18764',channel:'chrome',
    permissions:['geolocation'],geolocation:{latitude:37.916,longitude:139.036},trace:'retain-on-failure'},
  projects:[
    {name:'desktop-utc',use:{viewport:{width:1440,height:900},timezoneId:'UTC'}},
    {name:'pixel-tokyo',use:{...devices['Pixel 7'],defaultBrowserType:'chromium',timezoneId:'Asia/Tokyo'}},
    {name:'iphone-newyork',use:{...devices['iPhone 15'],defaultBrowserType:'chromium',timezoneId:'America/New_York'}},
    {name:'landscape-tokyo',use:{...devices['iPhone 15 landscape'],defaultBrowserType:'chromium',timezoneId:'Asia/Tokyo'}}
  ],
  webServer:process.env.HOSHIZORA_BASE_URL?undefined:{command:'python3 -m http.server 18764 --bind 127.0.0.1 --directory docs',cwd:'../../..',url:'http://127.0.0.1:18764/hoshizora/',reuseExistingServer:false}
});
