const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
for (const name of ['astro.js','vendor/compass.js']) new vm.Script(fs.readFileSync(path.join(root,'docs/hoshizora',name),'utf8'),{filename:name});
const html=fs.readFileSync(path.join(root,'docs/hoshizora/index.html'),'utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1],{filename:'index.html'});
console.log('PASS: application and generated bundle JavaScript syntax');
