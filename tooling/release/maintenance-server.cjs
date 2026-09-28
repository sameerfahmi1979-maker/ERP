'use strict';
// Temporary ERP-only bridge. No Next.js, database client, Auth, worker or credentials.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../public/maintenance.html'));
const port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
const server=http.createServer((req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400,{'Cache-Control':'no-store'});res.end();return;}
 req.resume();
 const health=url.pathname==='/api/health/release'&&['GET','HEAD'].includes(req.method);
 const browser=req.method==='GET'&&!url.pathname.startsWith('/api/')&&req.headers.accept?.includes('text/html');
 res.writeHead(health?200:503,{'Content-Type':health||!browser?'application/json':'text/html; charset=utf-8','Cache-Control':'private, no-store, max-age=0','X-Robots-Tag':'noindex, nofollow','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',...(!health?{'Retry-After':'120','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"}:{})});
 res.end(req.method==='HEAD'?undefined:health?JSON.stringify({service:'algt-erp',status:'maintenance',check:'liveness-only'}):browser?html:JSON.stringify({error:'maintenance',message:'ALGT ERP is temporarily unavailable for a planned update. Please try again shortly.'}));
});
server.requestTimeout=15000;server.headersTimeout=10000;server.keepAliveTimeout=1000;
server.listen(port,process.env.HOSTNAME_BIND||'0.0.0.0');
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();});
