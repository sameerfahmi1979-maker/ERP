import { expect, it, vi } from 'vitest';
import { completeReportRead, REPORT_READ_MAX_ROWS } from '@/lib/report-center/complete-read';
function fixture(total = 1251) {
  const calls: Array<{from:number;to:number;scope:number[];limit?:number}> = [];
  let from=0,to=total-1,scope=[1],limit:number|undefined;
  const fault=vi.fn((_offset:number):Record<string,unknown>=>({}));
  const q={
    in:(_column:string,ids:number[])=>{scope=ids;return q;},order:vi.fn(()=>q),eq:vi.fn(()=>q),
    range:(a:number,b:number)=>{from=a;to=b;return q;},limit:(n:number)=>{limit=n;return q;},
    then:(resolve:(v:unknown)=>unknown,reject?:(e:unknown)=>unknown)=>{
      calls.push({from,to,scope,limit});
      const end=Math.min(to+1,total,limit??Infinity),data=Array.from({length:Math.max(0,end-from)},(_,n)=>({id:from+n+1,company:scope[0]}));
      return Promise.resolve({data,count:total,error:null,...fault(from)}).then(resolve,reject);
    },
  };
  return {q,calls,fault};
}
it('collects every permitted row beyond the gateway ceiling, retaining AND filters and stable ID order',async()=>{
 const f=fixture();const r=await completeReportRead(f.q.in('company',[7])).eq('active',true).order('name').limit(5000);
 expect((r as unknown as {data:unknown[]}).data).toHaveLength(1251);expect(f.calls).toEqual([{from:0,to:499,scope:[7],limit:undefined},{from:500,to:999,scope:[7],limit:undefined},{from:1000,to:1499,scope:[7],limit:undefined}]);expect(f.q.order).toHaveBeenLastCalledWith('id');
});
it.each([0,500,1000,REPORT_READ_MAX_ROWS])('collects exactly %i rows without an unnecessary trailing empty page',async n=>{const f=fixture(n);const r=await completeReportRead(f.q);expect((r as unknown as {data:unknown[]}).data).toHaveLength(n);expect(f.calls).toHaveLength(Math.max(1,Math.ceil(n/500)));});
it('honours deliberate latest-one selection instead of inventing historical rows',async()=>{const f=fixture(9);const r=await completeReportRead(f.q).limit(1);expect((r as unknown as {data:unknown[]}).data).toHaveLength(1);expect(f.calls).toHaveLength(1);});
it.each([
 ['query failure',{error:{message:'PRIVATE DATABASE DETAIL'}},/completeness/],
 ['missing count',{count:null},/completeness/],
 ['premature end',{data:[]},/ended early/],
 ['oversized workload',{count:REPORT_READ_MAX_ROWS+1},/20,000/],
] as const)('fails closed on %s',async(_name,result,error)=>{const f=fixture();f.fault.mockReturnValue(result);await expect(completeReportRead(f.q)).rejects.toThrow(error);});
it('rejects a changed count on a later page without returning the first page',async()=>{const f=fixture();f.fault.mockImplementation(offset=>offset?{count:1252}:{});await expect(completeReportRead(f.q)).rejects.toThrow('changed during collection');});
