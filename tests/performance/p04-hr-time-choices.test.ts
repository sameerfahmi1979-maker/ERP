import {beforeEach,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({active:true,allowed:true,rows:[]as Record<string,unknown>[],selected:null as Record<string,unknown>|null,calls:[]as {table:string;filters:Record<string,unknown>;from?:number;to?:number;orders:string[]}[],failure:false,changed:false}));
vi.mock("@/lib/rbac/check",()=>({getAuthContext:async()=>({isAccountActive:state.active,profile:{must_change_password:false}}),hasPermission:()=>state.allowed}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({from:(table:string)=>{
 const call:{table:string;filters:Record<string,unknown>;from?:number;to?:number;orders:string[]}={table,filters:{},orders:[]};state.calls.push(call);
 const q={select:()=>q,is:(key:string,value:unknown)=>{call.filters[key]=value;return q;},eq:(key:string,value:unknown)=>{call.filters[key]=value;return q;},order:(key:string)=>{call.orders.push(key);return q;},range:(from:number,to:number)=>{call.from=from;call.to=to;return q;},abortSignal:()=>q,maybeSingle:()=>q,then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(call.filters.id?{data:state.selected,error:null}:{data:state.rows.slice(call.from,call.to!+1),count:state.rows.length+(state.changed&&call.from?1:0),error:state.failure?{code:"synthetic"}:null}).then(resolve)};return q;
}})}));
import {readHrTimeChoices} from "@/server/reads/hr-time-choices";
const row=(id:number)=>({id,calendar_name:`Calendar ${id}`,calendar_code:`C${id}`,shift_name:`Shift ${id}`,shift_code:`S${id}`,name_en:`Leave ${id}`,code:`L${id}`,calendar_id:7,is_active:true});
beforeEach(()=>{state.active=true;state.allowed=true;state.rows=[row(1)];state.selected=null;state.calls=[];state.failure=false;state.changed=false;});
it.each(["calendars","shifts","leave-types"])("reads complete %s catalogs past legacy caps",async kind=>{
 state.rows=Array.from({length:1107},(_,i)=>row(i+1));const result=await readHrTimeChoices({kind});expect(result.success).toBe(true);expect(result.data?.rows).toHaveLength(1107);expect(result.data?.totalCount).toBe(1107);expect(state.calls.map(c=>c.from)).toEqual([0,500,1000]);expect(state.calls.every(c=>c.filters.deleted_at===null&&c.filters.is_active===true)).toBe(true);
});
it("restricts every shift batch and historical selection to the requested calendar",async()=>{
 state.selected={...row(99),is_active:false};const result=await readHrTimeChoices({kind:"shifts",calendarId:7,selectedIds:[99]});expect(result.success).toBe(true);expect(result.data?.rows.map(r=>r.id)).toEqual([1,99]);expect(state.calls.every(c=>c.filters.calendar_id===7)).toBe(true);expect(result.data?.totalCount).toBe(1);
});
it("does not invent inaccessible historical selections",async()=>{expect((await readHrTimeChoices({kind:"calendars",selectedIds:[99]})).data?.rows.map(r=>r.id)).toEqual([1]);});
it.each(["failure","changed","oversize","duplicate"])("rejects %s instead of returning partial success",async mode=>{
 state.rows=Array.from({length:mode==="oversize"?2001:501},(_,i)=>row(i+1));state.failure=mode==="failure";state.changed=mode==="changed";if(mode==="duplicate")state.rows[500]=row(1);expect((await readHrTimeChoices({kind:"calendars"})).success).toBe(false);
});
it("enforces active principal and existing catalog capabilities before reads",async()=>{state.active=false;expect((await readHrTimeChoices({kind:"shifts"})).success).toBe(false);state.active=true;state.allowed=false;for(const kind of ["calendars","leave-types"])expect((await readHrTimeChoices({kind})).success).toBe(false);expect(state.calls).toHaveLength(0);});
it("rejects arbitrary tables, extra input, unsafe IDs and mismatched parent criteria",async()=>{for(const p of [{kind:"employees"},{kind:"calendars",calendarId:1},{kind:"shifts",selectedIds:[1,2,3]},{kind:"shifts",selectedIds:[-1]},{kind:"shifts",owner_company_id:1}])expect((await readHrTimeChoices(p)).success).toBe(false);expect(state.calls).toHaveLength(0);});
