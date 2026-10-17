import {expect,it,vi} from "vitest";
import {verifiedAggregate,verifiedPreview,verifiedHead} from "@/server/reads/verified-aggregate";
it("aggregates all 1107 rows with stable identities and bounded requests",async()=>{
  const all=Array.from({length:1107},(_,i)=>({id:i+1,value:2})),read=vi.fn((a:number,b:number)=>Promise.resolve({data:all.slice(a,b+1),count:all.length,error:null}));
  const r=await verifiedAggregate(read);expect(r.count).toBe(1107);expect(r.data.reduce((n,v)=>n+v.value,0)).toBe(2214);expect(read.mock.calls).toEqual([[0,499],[500,999],[1000,1499]]);
});
it.each(["failure","null-count","short","duplicate","drift"])("rejects %s rather than publishing an aggregate",async fault=>{
  await expect(verifiedAggregate(async(a)=>({data:fault==="short"?[]:Array.from({length:a?1:500},(_,i)=>({id:fault==="duplicate"?1:a+i+1})),count:fault==="null-count"?null:fault==="drift"&&a?999:501,error:fault==="failure"?{message:"private"}:null}))).rejects.toThrow();
});
it("fails unavailable or over-budget counts instead of allocating a whole large collection",async()=>{
  await expect(verifiedAggregate(async()=>({data:[{id:1}],count:50001,error:null}))).rejects.toThrow();
  await expect(verifiedHead(Promise.resolve({count:null,error:null}))).rejects.toThrow();
  await expect(verifiedHead(Promise.resolve({count:0,error:{code:"bad"}}))).rejects.toThrow();
  expect(await verifiedHead(Promise.resolve({count:0,error:null}))).toEqual({count:0,error:null});
});
it("a deliberate preview verifies its full total without loading all metadata",async()=>{
  expect((await verifiedPreview(Promise.resolve({data:[{id:1},{id:2}],count:1107,error:null}),2)).count).toBe(1107);
  await expect(verifiedPreview(Promise.resolve({data:[{id:1}],count:1107,error:null}),2)).rejects.toThrow();
});
