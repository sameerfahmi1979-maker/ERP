import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:state.rpc})}));
import {attachPartyReferenceLabels} from '@/server/party-reference-labels';
const row=(id:number)=>({id,country_id:5,emirate_id:6,city_id:7,area_zone_id:8,remarks:'Unchanged'});
const labels={country_id:5,emirate_id:6,city_id:7,area_zone_id:8,country_name:'Saved country',emirate_name:'Saved emirate',city_name:'Saved city',area_zone_name:'Saved area'};
beforeEach(()=>vi.resetAllMocks());
it('adds only authorized reference labels, preserving input order and other fields',async()=>{
 state.rpc.mockImplementation(async(_name:string,{p_ids}:{p_ids:number[]})=>({data:Object.fromEntries(p_ids.map(id=>[id,labels])),error:null}));
 const result=await attachPartyReferenceLabels('parties',Array.from({length:1001},(_,i)=>row(i+1)));
 expect(state.rpc.mock.calls.map(c=>c[1].p_ids.length)).toEqual([1000,1]);expect(result.length).toBe(1001);
 expect(result[1000].id).toBe(1001);expect(result[0]).toEqual({...row(1),...labels});
});
it.each(['parties','party_addresses'] as const)('%s rejects revoked/missing reference receipts',async(entity)=>{
 state.rpc.mockResolvedValue({data:{},error:null});await expect(attachPartyReferenceLabels(entity,[row(1)])).rejects.toThrow('Party reference labels unavailable');
});
it('rejects unsolicited record labels',async()=>{
 state.rpc.mockResolvedValue({data:{1:labels,2:labels},error:null});await expect(attachPartyReferenceLabels('parties',[row(1)])).rejects.toThrow('Party reference labels unavailable');
});
it('read failures never forward private infrastructure details or return partial rows',async()=>{
 state.rpc.mockResolvedValue({data:null,error:{message:'Private infrastructure detail'}});await expect(attachPartyReferenceLabels('parties',[row(1)])).rejects.toThrow(/^Party reference labels unavailable$/);
});
it('rejects unexpected metadata in the label projection',async()=>{
 state.rpc.mockResolvedValue({data:{1:{...labels,internal_configuration:'private'}}});await expect(attachPartyReferenceLabels('parties',[row(1)])).rejects.toThrow('Party reference labels unavailable');
});
it.each(['country_id','emirate_id','city_id','area_zone_id'])('rejects a changed %s instead of mixing read snapshots',async(key)=>{
 state.rpc.mockResolvedValue({data:{1:{...labels,[key]:999}}});await expect(attachPartyReferenceLabels('parties',[row(1)])).rejects.toThrow('Party reference labels unavailable');
});
it('preserves genuinely unassigned references as null',async()=>{
 const empty={country_id:null,emirate_id:null,city_id:null,area_zone_id:null,country_name:null,emirate_name:null,city_name:null,area_zone_name:null};
 state.rpc.mockResolvedValue({data:{1:empty}});expect(await attachPartyReferenceLabels('parties',[{id:1}])).toEqual([{id:1,country_name:null,emirate_name:null,city_name:null,area_zone_name:null}]);
});
it('empty authorized lists make no label request',async()=>{
 expect(await attachPartyReferenceLabels('parties',[])).toEqual([]);expect(state.rpc).not.toHaveBeenCalled();
});
it.each([0,-1,NaN,1.1,Number.MAX_SAFE_INTEGER+1])('invalid record ID %s fails before the RPC',async(id)=>{
 await expect(attachPartyReferenceLabels('parties',[row(id)])).rejects.toThrow('Party reference labels unavailable');expect(state.rpc).not.toHaveBeenCalled();
});
