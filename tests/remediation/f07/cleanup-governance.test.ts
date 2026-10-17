import {beforeEach,expect,it,vi} from 'vitest';
const s=vi.hoisted(()=>({auth:vi.fn(),global:vi.fn(),permission:vi.fn(),admin:vi.fn(),client:vi.fn(),flag:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:s.auth,hasGlobalPermission:s.global,hasPermission:s.permission}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:s.admin}));
vi.mock('@/lib/supabase/server',()=>({createClient:s.client}));
vi.mock('@/lib/output/feature-flags',()=>({isDmsTempCleanupDeletionEnabled:s.flag}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {runDmsTempCleanup,getDmsTempCleanupSettings,updateDmsTempCleanupSettings,listDmsTempCleanupRuns} from '@/server/actions/dms/temp-cleanup';
import {cleanupDmsExpiredUploadSessions} from '@/server/actions/dms/session-cleanup';
import {cleanupFinalStorageFile} from '@/lib/dms/approve/approve-ai-intake-storage';
import type {SupabaseClient} from '@supabase/supabase-js';
beforeEach(()=>{vi.resetAllMocks();s.auth.mockResolvedValue({profile:{id:7}});s.global.mockReturnValue(true);s.permission.mockReturnValue(true);s.flag.mockReturnValue(true);s.admin.mockImplementation(()=>{throw Error('Privileged work must not start');});s.client.mockImplementation(()=>{throw Error('Database work must not start');});});
it('global cleanup cannot delete retained objects even with the old delete feature enabled',async()=>{expect(await runDmsTempCleanup({mode:'delete'})).toMatchObject({success:false,error:expect.stringMatching(/retained/)});expect(s.admin).not.toHaveBeenCalled();});
it('legacy cleanup cannot bypass the reference/recovery review gate',async()=>{expect(await cleanupDmsExpiredUploadSessions({dryRun:false,limit:100})).toMatchObject({success:false,error:expect.stringMatching(/reference/)});expect(s.admin).not.toHaveBeenCalled();expect(s.client).not.toHaveBeenCalled();});
it.each([()=>getDmsTempCleanupSettings(),()=>updateDmsTempCleanupSettings({enabled:true}),()=>listDmsTempCleanupRuns(),()=>runDmsTempCleanup()])('scoped admin cannot read or write global retention inventories',async action=>{s.global.mockReturnValue(false);expect(await action()).toMatchObject({success:false});expect(s.admin).not.toHaveBeenCalled();});
it('obsolete error compensation cannot delete final objects',async()=>{const remove=vi.fn(),from=vi.fn(()=>({remove}));const result=await cleanupFinalStorageFile({storage:{from}} as unknown as SupabaseClient,'dms-documents','synthetic');expect(result.success).toBe(false);expect(from).not.toHaveBeenCalled();expect(remove).not.toHaveBeenCalled();});
it.each(['folders','references','run-log'])('does not report a completed cleanup preview when %s is unavailable',async failure=>{
 const remove=vi.fn(),insert=vi.fn();
 const query=(value:unknown)=>{const q:any={then:(ok:any)=>Promise.resolve(value).then(ok)};for(const name of ['select','eq','in','is','order','limit','single'])q[name]=()=>q;return q;};
 s.admin.mockReturnValue({storage:{from:()=>({list:async()=>failure==='folders'?{data:null,error:{message:'PRIVATE'}}:{data:failure==='references'?[{id:null,name:'SYN'}]:[],error:null},remove})},from:(table:string)=>{
  if(table==='erp_dms_temp_cleanup_settings')return query({data:{batch_size:10},error:null});
  if(table==='dms_upload_sessions')return {select:(fields:string)=>query(fields==='session_code'?{data:null,error:{message:'PRIVATE'}}:{data:[],error:null})};
  return {insert:(payload:unknown)=>{insert(payload);return query({data:null,error:{message:'PRIVATE'}});}};
 }});
 const r=await runDmsTempCleanup();expect(r).toMatchObject({success:false});expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(remove).not.toHaveBeenCalled();if(failure!=='run-log')expect(insert).not.toHaveBeenCalled();
});
