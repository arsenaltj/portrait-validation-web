import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('HTML resources and demo fetch work beneath a Pages project subpath',()=>{const html=read('index.html');assert.ok(html.includes('src="./app.js"'));assert.ok(html.includes('href="./style.css"'));assert.ok(html.includes('"three":"./vendor/build/three.module.js"'));assert.ok(!/(?:src|href)="\//.test(html));assert.ok(read('app.js').includes("new URL('./demo.glb',import.meta.url)"));});
test('browser entry has no provider, upload or telemetry transport',()=>{const js=read('app.js');assert.equal((js.match(/\bfetch\s*\(/g)||[]).length,1);assert.ok(!/XMLHttpRequest|WebSocket|sendBeacon|\/api\/|API_KEY|https?:\/\//.test(js));assert.ok(read('index.html').includes('form-action \'none\''));});
test('static build uses a file allowlist and leaves server interfaces out',()=>{const build=read('build-static.mjs');assert.ok(build.includes("const publicFiles=['index.html','app.js','core.mjs','style.css','favicon.svg','demo.glb']"));assert.ok(build.includes('Unexpected public artifact'));});
