import { beforeAll, afterAll, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire(import.meta.url),db=require('../f00/local-db.cjs'),api=require('../f00/local-client.cjs');
const run='f03helper-'+randomBytes(4).toString('hex'),actors:Record<string,any>={};
const ledger:any={run,target:'algt-f00-local',production_mutations:0,accounts:[],rows:[],cleanup:false};
const save=()=>fs.writeFileSync(path.resolve('CODEX_AUDIT_13_09_2026/IMPLEMENTATION/F03/HELPER_TEST_RECORDS.json'),JSON.stringify(ledger,null,2));
let admin:any,anon:any,partyId:number;
const email=run+'@example.invalid',iban='SYNTHETIC-'+run;
async function insert(table:string,row:any){const r=await admin.from(table).insert(row).select('id').single();if(r.error)throw r.error;ledger.rows.push({table,id:r.data.id});save();return r.data.id;}
beforeAll(async()=>{
 db.assertDatabase();const k=api.keys();expect(k.API_URL).toBe('http://127.0.0.1:16421');
 const fresh=()=>createClient(k.API_URL,k.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 admin=createClient(k.API_URL,k.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});anon=fresh();save();
 const ids:Record<string,number>={};
 for(const code of ['master_data.parties.view','master_data.parties.view_bank_details']){
  const r=await admin.from('permissions').select('id').eq('permission_code',code).maybeSingle();if(r.error)throw r.error;
  ids[code]=r.data?.id??await insert('permissions',{permission_code:code,permission_name:'Synthetic '+code,module_code:'master_data',action_code:'view'});
 }
 for(const [name,caps] of [['none',[]],['scoped',['master_data.parties.view']],['reader',['master_data.parties.view']],['bank',['master_data.parties.view','master_data.parties.view_bank_details']]] as [string,string[]][]){
  const role=await insert('roles',{role_code:run+'-'+name,role_name:run+' '+name,is_system_role:false});
  for(const code of caps){const r=await admin.from('role_permissions').insert({role_id:role,permission_id:ids[code]});if(r.error)throw r.error;}
  const address=run+'-'+name+'@example.invalid',password=randomBytes(24).toString('base64url')+'aA9!';
  const u=await admin.auth.admin.createUser({email:address,password,email_confirm:true});if(u.error)throw u.error;ledger.accounts.push({id:u.data.user.id,email:address});save();
  const p=await admin.from('user_profiles').update({status:'active',must_change_password:false,owner_company_id:900101,branch_id:900201}).eq('auth_user_id',u.data.user.id).select('id').single();if(p.error)throw p.error;
  // The existing shared party-master policies require global capabilities.
  // Do not change those policies or silently widen a company-scoped assignment.
  const r=await admin.from('user_roles').insert({role_id:role,user_profile_id:p.data.id,owner_company_id:name==='scoped'?900101:null,branch_id:name==='scoped'?900201:null});if(r.error)throw r.error;
  const client=fresh();const login=await client.auth.signInWithPassword({email:address,password});if(login.error)throw login.error;actors[name]={client,profile:p.data.id};
 }
 const country=await admin.from('countries').select('id').limit(1).maybeSingle();if(country.error)throw country.error;
 const countryId=country.data?.id??await insert('countries',{country_code:'ZX',iso3_code:'ZZZ',name_en:run,nationality_en:'Synthetic'});
 const nature=await insert('party_natures',{nature_code:run,name_en:run});const status=await insert('party_statuses',{status_code:run,name_en:run});
 partyId=await insert('parties',{party_code:run,display_name:run,legal_name_en:run,party_nature_id:nature,party_status_id:status,country_id:countryId,main_email:email});
 await insert('party_bank_details',{party_id:partyId,bank_detail_code:run,account_holder_name:run,iban});
});
afterAll(async()=>{
 const failures=[];
 for(const a of ledger.accounts){const r=await admin.auth.admin.deleteUser(a.id);if(r.error)failures.push('account '+a.id);}
 for(const row of [...ledger.rows].reverse()){
  if(row.table==='roles'){const r=await admin.from('role_permissions').delete().eq('role_id',row.id);if(r.error)failures.push('grants '+row.id);}
  const r=await admin.from(row.table).delete().eq('id',row.id);if(r.error)failures.push(row.table+' '+row.id);
 }
 ledger.cleanup=failures.length===0;ledger.cleanupFailures=failures;save();expect(failures).toEqual([]);
});
it('blocks direct anonymous and unprivileged email-directory RPC calls',async()=>{
 for(const client of [anon,actors.none.client]){const r=await client.rpc('search_users_for_email',{p_search:run});expect(r.error?.code).toBe('42501');expect(r.data).toBeNull();}
});
it('denies anonymous party hints before evaluating matching records',async()=>{
 for(const value of [email,'missing-'+email]){const r=await anon.rpc('detect_possible_party_duplicates',{p_main_email:value});expect(r.error?.code).toBe('42501');expect(r.data).toBeNull();}
});
it('gives an unprivileged principal identical empty hints for existing and missing synthetic parties',async()=>{
 for(const value of [email,'missing-'+email]){const r=await actors.none.client.rpc('detect_possible_party_duplicates',{p_main_email:value});expect(r.error).toBeNull();expect(r.data).toEqual([]);}
});
it('retains legitimate duplicate detection under party read permission',async()=>{
 const r=await actors.reader.client.rpc('detect_possible_party_duplicates',{p_main_email:email});expect(r.error).toBeNull();expect(r.data.map((p:any)=>p.party_id)).toEqual([partyId]);
});
it('does not turn a company-scoped capability into global shared-master access',async()=>{
 const r=await actors.scoped.client.rpc('detect_possible_party_duplicates',{p_main_email:email});expect(r.error).toBeNull();expect(r.data).toEqual([]);
});
it('requires banking read access for an IBAN match, independently of party access',async()=>{
 const hidden=await actors.reader.client.rpc('detect_possible_party_duplicates',{p_iban:iban});expect(hidden.error).toBeNull();expect(hidden.data).toEqual([]);
 const allowed=await actors.bank.client.rpc('detect_possible_party_duplicates',{p_iban:iban});expect(allowed.error).toBeNull();expect(allowed.data.map((p:any)=>p.party_id)).toEqual([partyId]);
});
it('removes lookup authority immediately when the profile is disabled',async()=>{
 const r=await admin.from('user_profiles').update({status:'inactive'}).eq('id',actors.reader.profile);expect(r.error).toBeNull();
 const denied=await actors.reader.client.rpc('detect_possible_party_duplicates',{p_main_email:email});expect(denied.error).toBeNull();expect(denied.data).toEqual([]);
});
