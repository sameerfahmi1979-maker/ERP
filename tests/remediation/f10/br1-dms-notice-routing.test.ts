import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';

const state=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn(),context:vi.fn(),subjects:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContextForProfileId:state.context}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:state.rpc,from:state.from})}));
vi.mock('@/server/notification-document-authority',()=>({notificationDocumentSubjectsAllowed:state.subjects}));
import {createAdminClient} from '@/lib/supabase/admin';
import {resolveNotificationRecipients,runNotificationEventBatch,type NotificationEvent} from '@/server/notification-events';

const operation='aaaaaaaa-0000-4000-8000-000000000001';
const event:NotificationEvent={
 id:20,event_key:`dms-br1-renewal:${operation}`,source_table:'dms_document_events',source_id:10,
 event_type:'dms_br1_renewal_committed',actor_id:11,lease_token:'aaaaaaaa-0000-4000-8000-000000000002',
 source_snapshot:{operation_id:operation,document_id:128,renewal_request_id:1,recipient_profile_id:11},
};
const permissions=['notifications.view','dms.documents.view'];
const context={...syntheticAuthContext(permissions,{id:11,owner_company_id:1,branch_id:1}),globalPermissionCodes:[],
 roleAssignments:[{roleId:11,roleCode:'officer',ownerCompanyId:1,branchId:1,permissionCodes:permissions}],
};
const resolve=(options?:{discoverOnly?:boolean;candidateIds?:number[]},notice=event)=>
 resolveNotificationRecipients(notice,createAdminClient(),undefined,options);

beforeEach(()=>{
 vi.clearAllMocks();
 state.rpc.mockResolvedValue({data:true,error:null});
 state.context.mockResolvedValue(context);
 state.subjects.mockResolvedValue(true);
 state.from.mockImplementation(()=>{
  const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:()=>Promise.resolve({error:null,data:{
   id:128,owner_user_id:12,created_by:13,submitted_by:14,owning_company_id:1,owning_branch_id:1,
   confidentiality_level:'company',status:'active',is_archived:false,
  }})};
  return query;
 });
});

it('discovers and delivers to the configured officer even when that officer performed the renewal',async()=>{
 expect(await resolve({discoverOnly:true})).toEqual([11]);
 expect(await resolve({candidateIds:[11]})).toEqual([11]);
 expect(state.context).toHaveBeenCalledExactlyOnceWith(11);
 expect(state.subjects).toHaveBeenCalledExactlyOnceWith(context,128);
 expect(state.rpc).toHaveBeenLastCalledWith('f10_br1_renewal_notification_recipient',{p_event:20,p_profile:11});
});

it('holds a mismatched candidate or a revoked recipient without owner fallback',async()=>{
 expect(await resolve({candidateIds:[12]})).toEqual([]);
 state.rpc.mockResolvedValue({data:false,error:null});
 expect(await resolve()).toEqual([]);
 expect(state.context).not.toHaveBeenCalled();
});

it('fails closed when the event carries additional data or an unrelated source table',async()=>{
 expect(await resolve(undefined,{...event,source_snapshot:{...event.source_snapshot,employee_name:'synthetic'}})).toEqual([]);
 expect(await resolve(undefined,{...event,source_table:'dms_review_queue'})).toEqual([]);
 expect(state.rpc).not.toHaveBeenCalled();
});

it('rechecks current linked subjects and retries unavailable authority',async()=>{
 state.subjects.mockResolvedValue(false);
 expect(await resolve()).toEqual([]);
 state.rpc.mockResolvedValue({data:null,error:{code:'57014'}});
 await expect(resolve()).rejects.toThrow('recipient authority unavailable');
});

it('preserves the existing configured filing recipient',async()=>{
 const filed={...event,event_type:'dms_numbered_filing_committed',source_snapshot:{
  operation_id:operation,document_id:128,document_no:'SYNTHETIC-FILE',company_id:1,branch_id:1,
  document_type_id:16,recipient_profile_id:11,connection_id:operation,upload_session_id:2,approve_run_id:3,
 }};
 expect(await resolve(undefined,filed)).toEqual([11]);
 expect(state.rpc).toHaveBeenLastCalledWith('f10_numbered_filing_notification_recipient',{p_event:20,p_profile:11});
});

it('preserves the released fleet expiry lease-based routing',async()=>{
 const fleet={...event,id:21,source_table:'fleet_asset_evidence' as const,event_type:'compliance_expiry_day',
  source_snapshot:{t19_policy_id:1}};
 state.rpc.mockResolvedValue({data:[19],error:null});
 const result=await runNotificationEventBatch({
  claim:async()=>[fleet],
  resolve:parsed=>resolveNotificationRecipients(parsed,createAdminClient()),
  plan:async(_parsed,ids)=>ids.map(profile_id=>({profile_id,state:'pending'})),
  record:async(_parsed,profile,allowed)=>({state:profile===19&&allowed?'created':'held'}),
  finish:async()=>true,
 });
 expect(result.results).toEqual([{id:21,outcome:'complete'}]);
 expect(state.rpc).toHaveBeenLastCalledWith('t19_expiry_recipients',{p_event:21,p_lease:fleet.lease_token,p_candidate:19});
});
