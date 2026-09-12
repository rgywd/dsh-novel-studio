import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { Store } from './store.js';
import { Domain } from './domain.js';
import { Runner } from './runtime.js';
import { HttpApp } from './http.js';
const store=new Store(resolve(process.env.NOVEL_STUDIO_DB??'.local/novel-studio.sqlite'));
const domain=new Domain(store);domain.recover();const runner=new Runner(domain);const app=new HttpApp(domain,runner,fileURLToPath(new URL('.',import.meta.url)));
const server=createServer((req,res)=>void app.handle(req,res));const port=Number(process.env.NOVEL_STUDIO_PORT??4317);
server.listen(port,'127.0.0.1',()=>console.log(`DSH Novel Studio: http://127.0.0.1:${port}/novel-studio/ (standalone; real AI requires DSH plugin)`));
let closing=false;async function shutdown(){if(closing)return;closing=true;server.close();await runner.close();store.close();process.exit(0);}
process.on('SIGINT',()=>void shutdown());process.on('SIGTERM',()=>void shutdown());
