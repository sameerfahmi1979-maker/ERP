import {it,expect,vi,beforeEach} from 'vitest';
const s=vi.hoisted(()=>({from:vi.fn(),access:vi.fn(),active:vi.fn(),replies:[] as any[],calls:[] as any[]}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({from:s.from})}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:1}}),canUseApplication:s.active}));
vi.mock('@/lib/dms/document-access',()=>({checkDocumentConfidentialityAccess:s.access}));
import {getDmsDocumentHistoryPage,getDmsDocumentLifecycle} from '@/server/actions/dms/lifecycle-history';
const event=(id=1)=>({id,document_id:7,event_type:'file_download_response_prepared',description:'Prepared',performed_by:1,performed_at:'2026-10-17T00:00:00+00:00',metadata_json:{file_id:9,version_id:8,bytes:3,delivery:'response_prepared',historical:true,storage_path:'PRIVATE',token:'SECRET',value_json:'PRIVATE'},performer:{display_name:'Synthetic'}});
beforeEach(()=>{vi.clearAllMocks();s.replies=[];s.calls=[];s.active.mockReturnValue(true);s.access.mockResolvedValue({allowed:true});s.from.mockImplementation((table:string)=>{
 const q:any={};for(const key of ['select','eq','is','order','range','in'])q[key]=(...args:any[])=>{s.calls.push([table,key,...args]);return q;};q.then=(resolve:any,reject:any)=>Promise.resolve(s.replies.shift()).then(resolve,reject);q.maybeSingle=()=>Promise.resolve(s.replies.shift());return q;
});});
it.each([0,-1,1.2,Number.MAX_SAFE_INTEGER+1])('rejects invalid document %s before reads',async id=>{expect((await getDmsDocumentHistoryPage(id)).success).toBe(false);expect(s.from).not.toHaveBeenCalled();});
it.each([0,100001,NaN])('rejects invalid history page %s',async p=>{expect((await getDmsDocumentHistoryPage(7,p)).success).toBe(false);expect(s.from).not.toHaveBeenCalled();});
it('rejects inactive accounts before data access',async()=>{s.active.mockReturnValue(false);expect((await getDmsDocumentHistoryPage(7)).success).toBe(false);expect(s.from).not.toHaveBeenCalled();});
it('does not make a hidden parent look like empty history',async()=>{s.access.mockResolvedValue({allowed:false});expect((await getDmsDocumentHistoryPage(7)).success).toBe(false);expect(s.from).not.toHaveBeenCalled();});
it('pages on the server with stable ordering and strips arbitrary JSON',async()=>{s.replies=[{data:[event()],count:21,error:null}];const r=await getDmsDocumentHistoryPage(7,2,'downloads');expect(r.data).toMatchObject({totalCount:21,page:2,pageSize:20,rows:[{metadata_json:{file_id:9,version_id:8,bytes:3,historical:true,delivery:'response_prepared'}}]});expect(JSON.stringify(r)).not.toMatch(/SECRET|PRIVATE/);expect(s.calls).toContainEqual(['dms_document_events','range',20,39]);expect(s.calls).toContainEqual(['dms_document_events','order','id',{ascending:false}]);expect(s.calls.some(c=>c[1]==='in')).toBe(true);});
it.each([
 {data:[],count:21,error:null}, {data:null,count:0,error:{code:'XX000'}},{data:[],count:null,error:null},
 {data:[event(),event()],count:2,error:null},{data:[{...event(),document_id:8}],count:1,error:null},
 {data:[{...event(),performed_at:'invalid'}],count:1,error:null},
])('fails closed on incomplete, foreign, failed or invalid history %j',async reply=>{s.replies=[reply];expect((await getDmsDocumentHistoryPage(7)).success).toBe(false);});
it('supports an out-of-range page only with a verified count',async()=>{s.replies=[{data:null,count:null,error:{code:'PGRST103'},status:416},{data:null,count:2,error:null}];expect((await getDmsDocumentHistoryPage(7,2)).data).toMatchObject({rows:[],totalCount:2});});
it('denies access revoked during history I/O',async()=>{s.access.mockResolvedValueOnce({allowed:true}).mockResolvedValueOnce({allowed:false});s.replies=[{data:[event()],count:1,error:null}];expect((await getDmsDocumentHistoryPage(7)).success).toBe(false);});
it('does not reuse a stale lifecycle subject',async()=>{s.replies=[{data:{id:7,status:'archived',review_status:'reviewed',approval_status:'approved',current_version_id:8,is_archived:true,superseded_by_document_id:null,owner_user_id:1},error:null}];expect((await getDmsDocumentLifecycle(7)).data).toMatchObject({stage:'Archived',currentVersionId:8});});
it('denies a foreign lifecycle projection',async()=>{s.replies=[{data:{id:8},error:null}];expect((await getDmsDocumentLifecycle(7)).success).toBe(false);});
