import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {processDueSchedules} from "@/lib/report-center/schedule-worker";
const m=vi.hoisted(()=>({db:vi.fn(),batch:vi.fn(),enabled:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));
vi.mock("@/lib/email/queue/service",()=>({emailWorkerEnabled:m.enabled,processQueuedBatch:m.batch}));
let calls:Array<[string,unknown]>,rpc:ReturnType<typeof vi.fn>,rows:Record<string,unknown>[];
afterEach(()=>{vi.useRealTimers();});
beforeEach(()=>{
 vi.clearAllMocks();calls=[];m.enabled.mockReturnValue(true);
 vi.stubEnv("F09_SCHEDULE_CATCHUP_POLICY","skip-missed-after-current");
 rows=[{id:1,frequency:"daily",day_of_week:null,day_of_month:null,time_of_day:null,timezone:"Asia/Dubai",
 next_run_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"}];
 m.db.mockReturnValue({from:(table:string)=>{
  const q:Record<string,unknown>={};
  for(const name of ["select","eq","is","lte","order"])q[name]=(...args:unknown[])=>{calls.push([name,args]);return q;};
  q.limit=async()=>({data:table==="erp_report_schedules"?rows:[{id:44}],error:null});return q;
 },rpc:rpc=vi.fn(async(name:string,args:unknown)=>{calls.push([name,args]);return {data:name==="f09_reserve_schedule_slot"?44:55,error:null};})});
 m.batch.mockResolvedValue({accepted:1,retry:2,unknown:1,failed:0,skipped:0,cancelled:0,leasesReaped:0});
});
it("scheduler has no separate sender/retry owner and reports actual acceptance separately",async()=>{
 const r=await processDueSchedules({workerId:"synthetic",limit:2});
 expect(r).toMatchObject({claimed:1,queued:1,succeeded:1,retryScheduled:2,deliveryUnknown:1});
 expect(m.batch).toHaveBeenCalledExactlyOnceWith({module:"REPORTS",limit:2});
 expect(calls).toContainEqual(["eq",["delivery_engine","f09"]]);
 expect(rpc).toHaveBeenCalledWith("f09_reserve_schedule_slot",expect.objectContaining({p_expected_updated_at:"2026-01-01T00:00:00Z"}));
});
it("no catch-up policy means no backlog work",async()=>{
 vi.stubEnv("F09_SCHEDULE_CATCHUP_POLICY","");
 await expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow();expect(m.db).not.toHaveBeenCalled();expect(m.batch).not.toHaveBeenCalled();
});
it("one malformed calendar does not prevent valid reservations or shared delivery",async()=>{
 rows.unshift({...rows[0],id:2,timezone:"Not/AZone"});
 const r=await processDueSchedules({workerId:"synthetic"});expect(r.claimed).toBe(1);expect(r.skipped).toBe(1);expect(m.batch).toHaveBeenCalled();
});
it("master pause stops report work without a database call",async()=>{
 m.enabled.mockReturnValue(false);expect((await processDueSchedules({workerId:"synthetic"})).queued).toBe(0);
 expect(m.db).not.toHaveBeenCalled();expect(m.batch).not.toHaveBeenCalled();
});
it("a lost slot response cannot resume late and enqueue or dispatch after the producer deadline",async()=>{
 vi.useFakeTimers();let late:(value:unknown)=>void=()=>{};
 rpc.mockImplementation(()=>new Promise(resolve=>{late=resolve;}));
 const assertion=expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow("deadline");
 await vi.advanceTimersByTimeAsync(15001);await assertion;
 late({data:44,error:null});await vi.advanceTimersByTimeAsync(1);
 expect(rpc).toHaveBeenCalledTimes(1);expect(m.batch).not.toHaveBeenCalled();
 expect(calls.some(([key,args])=>key==="eq"&&(args as unknown[])[0]==="delivery_engine")).toBe(false);
});
