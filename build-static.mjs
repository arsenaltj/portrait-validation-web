import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'dist');
const base=process.env.PAGES_BASE_PATH||'/portrait-validation-web/';
if(!/^\/[a-zA-Z0-9_-]+\/$/.test(base))throw Error('Invalid static base path');
fs.mkdirSync(out,{recursive:true});
const publicFiles=['index.html','app.js','core.mjs','style.css','favicon.svg','demo.glb'];
for(const name of publicFiles)fs.copyFileSync(path.join(root,name),path.join(out,name));
const vendor=['build/three.module.js','build/three.core.js','examples/jsm/controls/OrbitControls.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/utils/BufferGeometryUtils.js','examples/jsm/utils/SkeletonUtils.js'];
for(const name of vendor){const destination=path.join(out,'vendor',name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,'node_modules','three',name),destination);}
fs.copyFileSync(path.join(root,'node_modules','three','LICENSE'),path.join(out,'THREE-LICENSE.txt'));
fs.writeFileSync(path.join(out,'.nojekyll'),'');
fs.writeFileSync(path.join(out,'404.html'),`<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在 · 六色验证</title><body style="font-family:system-ui;background:#101820;color:#dbe6f0;padding:40px"><h1>页面不存在</h1><p>此工具没有模型、照片或生成 API 的公开下载入口。</p><p><a style="color:#75e3da" href="${base}">返回六色验证工作台</a></p></body></html>`);
// Fail closed if a prior build directory contains any extra bytes. No broad copy
// of the project, node_modules, private fixtures, outputs or runtime is allowed.
const expected=new Set([...publicFiles,...vendor.map(x=>'vendor/'+x),'THREE-LICENSE.txt','.nojekyll','404.html']);
function list(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?list(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);}
const actual=list(out);for(const name of actual)if(!expected.has(name))throw Error('Unexpected public artifact: '+name);
if(actual.length!==expected.size)throw Error('Missing static artifact');
console.log(`Static artifact: ${actual.length} allowlisted files; no server, credentials, logs or private samples.`);
