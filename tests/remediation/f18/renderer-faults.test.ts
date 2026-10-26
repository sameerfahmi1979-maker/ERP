import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import http from 'node:http';
import {jsPDF} from 'jspdf';
import {gotenbergConvertHtml,gotenbergConvertUrl,isGotenbergHealthy,getGotenbergVersion} from '@/lib/pdf/gotenberg';
import {readValidatedPdfResponse} from '@/lib/pdf/validate-response';

// Real loopback HTTP transport. No Gotenberg/Chromium or browser is launched.
let origin:string, mode='success';
const pdf=new jsPDF();pdf.text('F18 synthetic renderer response',20,20);
const bytes=Buffer.from(pdf.output('arraybuffer'));
const secret='F18_SYNTHETIC_PRIVATE_RESPONSE';
const server=http.createServer((req,res)=>{
 req.on('end',()=>{
 res.setHeader('Connection','close');
 if(mode==='hang')return;
 if(mode==='error'){res.writeHead(503);res.end(secret+' recipient@example.invalid token=synthetic');return;}
 if(mode==='error-stream'){res.writeHead(503);res.flushHeaders();res.write(secret);return;}
 if(req.url==='/health'){res.writeHead(200);res.end('ok');return;}
 if(mode==='invalid'){res.writeHead(200,{'Content-Type':'application/pdf'});res.end('%PDF-1.7 broken %%EOF');return;}
 res.writeHead(200,{'Content-Type':'application/pdf','Content-Length':bytes.length});res.end(bytes);
 });
 req.resume();
});
beforeAll(async()=>{await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 vi.stubEnv('GOTENBERG_URL',origin);vi.stubEnv('INTERNAL_SITE_URL','http://127.0.0.1:17089');});
afterEach(()=>{mode='success';});
afterAll(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));vi.unstubAllEnvs();});
describe('F18 renderer dependency faults',()=>{
 it('accepts an actually parsed synthetic PDF over local HTTP',async()=>{const result=await gotenbergConvertHtml({html:'<p>synthetic</p>'});expect(result.buffer).toEqual(bytes);expect(result.fileSizeBytes).toBe(bytes.length);});
 it.each(['html','url'])('never exposes the failed %s renderer response body',async(kind)=>{mode='error';
  const work=kind==='html'?gotenbergConvertHtml({html:'<p>synthetic</p>'}):gotenbergConvertUrl({url:'http://127.0.0.1:17089/print/test/record/1?token=synthetic'});
  let error:unknown;try{await work;}catch(e){error=e;}expect(error).toBeInstanceOf(Error);expect(String(error)).toContain('HTTP 503');expect(String(error)).not.toContain(secret);expect(String(error)).not.toContain('recipient@');
 });
 it('does not wait for an unbounded failed response body',async()=>{mode='error-stream';const at=Date.now();await expect(gotenbergConvertHtml({html:'<p>synthetic</p>',timeout:5000})).rejects.toThrow('HTTP 503');expect(Date.now()-at).toBeLessThan(2000);});
 it('bounds a renderer that never returns headers',async()=>{mode='hang';const at=Date.now();await expect(gotenbergConvertHtml({html:'<p>synthetic</p>',timeout:100})).rejects.toThrow();expect(Date.now()-at).toBeLessThan(2000);});
 it('rejects HTTP 200 with invalid PDF bytes',async()=>{mode='invalid';await expect(gotenbergConvertHtml({html:'<p>synthetic</p>'})).rejects.toThrow('validated');});
 it('reports an unavailable renderer as unhealthy',async()=>{mode='error';expect(await isGotenbergHealthy()).toBe(false);});
 it('does not infer a renderer version from an unavailable health endpoint',async()=>{mode='error';expect(await getGotenbergVersion()).toBe('unknown');});
 it.each(['type','size'])('rejects invalid %s without waiting for broken cancellation',async(kind)=>{
  const cancel=vi.fn(()=>new Promise<void>(()=>{}));
  const response=new Response(new ReadableStream({cancel}),{headers:kind==='type'?{'Content-Type':'text/html'}:{'Content-Type':'application/pdf','Content-Length':'999999999'}});
  await expect(readValidatedPdfResponse(response)).rejects.toThrow(kind==='type'?'application/pdf':'size limit');expect(cancel).toHaveBeenCalledOnce();
 });
 it('cancels rejected PDF response bodies',async()=>{const cancel=vi.fn();const response=new Response(new ReadableStream({cancel}),{status:503});await expect(readValidatedPdfResponse(response)).rejects.toThrow('HTTP 503');await Promise.resolve();expect(cancel).toHaveBeenCalledOnce();});
});
