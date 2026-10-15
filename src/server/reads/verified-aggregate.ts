import "server-only";
import {collectCompletePages} from "@/lib/reads/complete-pages";
type Result<T>={data:T[]|null;count:number|null;error:unknown};
/** Complete bounded traversal for aggregates; a budget/error never produces a zero. */
export async function verifiedAggregate<T extends {id:number}>(read:(from:number,to:number)=>PromiseLike<Result<T>>){
  const data=await collectCompletePages(read,{batchSize:500,maxRows:50000,identity:row=>row.id});
  return{data,count:data.length,error:null};
}
/** Deliberately recent preview, with exact cardinality and stable source ordering. */
export async function verifiedPreview<T extends {id:number}>(query:PromiseLike<Result<T>>,limit:number){
  if(!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error("Invalid preview limit");
  const r=await query;
  if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0||!Array.isArray(r.data)||r.data.length!==Math.min(r.count,limit)||new Set(r.data.map(row=>row.id)).size!==r.data.length)throw Error("Preview could not be verified");
  return{data:r.data,count:r.count,error:null};
}
export async function verifiedHead(query:PromiseLike<{count:number|null;error:unknown}>){
  const r=await query;if(r.error||r.count===null||!Number.isSafeInteger(r.count)||r.count<0)throw Error("Count could not be verified");
  return{count:r.count,error:null};
}
