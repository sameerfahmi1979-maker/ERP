import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {processDueSchedules} from "@/lib/report-center/schedule-worker";
const m=vi.hoisted(()=>({db:vi.fn(),batch:vi.fn(),enabled:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:m.db}));
vi.mock("@/lib/email/queue/service",()=>({emailWorkerEnabled:m.enabled,processQueuedBatch:m.batch}));
let calls:Array<[string,unknown]>,rpc:ReturnType<typeof vi.fn>,rows:Record<string,unknown>[],pending:Record<string,unknown>[];
const inventory='f09_schedule_worker_inventory';
afterEach(()=>{vi.useRealTimers();});
beforeEach(()=>{
 vi.clearAllMocks();calls=[];m.enabled.mockReturnValue(true);
 vi.stubEnv("F09_SCHEDULE_CATCHUP_POLICY","skip-missed-after-current");
 rows=[{id:1,frequency:"daily",day_of_week:null,day_of_month:null,time_of_day:null,timezone:"Asia/Dubai",
 next_run_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z"}];
 pending=[{id:44}];
 m.db.mockReturnValue({from:(table:string)=>{
  const q:Record<string,unknown>={};
  for(const name of ["select","eq","is","lte","order"])q[name]=(...args:unknown[])=>{calls.push([name,args]);return q;};
  q.limit=async()=>{expect(table).toBe("erp_report_schedule_runs");return {data:pending,error:null};};return q;
 },rpc:rpc=vi.fn(async(name:string,args:unknown)=>{
  calls.push([name,args]);
  if(name===inventory)return {data:{due:rows,reserved:rows.length?[]:pending},error:null};
  return {data:name==="f09_reserve_schedule_slot"?44:55,error:null};
 })});
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
 rpc.mockResolvedValueOnce({data:{due:rows,reserved:[]},error:null});
 rpc.mockImplementationOnce(()=>new Promise(resolve=>{late=resolve;}));
 const assertion=expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow("deadline");
 await vi.advanceTimersByTimeAsync(15001);await assertion;
 late({data:44,error:null});await vi.advanceTimersByTimeAsync(1);
 expect(rpc.mock.calls.map(([name])=>name)).toEqual([inventory,"f09_reserve_schedule_slot"]);expect(m.batch).not.toHaveBeenCalled();
 expect(calls.some(([key,args])=>key==="eq"&&(args as unknown[])[0]==="delivery_engine")).toBe(false);
});
it("still enqueues a previously reserved run when no schedule is currently due",async()=>{
 rows=[];
 const result=await processDueSchedules({workerId:"synthetic"});
 expect(result).toMatchObject({claimed:0,queued:1});
 expect(rpc.mock.calls).toEqual([[inventory,{p_limit:10,p_due_at:expect.any(String)}],["f09_enqueue_schedule_run",{p_run_id:44}]]);
 expect(calls.some(([key])=>key==="select")).toBe(false);
 expect(m.batch).toHaveBeenCalledExactlyOnceWith({module:"REPORTS",limit:10});
});
it("an empty producer starts no write while the shared queue keeps its own recovery",async()=>{
 rows=[];pending=[];
 m.batch.mockResolvedValue({accepted:0,retry:0,unknown:0,failed:0,skipped:0,cancelled:0,leasesReaped:0});
 const result=await processDueSchedules({workerId:"synthetic"});
 expect(result).toMatchObject({claimed:0,queued:0,succeeded:0,terminal:0});
 expect(rpc).toHaveBeenCalledExactlyOnceWith(inventory,{p_limit:10,p_due_at:expect.any(String)});
 expect(calls.some(([key])=>key==="select")).toBe(false);
 expect(m.batch).toHaveBeenCalledExactlyOnceWith({module:"REPORTS",limit:10});
});
it("an unacknowledged enqueue expires without starting provider work in that invocation",async()=>{
 rows=[];vi.useFakeTimers();
 let reply:(value:unknown)=>void=()=>{};
 rpc.mockResolvedValueOnce({data:{due:rows,reserved:pending},error:null});
 rpc.mockImplementationOnce(()=>new Promise(resolve=>{reply=resolve;}));
 const error=expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow("deadline");
 await vi.advanceTimersByTimeAsync(15001);await error;
 reply({data:55,error:null});await vi.advanceTimersByTimeAsync(1);
 expect(rpc.mock.calls).toEqual([[inventory,{p_limit:10,p_due_at:expect.any(String)}],["f09_enqueue_schedule_run",{p_run_id:44}]]);
 expect(m.batch).not.toHaveBeenCalled();
});
it("an inventory outage cannot start a reservation, enqueue or provider work",async()=>{
 rpc.mockResolvedValueOnce({data:null,error:{code:"synthetic_unavailable"}});
 await expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow("Schedule inventory unavailable");
 expect(rpc).toHaveBeenCalledExactlyOnceWith(inventory,{p_limit:10,p_due_at:expect.any(String)});
 expect(m.batch).not.toHaveBeenCalled();
});
it("a malformed inventory that exceeds the requested cap cannot enqueue",async()=>{
 rpc.mockResolvedValueOnce({data:{due:[],reserved:[{id:44},{id:55}]},error:null});
 await expect(processDueSchedules({workerId:"synthetic",limit:1})).rejects.toThrow("requested limit");
 expect(rpc).toHaveBeenCalledExactlyOnceWith(inventory,{p_limit:1,p_due_at:expect.any(String)});
 expect(m.batch).not.toHaveBeenCalled();
});

it("enqueues a mixed recovery set in one call and preserves each outcome",async()=>{
 rows=[];pending=[{id:44},{id:55},{id:66}];
 rpc.mockResolvedValueOnce({data:{due:[],reserved:pending},error:null});
 rpc.mockResolvedValueOnce({data:{queued:1,skipped:1,failed:1},error:null});
 const result=await processDueSchedules({workerId:"synthetic"});
 expect(result).toMatchObject({claimed:0,queued:1,skipped:1,terminal:1});
 expect(rpc.mock.calls.map(([name])=>name)).toEqual([inventory,"f09_enqueue_schedule_run_batch"]);
 expect(rpc.mock.calls[1][1]).toEqual({p_run_ids:[44,55,66]});
});
it("rejects an incomplete enqueue receipt before starting delivery",async()=>{
 rpc.mockResolvedValueOnce({data:{due:[],reserved:[{id:44},{id:55}]},error:null});
 rpc.mockResolvedValueOnce({data:{queued:1,skipped:0,failed:0},error:null});
 await expect(processDueSchedules({workerId:"synthetic"})).rejects.toThrow("enqueue totals");
 expect(m.batch).not.toHaveBeenCalled();
});
