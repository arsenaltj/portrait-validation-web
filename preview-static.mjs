import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.join(path.dirname(fileURLToPath(import.meta.url)),'dist'),prefix='/portrait-validation-web/',port=18874;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.glb':'model/gltf-binary','.svg':'image/svg+xml','.txt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let file,status=200;
  try{const suffix=decodeURIComponent(pathname.slice(prefix.length));if(!pathname.startsWith(prefix)||suffix.includes('..')||suffix.includes('\\'))throw Error();file=path.join(root,suffix||'index.html');if(!fs.statSync(file).isFile())throw Error();}catch{file=path.join(root,'404.html');status=404;}
  res.writeHead(status,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Static subpath preview http://127.0.0.1:${port}${prefix}`));
