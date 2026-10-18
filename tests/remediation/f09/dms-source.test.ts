import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const m=vi.hoisted(()=>({actor:vi.fn(),recipient:vi.fn(),mailbox:vi.fn(),db:vi.fn(),enqueue:vi.fn(),notify:vi.fn(),render:vi.fn(),subjects:vi.fn(),results:[] as unknown[],calls:[] as unknown[][]}));
vi.mock('@/server/notification-document-authority',()=>({notificationDocumentSubjectsAllowed:m.subjects}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.actor,getAuthContextForProfileId:m.recipient}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.db}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({auth:{admin:{getUserById:m.mailbox}}})}));
vi.mock('@/server/actions/notifications/email-queue',()=>({queueEmail:m.enqueue}));
vi.mock('@/server/actions/notifications/notifications',()=>({createNotification:m.notify}));
vi.mock('@/server/actions/notifications/templates',()=>({renderNotificationTemplate:m.render}));
import {bridgeDmsEmailSource} from '@/server/dms-email-source';
import {canUseDmsEmailBridge,confirmedDeliveryMailbox,dmsEmailQueueOutcome,DMS_NOTICE,requireDmsNoticeAccess} from '@/lib/email/queue/dms-policy';
const doc={id:7,document_no:'SYNTHETIC',title:'PRIVATE DOCUMENT',owner_user_id:2,created_by:1,expiry_date:'2099-01-01',owning_company_id:1,owning_branch_id:2,confidentiality_level:'internal',status:'active',is_archived:false,expiry_tracking_override:null};
const row={id:3,document_id:7,status:'pending',scheduled_for:'2020-01-01T00:00:00Z',recipient_user_id:2,recipient_email:'outdated@example.invalid',document:doc,notification_type:'expired_document',bridge_status:'not_bridged',global_notification_id:11,global_email_queue_id:null};
const bound={id:11,source_module:'DMS',source_entity_type:'dms_documents',source_entity_id:7,recipient_user_id:2};
const ok=(data:unknown)=>({data,error:null});
const confirmed={email:'recipient@example.invalid',email_confirmed_at:'2026-10-18T00:00:00Z'};
function recipient(codes=['notifications.view','dms.documents.view']){return {...syntheticAuthContext(codes),roleAssignments:[{roleId:2,roleCode:'synthetic-reader',ownerCompanyId:1,branchId:2,permissionCodes:codes}]};}
function settings(enabled=true){return [ok({is_enabled:enabled}),ok({is_enabled:true,email_enabled:enabled,in_app_enabled:true})];}
function tail(prior:unknown[]=[],state='email_queued'){return [ok(bound),ok([{id:3}]),ok(true),ok(prior),ok([{id:3}]),ok(null),ok({id:3,global_notification_id:11,global_email_queue_id:17,bridge_status:state})];}
beforeEach(()=>{
 vi.resetAllMocks();m.results=[];m.calls=[];
 m.subjects.mockResolvedValue(true);
 m.actor.mockResolvedValue(syntheticAuthContext(['dms.notifications.manage','notifications.manage','notifications.email_queue.manage','notifications.email_queue.process']));
 m.recipient.mockResolvedValue(recipient());
 m.mailbox.mockResolvedValue({data:{user:confirmed},error:null});m.enqueue.mockResolvedValue({success:true,data:{id:17}});
 m.render.mockResolvedValue({success:true,data:{subject:'PRIVATE DOCUMENT',textBody:'PRIVATE TEXT'}});m.notify.mockResolvedValue({success:true,data:{id:11}});
 const query=(table:string)=>{const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>{m.calls.push(['execute',table]);if(!m.results.length)throw Error('Unexpected query '+table);return Promise.resolve(m.results.shift()).then(resolve);}};for(const method of ['select','update','eq','is','in','limit','maybeSingle','abortSignal'])q[method]=(...args:unknown[])=>{m.calls.push([table,method,...args]);return q;};return q;};
 m.db.mockImplementation(()=>({from:query,rpc:(name:string,args:unknown)=>{m.calls.push(['rpc',name,args]);return query(name);}}));
});
afterEach(()=>vi.useRealTimers());
it('scope-only or inactive bridge operators cannot query or enqueue',async()=>{
 const ctx=syntheticAuthContext(['dms.admin','notifications.email_queue.manage','notifications.email_queue.process']);
 m.actor.mockResolvedValue({...ctx,globalPermissionCodes:[]});expect(canUseDmsEmailBridge(await m.actor())).toBe(false);
 expect((await bridgeDmsEmailSource(3)).success).toBe(false);expect(m.db).not.toHaveBeenCalled();
});
it.each([0,-1,NaN,1.5])('rejects invalid source reference %s before reads',async id=>{expect((await bridgeDmsEmailSource(id)).success).toBe(false);expect(m.db).not.toHaveBeenCalled();});
it('preserves an explicitly skipped legacy source',async()=>{
 m.results=[ok({...row,bridge_status:'skipped'})];expect(await bridgeDmsEmailSource(3)).toMatchObject({success:true,data:{skipped:true,bridgeStatus:'skipped'}});expect(m.mailbox).not.toHaveBeenCalled();expect(m.enqueue).not.toHaveBeenCalled();
});
it('never guesses an ERP user from an external address',async()=>{
 m.results=[ok({...row,recipient_user_id:null})];expect((await bridgeDmsEmailSource(3)).success).toBe(false);expect(m.recipient).not.toHaveBeenCalled();
});
it('rejects missing company and mismatched document identity',async()=>{
 for(const document of [{...doc,owning_company_id:null},{...doc,id:99}]){m.results=[ok({...row,document})];expect((await bridgeDmsEmailSource(3)).success).toBe(false);}expect(m.enqueue).not.toHaveBeenCalled();
});
it('recipient branch and confidential field permissions are independently required',()=>{
 const ctx=recipient();
 expect(()=>requireDmsNoticeAccess({...ctx,roleAssignments:ctx.roleAssignments.map(a=>({...a,ownerCompanyId:1,branchId:9}))},doc)).toThrow();
 expect(()=>requireDmsNoticeAccess(ctx,{...doc,confidentiality_level:'hr'})).toThrow();
 expect(()=>requireDmsNoticeAccess(recipient(['notifications.view','dms.documents.view','dms.documents.view.hr']),{...doc,confidentiality_level:'hr'})).not.toThrow();
});
it.each([null,{}, {...confirmed,email_confirmed_at:null},{...confirmed,email_confirmed_at:'bad'},{...confirmed,deleted_at:'2026-10-18'},{...confirmed,banned_until:'2099-01-01'},{...confirmed,banned_until:'bad'}])('mailbox verification fails closed: %j',user=>{expect(confirmedDeliveryMailbox(user)).toBe(null);});
it('expired bans are not permanent bans',()=>{expect(confirmedDeliveryMailbox({...confirmed,banned_until:'2000-01-01'})).toBe(confirmed.email);});
it('dry run verifies real source and flags without any mutation',async()=>{
 m.results=[ok(row),...settings()];expect(await bridgeDmsEmailSource(3,{dryRun:true})).toMatchObject({success:true,data:{skipped:true}});expect(m.calls.some(c=>c[1]==='update')).toBe(false);expect(m.enqueue).not.toHaveBeenCalled();
});
it('force does not override globally disabled DMS email',async()=>{
 m.results=[ok(row),...settings(false),ok(bound),ok([{id:3}])];expect((await bridgeDmsEmailSource(3,{forceEmail:true})).success).toBe(true);expect(m.enqueue).not.toHaveBeenCalled();
});
it('in-app-only delivery does not depend on a mailbox or call Auth mailbox APIs',async()=>{
 m.mailbox.mockRejectedValue(Error('Mailbox unavailable'));
 m.results=[ok(row),...settings(false),ok(bound),ok([{id:3}])];
 expect((await bridgeDmsEmailSource(3)).success).toBe(true);expect(m.mailbox).not.toHaveBeenCalled();expect(m.enqueue).not.toHaveBeenCalled();
});
it('disabled channels are checked before mailbox lookup and cause no mutations',async()=>{
 m.results=[ok(row),ok({is_enabled:true}),ok({is_enabled:false,in_app_enabled:false,email_enabled:false})];
 expect(await bridgeDmsEmailSource(3)).toMatchObject({success:true,data:{skipped:true}});
 expect(m.mailbox).not.toHaveBeenCalled();expect(m.calls.some(c=>c[1]==='update')).toBe(false);
});
it('new email uses the confirmed mailbox and generic wording, never cached confidential text',async()=>{
 m.results=[ok(row),...settings(),...tail()];const r=await bridgeDmsEmailSource(3);expect(r).toMatchObject({success:true,data:{emailQueueId:17}});
 expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({notification_id:11,subject:DMS_NOTICE.subject,text_body:DMS_NOTICE.textBody,to_emails:[confirmed.email]}),{autoProcess:false});expect(JSON.stringify(m.enqueue.mock.calls)).not.toContain('PRIVATE');
 expect(m.calls).toContainEqual(['dms_notification_queue','eq','bridge_status','bridged']);
});
it.each(['expired_document','document_expired'])('preserves expired-event urgency for both existing producer spellings: %s',async notification_type=>{
 m.results=[ok({...row,global_notification_id:null,notification_type}),...settings(),ok(null),...tail()];
 expect((await bridgeDmsEmailSource(3)).success).toBe(true);expect(m.render).toHaveBeenCalledWith('DMS_DOCUMENT_EXPIRED',expect.any(Object));expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({severity:'urgent'}));expect(m.enqueue).toHaveBeenCalledWith(expect.objectContaining({priority:'high'}),{autoProcess:false});
});
it.each(['sent','delivery_unknown','cancelled'])('retains the original %s intent without a resend',async status=>{
 const state=status==='sent'?'provider_accepted':status==='delivery_unknown'?'email_uncertain':'email_cancelled';
 const prior={id:17,source_module:'DMS',source_entity_type:'dms_documents',source_entity_id:7,to_emails:[confirmed.email],deleted_at:null,status,delivery_state:'provider_accepted'};
 m.results=[ok(row),...settings(),...tail([prior],state)];expect(await bridgeDmsEmailSource(3)).toMatchObject({success:true,data:{skipped:true,emailQueueId:17,bridgeStatus:state}});expect(m.enqueue).not.toHaveBeenCalled();
});
it('ambiguous historical intents and recipient changes remain held',async()=>{
 for(const prior of [[{},{}],[{id:17,source_module:'DMS',source_entity_type:'dms_documents',source_entity_id:7,to_emails:['changed@example.invalid']}]] ){
  m.results=[ok(row),...settings(),ok(bound),ok([{id:3}]),ok(prior)];expect((await bridgeDmsEmailSource(3)).success).toBe(false);
 }expect(m.enqueue).not.toHaveBeenCalled();
});
it('does not adopt a notification belonging to another recipient',async()=>{
 m.results=[ok(row),...settings(),ok({...bound,recipient_user_id:9})];expect((await bridgeDmsEmailSource(3)).success).toBe(false);expect(m.enqueue).not.toHaveBeenCalled();
});
it('unknown queue-save response retains the original notification identity',async()=>{
 m.results=[ok(row),...settings(),ok(bound),ok([{id:3}]),ok(true),ok([])];m.enqueue.mockResolvedValue({success:false,error:'PRIVATE'});
 const r=await bridgeDmsEmailSource(3);expect(r.success).toBe(false);expect(JSON.stringify(r)).not.toContain('PRIVATE');expect(m.enqueue.mock.calls[0][0].notification_id).toBe(11);
});
it('zero-row linkage is not an in-app delivery receipt without exact original-source reconciliation',async()=>{
 m.results=[ok(row),...settings(false),ok(bound),ok([]),ok(null)];expect((await bridgeDmsEmailSource(3)).success).toBe(false);expect(m.enqueue).not.toHaveBeenCalled();
});
it('concurrent identical linkage retains its advanced state instead of downgrading it',async()=>{
 m.results=[ok(row),...settings(false),ok(bound),ok([]),ok({id:3,global_notification_id:11,bridge_status:'provider_accepted'})];
 expect(await bridgeDmsEmailSource(3)).toMatchObject({success:true,data:{bridgeStatus:'provider_accepted'}});expect(m.enqueue).not.toHaveBeenCalled();
});
it('channel-marker no-match is unconfirmed and cannot expose a new intent to the worker',async()=>{
 const records=tail();records[2]=ok(null);m.results=[ok(row),...settings(),...records];
 expect(await bridgeDmsEmailSource(3)).toMatchObject({success:false,error:expect.stringContaining('marker update unconfirmed')});expect(m.enqueue).not.toHaveBeenCalled();
});
it('changed source-to-queue binding is not reported as confirmed tracking',async()=>{
 const records=tail();records[records.length-1]=ok({id:3,global_notification_id:99,global_email_queue_id:17,bridge_status:'email_queued'});
 m.results=[ok(row),...settings(),...records];expect(await bridgeDmsEmailSource(3)).toMatchObject({success:false,error:expect.stringContaining('Tracking read unconfirmed')});
});
it('late notification completion cannot start an email after the producer deadline',async()=>{
 vi.useFakeTimers();m.results=[ok({...row,global_notification_id:null}),...settings(),ok(null)];let finish!:(v:unknown)=>void;m.notify.mockImplementation(()=>new Promise(resolve=>finish=resolve));
 const pending=bridgeDmsEmailSource(3);await vi.advanceTimersByTimeAsync(15001);expect((await pending).success).toBe(false);finish({success:true,data:{id:11}});await vi.advanceTimersByTimeAsync(1);expect(m.enqueue).not.toHaveBeenCalled();
});
it.each([
 [{status:'sent',delivery_state:'provider_accepted'},'provider_accepted'],[{status:'sent'},'legacy_sent_unverified'],[{status:'delivery_unknown'},'email_uncertain'],[{status:'cancelled'},'email_cancelled'],[{status:'pending',paused_at:'now'},'email_queued'],
])('does not confuse accepted, legacy and unknown outcomes: %j', (queue,state)=>{expect(dmsEmailQueueOutcome(queue).bridge_status).toBe(state);});
