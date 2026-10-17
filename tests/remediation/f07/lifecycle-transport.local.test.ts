// Actual task-owned local PostgREST + Storage HTTP; no browser/app server/provider.
import {it,expect,vi,beforeAll} from 'vitest';import {createClient} from '@supabase/supabase-js';import {NextRequest} from 'next/server';
const s=vi.hoisted(()=>({user:null as any,admin:null as any,claims:null as any}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>s.user}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>s.admin}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:7001,auth_user_id:'a7000000-0000-4000-8000-000000000001',must_change_password:false},isAccountActive:true}),hasPermission:()=>true,canUseApplication:()=>true}));
import {withDocumentReadPolicy} from '@/lib/supabase/document-read-policy';
import {GET} from '@/app/api/dms/file/route';
import {getDmsDocumentHistoryPage} from '@/server/actions/dms/lifecycle-history';
import {readDmsInboxPage} from '@/server/reads/dms-inbox';
import {readDmsDocumentPage} from '@/server/reads/dms-documents';
import {getDmsDocumentRecordData} from '@/server/actions/dms/documents';
import {readDmsArchivePage} from '@/server/reads/dms-archive';
const bucket=process.env.F07_T08_BUCKET!;
const req=(id=7001)=>new NextRequest(`http://owned.invalid/api/dms/file?fileId=${id}&disposition=attachment`);
beforeAll(async()=>{
 expect(process.env.F07_T08_NATIVE).toBe('owned-local-only');const url=process.env.F07_T08_URL!;expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const make=(token:string)=>createClient(url,token,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 s.admin=make(process.env.F07_T08_SERVICE_TOKEN!);const raw=make(process.env.F07_T08_USER_TOKEN!);s.user=withDocumentReadPolicy(raw);
 s.claims={sub:'a7000000-0000-4000-8000-000000000001',session_id:'b7000000-0000-4000-8000-000000000001'};
 // This test's signed JWT is verified by the actual Data/Storage API. There is
 // no Auth service here; only the route's getClaims adapter is synthetic.
 vi.spyOn(raw.auth,'getClaims').mockResolvedValue({data:{claims:s.claims,header:{},signature:new Uint8Array()},error:null} as any);
 const bucketResult=await s.admin.storage.createBucket(bucket,{public:false});expect(bucketResult.error).toBeNull();
 for(const path of ['synthetic/t08-v1.pdf','synthetic/t08-v2.pdf']){const r=await s.admin.storage.from(bucket).upload(path,new Blob(['abc']),{contentType:'application/pdf'});expect(r.error).toBeNull();}
});
it('retrieves actual original bytes over Storage and commits the actor/version audit',async()=>{const r=await GET(req());expect(r.status).toBe(200);expect(await r.text()).toBe('abc');const h=await getDmsDocumentHistoryPage(7001,1,'downloads');expect(h.success).toBe(true);expect(h.success&&h.data.rows.some(e=>e.event_type==='file_download_response_prepared')).toBe(true);});
it('retains historical byte access and records the historical version',async()=>{const r=await GET(req(7002));expect(r.status).toBe(200);expect(await r.text()).toBe('abc');const h=await getDmsDocumentHistoryPage(7001,1,'downloads');expect(h.success&&h.data.rows.some(e=>(e.metadata_json as any).historical===true)).toBe(true);});
it('does not expose storage locators in history',async()=>{const h=await getDmsDocumentHistoryPage(7001);expect(h.success).toBe(true);expect(JSON.stringify(h)).not.toMatch(/storage_path|storage_bucket|synthetic\/t08|Bearer/);});
it('owned unexpired unlinked uploads are visible without requiring an AI result',async()=>{const r=await readDmsInboxPage({});expect(r.success).toBe(true);expect(r.data?.rows.some(s=>s.id===7900)).toBe(true);});
it('the server-paged lifecycle collection retains historical documents',async()=>{const all=await readDmsDocumentPage({page:1,pageSize:1,filters:{excludeArchived:false}});expect(all.success).toBe(true);expect(all.data?.totalCount).toBe(2);expect(all.data?.rows).toHaveLength(1);const next=await readDmsDocumentPage({page:2,pageSize:1,filters:{excludeArchived:false}});expect(next.success).toBe(true);expect(next.data?.rows).toHaveLength(1);expect(next.data?.rows[0].id).not.toBe(all.data?.rows[0].id);});
it('record hydration does not fabricate empty child collections',async()=>{const r=await getDmsDocumentRecordData(7001);expect(r.success).toBe(true);expect(r.data?.id).toBe(7001);expect(r.data?.superseded_by).toBeNull();expect(r.data).not.toHaveProperty('metadata_values');expect(r.data).not.toHaveProperty('files');expect(r.data).not.toHaveProperty('versions');});
it('a canonical renewal produces valid protected replacement links in archive and record reads',async()=>{const renewed=await s.user.rpc('f07_complete_document_renewal',{p_request:7001,p_replacement:7002,p_version:null,p_expiry:'2028-02-29',p_notes:null});expect(renewed.error).toBeNull();const record=await getDmsDocumentRecordData(7001);expect(record.data?.superseded_by).toMatchObject({id:7002,document_no:'F07-REPLACEMENT'});const archive=await readDmsArchivePage({});expect(archive.success).toBe(true);expect(archive.data?.rows[0].superseded_by?.id).toBe(7002);const active=await readDmsDocumentPage({filters:{excludeArchived:true}});expect(active.data?.totalCount).toBe(1);});
it('actual storage corruption is not served as an audited success',async()=>{const updated=await s.admin.storage.from(bucket).update('synthetic/t08-v2.pdf',new Blob(['wrong bytes']),{contentType:'application/pdf'});expect(updated.error).toBeNull();const before=await getDmsDocumentHistoryPage(7001,1,'downloads');const r=await GET(req(7002));expect(r.status).toBe(409);const after=await getDmsDocumentHistoryPage(7001,1,'downloads');expect(after.success&&after.data.totalCount).toBe(before.success&&before.data.totalCount);});
it('a removed actual storage object does not become a successful download',async()=>{expect((await s.admin.storage.from(bucket).remove(['synthetic/t08-v2.pdf'])).error).toBeNull();expect((await GET(req(7002))).status).toBe(502);});
it('direct authenticated receipt forgery is denied by the actual API',async()=>{const r=await s.user.rpc('f07_record_file_response',{p_file:7001,p_binding:{},p_action:'download',p_bytes:3,p_sha:'f'.repeat(64),p_claims:s.claims});expect(r.error).toBeTruthy();});
it('does not bypass a revoked original session after Data/Storage have been configured',async()=>{s.user.auth.getClaims.mockResolvedValue({data:{claims:{...s.claims,session_id:'b7000000-0000-4000-8000-000000000099'}},error:null});const r=await GET(req());expect(r.status).toBe(403);});
