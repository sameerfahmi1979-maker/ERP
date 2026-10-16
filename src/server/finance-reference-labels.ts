import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {CostCenterWithRelations,ProfitCenterWithRelations} from '@/features/master-data/finance-basics/types';
import type {FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';

const label=z.object({
 owner_company:z.object({company_code:z.string(),legal_name_en:z.string()}).strict().nullable(),
 branch:z.object({branch_code:z.string(),branch_name_en:z.string(),branch_name_ar:z.string().nullable()}).strict().nullable(),
 parent:z.object({code:z.string(),name_en:z.string(),name_ar:z.string().nullable()}).strict().nullable(),
 type_label:z.object({value_code:z.string(),value_label_en:z.string(),value_label_ar:z.string().nullable()}).strict().nullable(),
}).strict();
const catalogue=z.record(z.string().regex(/^[1-9]\d*$/),label);

/** F06 authority labels only. Existing PERF-owned list/search/cache contracts stay intact. */
export async function attachFinanceReferenceLabels<T extends CostCenterWithRelations|ProfitCenterWithRelations>(
 entity:FinanceCenterEntity,rows:T[],
):Promise<T[]>{
 if(!rows.length)return rows;
 const client=await createClient();const labels:Record<string,z.infer<typeof label>>={};
 // Bound each authority request without silently truncating an existing caller's
 // records. This does not load, search, page or cache business records.
 for(let start=0;start<rows.length;start+=1000){
  const ids=rows.slice(start,start+1000).map(r=>r.id);
  const {data,error}=await client.rpc('get_finance_reference_labels',{p_entity:entity,p_ids:ids});
  const parsed=catalogue.safeParse(data);
  if(error||!parsed.success||Object.keys(parsed.data).some(id=>!ids.includes(Number(id))))throw new Error('Finance reference labels unavailable');
  Object.assign(labels,parsed.data);
 }
 const prefix=entity==='cost_centers'?'cost':'profit';
 return rows.map(row=>{
  const references=labels[String(row.id)];
  // A grant revoked between the row and label reads must not masquerade as
  // missing organization assignments or expose a partly authorized result.
  if(!references)throw new Error('Finance reference labels unavailable');
  return {...row,owner_company:references.owner_company??undefined,branch:references.branch??undefined,
   parent:references.parent?{[prefix+'_center_code']:references.parent.code,[prefix+'_center_name_en']:references.parent.name_en,[prefix+'_center_name_ar']:references.parent.name_ar}:undefined,
   type_label:references.type_label??undefined} as T;
 });
}
