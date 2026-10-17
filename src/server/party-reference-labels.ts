import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const referenceId=z.number().int().positive().safe().nullable();
const referenceKeys=['country_id','emirate_id','city_id','area_zone_id'] as const;
const label=z.object({
 country_id:referenceId,emirate_id:referenceId,city_id:referenceId,area_zone_id:referenceId,
 country_name:z.string().nullable(),emirate_name:z.string().nullable(),
 city_name:z.string().nullable(),area_zone_name:z.string().nullable(),
}).strict();
const catalogue=z.record(z.string().regex(/^[1-9]\d*$/),label);
type RecordReferences={id:number;country_id?:number|null;emirate_id?:number|null;city_id?:number|null;area_zone_id?:number|null};

/** Authority-only labels: does not search, page or cache the PERF-owned reads. */
export async function attachPartyReferenceLabels<T extends RecordReferences>(
 entity:'parties'|'party_addresses',rows:T[],
):Promise<T[]>{
 if(!rows.length)return rows;
 const client=await createClient();const labels:Record<string,z.infer<typeof label>>={};
 for(let start=0;start<rows.length;start+=1000){
  const ids=rows.slice(start,start+1000).map(row=>row.id);
  if(ids.some(id=>!Number.isSafeInteger(id)||id<=0))throw new Error('Party reference labels unavailable');
  const {data,error}=await client.rpc('get_party_reference_labels',{p_entity:entity,p_ids:ids});
  const parsed=catalogue.safeParse(data);
  if(error||!parsed.success||Object.keys(parsed.data).some(id=>!ids.includes(Number(id))))throw new Error('Party reference labels unavailable');
  Object.assign(labels,parsed.data);
 }
 return rows.map(row=>{
  const references=labels[String(row.id)];
  // Denial after revocation, or changed references between reads, is not an
  // empty label. Fail closed rather than mixing snapshots or broadening access.
  if(!references||referenceKeys.some(key=>(row[key]??null)!==references[key]))throw new Error('Party reference labels unavailable');
  const {country_name,emirate_name,city_name,area_zone_name}=references;
  return {...row,country_name,emirate_name,city_name,area_zone_name};
 });
}
