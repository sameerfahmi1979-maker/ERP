// Real local Data API, Storage HTTP and backend PDF renderer; synthetic Auth
// context adapter only. Never browser automation, hosted data or official text.
import {beforeAll,expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
const s=vi.hoisted(()=>({user:null as any,admin:null as any,mode:'none',renderCount:0,perm:true}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:980101},isAccountActive:true}),canUseApplication:()=>true}));
import {recoverDurableOutput} from '@/lib/output/durable-operation';
import {GET} from '@/app/api/output/file/route';
const sha=(x:Buffer)=>createHash('sha256').update(x).digest('hex');
const request=(id:number)=>new NextRequest(`http://synthetic.invalid/api/output/file?issuanceId=${id}`);
const nativeFetch=globalThis.fetch.bind(globalThis);
beforeAll(()=>{
 expect(process.env.F08_NATIVE_TRANSPORT).toBe('owned-local-only');const url=process.env.F08_NATIVE_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`},fetch:async(input,init)=>{
  const response=await nativeFetch(input,init),path=String(input);
  const body=typeof init?.body==='string'?JSON.parse(init.body):{};
  if(s.mode==='checkpoint'&&path.endsWith('/rpc/f08_checkpoint_operation')&&body.p_pdf){s.mode='none';await response.arrayBuffer();return new Response(JSON.stringify({message:'Synthetic lost committed checkpoint response'}),{status:503,headers:{'content-type':'application/json'}});}
  if(s.mode==='finish'&&path.endsWith('/rpc/f08_finish_operation')){s.mode='none';await response.arrayBuffer();return new Response(JSON.stringify({message:'Synthetic lost committed issue response'}),{status:503,headers:{'content-type':'application/json'}});}
  if(s.mode==='upload'&&init?.method==='POST'&&path.includes('/storage/v1/object/erp-generated-pdfs/')){s.mode='none';await response.arrayBuffer();return new Response(JSON.stringify({message:'Synthetic lost upload response'}),{status:504,headers:{'content-type':'application/json'}});}
  return response;
 }}});
 s.user=make(process.env.F08_NATIVE_USER!);s.admin=make(process.env.F08_NATIVE_SERVICE!);
 vi.spyOn(globalThis,'fetch').mockImplementation(async(input,init)=>{if(String(input).includes('/forms/chromium/convert/html'))s.renderCount++;return nativeFetch(input,init);});
});
it('issues through actual RPC/renderer/Storage and downloads identical original bytes twice',async()=>{
 const r=await recoverDurableOutput(980102);expect(r,JSON.stringify(r)).toMatchObject({kind:'issued',issuanceId:980102});if(r.kind!=='issued')return;
 const a=await GET(request(980102)),b=await GET(request(980102));expect(a.status).toBe(200);expect(b.status).toBe(200);
 const bytes=Buffer.from(await a.arrayBuffer());expect(sha(bytes)).toBe(r.finalSha256);expect(sha(Buffer.from(await b.arrayBuffer()))).toBe(r.finalSha256);
 expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(a.headers.get('cache-control')).toContain('no-store');
});
it('a committed checkpoint with a lost HTTP reply resumes exact bytes without re-render',async()=>{
 s.mode='checkpoint';const before=s.renderCount;expect((await recoverDurableOutput(980103)).kind).toBe('reconciliation_required');expect((await recoverDurableOutput(980103)).kind).toBe('issued');expect(s.renderCount-before).toBe(1);
});
it('a lost upload HTTP reply reconciles actual stored bytes without overwriting',async()=>{s.mode='upload';expect((await recoverDurableOutput(980104)).kind).toBe('issued');});
it('a lost issue HTTP reply replays the committed original without rendering again',async()=>{
 s.mode='finish';const before=s.renderCount;expect((await recoverDurableOutput(980105)).kind).toBe('reconciliation_required');expect(await recoverDurableOutput(980105)).toMatchObject({kind:'issued',issuanceId:980105,idempotentReplay:true});expect(s.renderCount-before).toBe(1);
});
it('changing only synthetic employee data cannot change an issued original download',async()=>{
 const before=await GET(request(980102));const hash=sha(Buffer.from(await before.arrayBuffer()));
 const mutation=await s.admin.from('employees').update({full_name_en:'Changed synthetic source after issue'}).eq('id',980101);expect(mutation.error).toBeNull();
 const after=await GET(request(980102));expect(after.status).toBe(200);expect(sha(Buffer.from(await after.arrayBuffer()))).toBe(hash);
});
it('a differently stored object cannot be silently replaced by recovery',async()=>{
 expect((await s.admin.storage.from('erp-generated-pdfs').upload('f08-lifecycle/980106.pdf',Buffer.from('Synthetic collision'),{contentType:'application/pdf',upsert:false})).error).toBeNull();
 expect((await recoverDurableOutput(980106)).kind).toBe('reconciliation_required');
 const original=await s.admin.storage.from('erp-generated-pdfs').download('f08-lifecycle/980106.pdf');expect(await original.data.text()).toBe('Synthetic collision');
});
it('direct authenticated checkpoint forgery is denied by the actual API',async()=>{const r=await s.user.rpc('f08_checkpoint_operation',{p_id:980107,p_lease:crypto.randomUUID(),p_actor:980101,p_session:'f0800000-0000-4000-8000-000000000102',p_plan:{html:'fake'}});expect(r.error).toBeTruthy();});
it('actual public verification follows revocation rather than a stale link',async()=>{
 const issued=await recoverDurableOutput(980108);expect(issued.kind).toBe('issued');
 const revoked=await s.user.rpc('f08_revoke_output',{p_id:980108,p_reason:'Synthetic transport revocation'});expect(revoked.error).toBeNull();expect((await GET(request(980108))).status).toBe(404);expect((await recoverDurableOutput(980108)).kind).toBe('reconciliation_required');
});
