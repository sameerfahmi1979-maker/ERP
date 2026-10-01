import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {guard,runtime} from './full-db.mjs';
guard();
const keys=JSON.parse(fs.readFileSync(path.join(runtime,'keys-private.json'),'utf8'));
assert.equal(keys.API_URL,'http://127.0.0.1:16521');
const file=path.join(runtime,'fixtures-private.json'),ledger=JSON.parse(fs.readFileSync(file,'utf8'));
const db=createClient(keys.API_URL,keys.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const save=()=>fs.writeFileSync(file,JSON.stringify(ledger,null,2));
const p=await db.from('erp_email_provider_configs').insert({provider_code:'F09_BROWSER_'+randomUUID(),provider_type:'microsoft_graph',provider_name:'F09 synthetic no transport',is_active:true,is_enabled:true,is_default:false,throttle_per_minute:2,daily_send_limit:2}).select('*').single();assert.equal(p.error,null);
ledger.browserStates={providerId:p.data.id};save();
for(const kind of ['unknown','retry','quota']){
 const row=await db.from('erp_email_queue').insert({source_module:'SYSTEM',to_emails:['f09-'+kind+'@example.invalid'],subject:'F09 synthetic '+kind+' - no provider send',text_body:'Local simulated outcome only',created_by:ledger.actors.operator.profileId,provider_config_id:p.data.id,status:'pending',max_attempts:3,intent_key:'f09-browser:'+randomUUID()}).select('id').single();assert.equal(row.error,null);
 const id=row.data.id;ledger.queueIds.push(id);ledger.browserStates[kind]=id;save();
 const owner=randomUUID(),c=await db.rpc('f09_claim_email',{p_owner:owner,p_id:id,p_module:null});assert.equal(c.error,null);assert.equal(c.data.length,1);
 const fence={p_id:id,p_owner:owner,p_token:c.data[0].lease_token};
 const admit=await db.rpc('f09_admit_email_dispatch',{...fence,p_provider_id:p.data.id,p_expected:p.data});assert.equal(admit.error,null);assert.equal(admit.data,kind==='quota'?'deferred':'allowed');
 if(kind!=='quota'){const result=await db.rpc('f09_finish_provider_email',{...fence,p_outcome:kind,p_retry_after:kind==='retry'?new Date(Date.now()+3600000).toISOString():null});assert.equal(result.error,null);assert.equal(result.data,true);}
}
assert.equal((await db.from('erp_email_provider_configs').update({is_enabled:false}).eq('id',p.data.id)).error,null);
console.log(JSON.stringify({syntheticBrowserStates:ledger.browserStates,externalSends:0}));
