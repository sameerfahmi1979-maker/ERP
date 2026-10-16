import {beforeEach,describe,expect,it,vi} from 'vitest';

const m=vi.hoisted(()=>({client:vi.fn(),admin:vi.fn(),build:vi.fn(),queries:[] as Array<{table:string;filters:Array<[string,unknown]>;limit?:number}>,rows:[] as Record<string,unknown>[],error:null as unknown}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/email/providers/microsoft-graph-provider',()=>({MicrosoftGraphEmailProvider:class {config:unknown;constructor(config:unknown){this.config=config;m.build(config);}}}));
import {getDefaultEmailProvider,getDefaultEmailProviderSystem} from '@/lib/email/providers/factory';

const row=(id=1,patch:Record<string,unknown>={})=>({id,provider_code:`SYNTHETIC_${id}`,provider_type:'microsoft_graph',is_default:true,is_enabled:true,is_active:true,deleted_at:null,...patch});
beforeEach(()=>{
 vi.clearAllMocks();m.queries=[];m.rows=[];m.error=null;
 const db={from:(table:string)=>{
  const query:{table:string;filters:Array<[string,unknown]>;limit?:number}={table,filters:[]};m.queries.push(query);
  const result=()=>({data:m.error?null:m.rows.filter(r=>query.filters.every(([key,value])=>r[key]===value)).slice(0,query.limit),error:m.error});
  const builder={select:()=>builder,eq:(key:string,value:unknown)=>{query.filters.push([key,value]);return builder;},is:(key:string,value:unknown)=>{query.filters.push([key,value]);return builder;},limit:(limit:number)=>{query.limit=limit;return builder;},single:async()=>{const r=result();return {...r,data:r.data?.length===1?r.data[0]:null};},then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};return builder;
 }};m.client.mockResolvedValue(db);m.admin.mockReturnValue(db);
});
describe.each([['session',getDefaultEmailProvider],['system',getDefaultEmailProviderSystem]] as const)('%s authoritative email default',(_kind,getDefault)=>{
 it('selects one explicit enabled active default without sending',async()=>{m.rows=[row()];await getDefault();expect(m.build).toHaveBeenCalledWith(expect.objectContaining({id:1,isDefault:true}));expect(m.queries).toHaveLength(1);});
 it('never falls back to an arbitrary enabled non-default',async()=>{m.rows=[row(2,{is_default:false})];await expect(getDefault()).rejects.toThrow(/default/i);expect(m.build).not.toHaveBeenCalled();expect(m.queries).toHaveLength(1);});
 it('rejects two authoritative defaults instead of silently taking the first',async()=>{m.rows=[row(),row(2)];await expect(getDefault()).rejects.toThrow(/default/i);expect(m.build).not.toHaveBeenCalled();});
 it('rejects a conflicting disabled default instead of concealing it',async()=>{m.rows=[row(),row(2,{is_enabled:false})];await expect(getDefault()).rejects.toThrow(/default/i);expect(m.build).not.toHaveBeenCalled();});
 it.each([{is_active:false},{is_enabled:false}])('does not use an unavailable default %j',async patch=>{m.rows=[row(1,patch),row(2,{is_default:false})];await expect(getDefault()).rejects.toThrow(/default/i);expect(m.build).not.toHaveBeenCalled();});
 it('does not treat deleted history as a current default',async()=>{m.rows=[row(),row(2,{deleted_at:'2026-10-03'})];await getDefault();expect(m.build).toHaveBeenCalledTimes(1);});
 it('fails closed with a safe error on database failure',async()=>{m.rows=[row()];m.error={message:'synthetic-private-detail'};await expect(getDefault()).rejects.toThrow(/unavailable/i);try{await getDefault();}catch(e){expect(String(e)).not.toContain('synthetic-private-detail');}expect(m.build).not.toHaveBeenCalled();});
});
