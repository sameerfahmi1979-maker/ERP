import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {departmentScopeCatalogueSchema,type DepartmentScopeCatalogue} from '@/lib/master-data/department-scope-catalogue';
// Domain authority projection, not a second shared read/cache/pagination layer.
// The single JSON response contains the complete permitted catalogue, avoiding
// PostgREST's set-returning row limit. PERF integration/measurement stays open.
export async function readDepartmentScopeCatalogue():Promise<{success:true;data:DepartmentScopeCatalogue}|{success:false;error:string}>{
 try{
  const client=await createClient();const {data,error}=await client.rpc('get_department_scope_catalogue');
  const parsed=departmentScopeCatalogueSchema.safeParse(data);
  if(error||!parsed.success)return {success:false,error:'Department organizations and branches could not be loaded. Try again.'};
  return {success:true,data:parsed.data};
 }catch{return {success:false,error:'Department organizations and branches could not be loaded. Try again.'};}
}
