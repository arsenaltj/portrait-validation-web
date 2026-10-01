import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {tripoStatus, denyTripoRequest} from './tripo-adapter.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORTRAIT_WEB_PORT||18873);
if(!Number.isInteger(port)||port<1024||port>65535) throw Error('Invalid local port');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.glb':'model/gltf-binary','.png':'image/png','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'"};
  const send=(status,body)=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body));};
  if(!['127.0.0.1:'+port,'localhost:'+port].includes(req.headers.host)) return send(403,{error:'仅允许本机访问'});
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);}catch{return send(400,{error:'无效路径'});}
  if(pathname==='/api/tripo/status') return send(200,tripoStatus());
  if(pathname.startsWith('/api/tripo/')) return send(403,denyTripoRequest());
  if(req.method!=='GET'&&req.method!=='HEAD') return send(405,{error:'本地文件在浏览器处理，服务器不接收上传'});
  let filename;
  if(pathname.startsWith('/vendor/')) {
    const relative=pathname.slice(8);
    if(!/^(build\/three\.module\.js|build\/three\.core\.js|examples\/jsm\/[\w./-]+\.js)$/.test(relative)||relative.includes('..')) return send(404,{error:'文件不存在'});
    filename=path.join(root,'node_modules','three',relative);
  } else if(['/','/index.html','/app.js','/core.mjs','/style.css','/favicon.svg','/demo.glb'].includes(pathname)) filename=path.join(root,pathname==='/'?'index.html':pathname.slice(1));
  else return send(404,{error:'文件不存在'});
  fs.stat(filename,(error,stat)=>{
    if(error||!stat.isFile())return send(404,{error:'文件不存在'});
    res.writeHead(200,{...headers,'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Content-Length':stat.size});
    if(req.method==='HEAD')res.end();else fs.createReadStream(filename).pipe(res);
  });
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`端口 ${port} 已被使用。请用 start.ps1 -Port 指定其他端口；没有停止任何已有服务。`:error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>{
  fs.mkdirSync(path.join(root,'runtime'),{recursive:true});
  fs.writeFileSync(path.join(root,'runtime','server.json'),JSON.stringify({pid:process.pid,port,url:`http://127.0.0.1:${port}`,project:root,startedAt:new Date().toISOString()},null,2));
  console.log(`本地验证工作台 http://127.0.0.1:${port} · Tripo 未启用`);
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
