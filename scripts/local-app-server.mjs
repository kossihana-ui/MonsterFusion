import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.MONSTERFUSION_PORT || 5187);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.wav':'audio/wav', '.ico':'image/x-icon', '.webp':'image/webp' };
await stat(resolve(root, 'index.html'));
createServer(async (req, res) => {
  const send = (code, body, type='text/plain; charset=utf-8') => {
    res.writeHead(code, {'Content-Type':type, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff'});
    res.end(req.method === 'HEAD' ? undefined : body);
  };
  if (!['GET','HEAD'].includes(req.method)) return send(405,'Method not allowed');
  try {
    const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
    if(pathname === '/__monsterfusion_health') return send(200,'MonsterFusion-local-app-v1');
    const path=resolve(root,'.'+pathname);
    if(!path.startsWith(resolve(root)+sep) && path!==resolve(root)) return send(403,'Forbidden');
    const file=pathname==='/' ? resolve(root,'index.html') : path;
    const content=await readFile(file);
    send(200,content,types[extname(file)] || 'application/octet-stream');
  } catch { send(404,'Not found'); }
}).listen(port,'127.0.0.1',()=>console.log(`MonsterFusion: http://127.0.0.1:${port}/`));
