import type {HrSettingsRow,ActionResult,HrSettingsListParams} from '@/server/actions/hr/settings';

/** Consume the existing authorized list contract completely. No separate cache,
 * privileged client or silent first-page cap; PERF retains shared adapter ownership. */
export async function loadTrainingCategoryChoices(list:(p:HrSettingsListParams)=>Promise<ActionResult<{data:HrSettingsRow[];total:number}>>){
 const rows:HrSettingsRow[]=[],seen=new Set<number>();let expected:number|undefined;
 for(let page=1;;page++){
  const result=await list({is_active:true,page,page_size:200});
  if(!result.success||!result.data||!Number.isSafeInteger(result.data.total)||result.data.total<0)throw Error('Training category choices unavailable');
  expected??=result.data.total;
  if(result.data.total!==expected)throw Error('Training categories changed during loading');
  for(const row of result.data.data){if(seen.has(row.id)||!row.is_active||row.deleted_at!==null)throw Error('Incomplete training category choices');seen.add(row.id);rows.push(row);}
  if(rows.length===expected)return rows;
  if(!result.data.data.length||rows.length>expected)throw Error('Incomplete training category choices');
 }
}
