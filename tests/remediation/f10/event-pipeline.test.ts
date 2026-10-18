import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContextForProfileId:vi.fn()}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:vi.fn()}));
import {runNotificationEventBatch,NotificationRoutingHold,type NotificationEventPorts} from '@/server/notification-events';
const event={id:1,event_key:'source:7',source_table:'dms_document_events',source_id:7,event_type:'approval_submitted',actor_id:1,source_snapshot:{document_id:2},lease_token:'b23ec154-aa22-44cc-8fee-2b954e9bf007'};
let p:NotificationEventPorts;
beforeEach(()=>{p={claim:vi.fn().mockResolvedValue([event]),resolve:vi.fn().mockResolvedValue([2,3]),plan:vi.fn().mockResolvedValue([{profile_id:2,state:'pending'},{profile_id:3,state:'pending'}]),record:vi.fn().mockResolvedValue({state:'created'}),finish:vi.fn().mockResolvedValue(true)};});
it('two distinct recipients receive one record each; one complete event',async()=>{expect(await runNotificationEventBatch(p)).toEqual({processed:1,results:[{id:1,outcome:'complete'}]});expect(p.record).toHaveBeenCalledTimes(2);});
it('partial failure retries event without replacing an already-created receipt',async()=>{vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created'},{profile_id:3,state:'pending'}]);vi.mocked(p.record).mockRejectedValue(Error('query unavailable'));expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('retry');expect(p.record).toHaveBeenCalledTimes(1);expect(p.record).toHaveBeenCalledWith(event,3,true);});
it('resolver outage is never empty successful completion',async()=>{vi.mocked(p.resolve).mockRejectedValue(Error('unavailable'));expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('retry');expect(p.plan).not.toHaveBeenCalled();});
it('unresolved recipient mapping holds instead of inventing recipients',async()=>{vi.mocked(p.resolve).mockResolvedValue([]);vi.mocked(p.plan).mockResolvedValue([]);expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).not.toHaveBeenCalled();});
it('explicit ambiguous mapping is held immediately, distinct from retryable authority outage',async()=>{
 vi.mocked(p.resolve).mockRejectedValue(new NotificationRoutingHold());expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.plan).not.toHaveBeenCalled();
});
it('frozen original roster does not include later added users',async()=>{vi.mocked(p.resolve).mockResolvedValue([2,3,4]);await runNotificationEventBatch(p);expect(p.record).toHaveBeenCalledTimes(2);expect(p.record).not.toHaveBeenCalledWith(event,4,true);});
it('revoked recipient is recorded held, not dropped as success',async()=>{vi.mocked(p.resolve).mockResolvedValue([2]);vi.mocked(p.record).mockImplementation(async(_event,id,allowed)=>({state:allowed?'created':'held'}));expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).toHaveBeenCalledWith(event,3,false);});
it('missing verified mailbox remains a visible channel hold',async()=>{vi.mocked(p.record).mockResolvedValue({state:'created',outcome:'in_app_created_email_held_no_verified_mailbox'});expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');});
it('previously-created missing-mailbox outcome is not forgotten on replay',async()=>{vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created',outcome:'in_app_created_email_held_no_verified_mailbox'}]);expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).not.toHaveBeenCalled();});
it('failed outcome persistence rejects the batch, not false HTTP success',async()=>{vi.mocked(p.finish).mockResolvedValue(false);await expect(runNotificationEventBatch(p)).rejects.toThrow('unconfirmed');});
it('malformed claim results cannot dispatch',async()=>{vi.mocked(p.claim).mockResolvedValue([{...event,lease_token:'invalid'}]);await expect(runNotificationEventBatch(p)).rejects.toThrow();expect(p.record).not.toHaveBeenCalled();});
it('a failed event does not discard a later independent event',async()=>{vi.mocked(p.claim).mockResolvedValue([event,{...event,id:2,event_key:'second'}]);vi.mocked(p.resolve).mockRejectedValueOnce(Error('bad source'));const r=await runNotificationEventBatch(p);expect(r.results.map(x=>x.outcome)).toEqual(['retry','complete']);});
it('an empty claim is a genuine no-work result',async()=>{vi.mocked(p.claim).mockResolvedValue([]);expect(await runNotificationEventBatch(p)).toEqual({processed:0,results:[]});expect(p.resolve).not.toHaveBeenCalled();});
it('bounded fan-out yields original pending recipients rather than exhausting failure retries',async()=>{
 p.recipientLimit=1;expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('pending');expect(p.record).toHaveBeenCalledTimes(1);expect(p.finish).toHaveBeenCalledWith(event,'pending');
});
it('resumed chunk skips committed receipts and finishes only the remaining recipient',async()=>{
 p.recipientLimit=1;vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created'},{profile_id:3,state:'pending'}]);
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('complete');expect(p.record).toHaveBeenCalledTimes(1);expect(p.record).toHaveBeenCalledWith(event,3,true);
});
it('time budget yields before another write, not by pretending the event completed',async()=>{
 p.canContinue=()=>false;expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('pending');expect(p.record).not.toHaveBeenCalled();
});
it('known held recipient is not silently retried or turned into successful completion',async()=>{
 vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'held'},{profile_id:3,state:'created'}]);expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).not.toHaveBeenCalled();
});
it('unfinished mailbox channel uses its original receipt, not a second notification',async()=>{
 vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created',outcome:'in_app_created_email_held_no_verified_mailbox'}]);
 p.resumeChannel=vi.fn().mockResolvedValue({state:'created',outcome:'in_app_created_email_queued_not_delivered'});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('complete');
 expect(p.resumeChannel).toHaveBeenCalledWith(event,2,true);expect(p.record).not.toHaveBeenCalled();
});
it('revoked unfinished channel is held without assuming its prior in-app access still applies',async()=>{
 vi.mocked(p.resolve).mockResolvedValue([]);vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created',outcome:'in_app_created_email_held_no_verified_mailbox'}]);
 p.resumeChannel=vi.fn().mockResolvedValue({state:'held',outcome:'original_channel_not_currently_authorized'});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.resumeChannel).toHaveBeenCalledWith(event,2,false);
});
it('channel recovery outage is retryable, and completed email receipts are never resumed',async()=>{
 vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created',outcome:'in_app_created_email_queued_not_delivered'},{profile_id:3,state:'created',outcome:'in_app_created_email_held_no_verified_mailbox'}]);
 p.resumeChannel=vi.fn().mockRejectedValue(Error('outage'));
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('retry');expect(p.resumeChannel).toHaveBeenCalledTimes(1);expect(p.record).not.toHaveBeenCalled();
});
it('invalid fan-out budget cannot dispatch',async()=>{p.recipientLimit=0;await expect(runNotificationEventBatch(p)).rejects.toThrow('Invalid fan-out limit');expect(p.record).not.toHaveBeenCalled();});
it('email-only recovery never claims an in-app delivery',async()=>{
 vi.mocked(p.plan).mockResolvedValue([{profile_id:2,state:'created',outcome:'email_only_held_no_verified_mailbox'}]);
 p.resumeChannel=vi.fn().mockResolvedValue({state:'created',outcome:'email_only_queued_not_delivered'});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('complete');expect(p.resumeChannel).toHaveBeenCalledWith(event,2,true);expect(p.record).not.toHaveBeenCalled();
});
it('unfinished durable qualification yields without resolving or writing the full group',async()=>{
 p.prepare=vi.fn().mockResolvedValue({ready:false});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('pending');
 expect(p.resolve).not.toHaveBeenCalled();expect(p.plan).not.toHaveBeenCalled();expect(p.record).not.toHaveBeenCalled();
});
it('a frozen prepared roster rechecks only each unfinished recipient before delivery',async()=>{
 p.prepare=vi.fn().mockResolvedValue({ready:true,recipients:[{profile_id:2,state:'created'},{profile_id:3,state:'pending'}]});
 p.authorize=vi.fn().mockResolvedValue(true);
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('complete');
 expect(p.authorize).toHaveBeenCalledExactlyOnceWith(event,3);expect(p.resolve).not.toHaveBeenCalled();expect(p.plan).not.toHaveBeenCalled();
});
it('revocation between durable qualification and delivery is held',async()=>{
 p.prepare=vi.fn().mockResolvedValue({ready:true,recipients:[{profile_id:2,state:'pending'}]});
 p.authorize=vi.fn().mockResolvedValue(false);vi.mocked(p.record).mockResolvedValue({state:'held'});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).toHaveBeenCalledWith(event,2,false);
});
it('authority outage after qualification retries without changing the frozen roster',async()=>{
 p.prepare=vi.fn().mockResolvedValue({ready:true,recipients:[{profile_id:2,state:'pending'}]});
 p.authorize=vi.fn().mockRejectedValue(Error('authority outage'));
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('retry');expect(p.record).not.toHaveBeenCalled();
});
it('prepared empty eligible roster remains held, never false completion',async()=>{
 p.prepare=vi.fn().mockResolvedValue({ready:true,recipients:[]});
 expect((await runNotificationEventBatch(p)).results[0].outcome).toBe('held');expect(p.record).not.toHaveBeenCalled();
});
