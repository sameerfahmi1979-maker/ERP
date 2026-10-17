import 'server-only';
import {z} from 'zod';
import type {SupabaseClient} from '@supabase/supabase-js';
import {readVerifiedIntakeSource} from './dms-verified-intake-source';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const plan=z.object({actorId:id,authSessionId:z.string().uuid(),source:z.object({id,name:z.string().min(1),mime:z.string().min(1),size:id,
 sha256:z.string().nullable(),path:z.string().min(1),owner:id.nullable(),company:id.nullable(),branch:id.nullable(),expiry:z.string().nullable()}).strict()}).strict();
export async function verifyAndAttestIntakeSource(client:SupabaseClient,admin:SupabaseClient,sessionId:number){
 const prepared=await client.rpc('f07_prepare_intake_source',{p_session:sessionId});
 const p=plan.safeParse(prepared.data);
 if(prepared.error||!p.success||p.data.source.id!==sessionId)throw Error('The original intake is unavailable or outside your current access.');
 const verified=await readVerifiedIntakeSource(admin.storage.from('dms-temp'),p.data.source);
 const stored=await admin.rpc('f07_attest_intake_source',{p_session:sessionId,p_actor:p.data.actorId,p_auth_session:p.data.authSessionId,p_source:p.data.source,
  p_object:verified.object.id,p_version:verified.object.version,p_updated:verified.object.lastModified,p_sha256:verified.proof.sha256});
 if(stored.error)throw Error('The verified original identity could not be retained.');
 // A service attestation conveys bytes, never user authorization. Readmit the
 // actor through the ordinary connection after external work and possible waits.
 const readmitted=await client.rpc('f07_prepare_intake_source',{p_session:sessionId});
 const r=plan.safeParse(readmitted.data);
 if(readmitted.error||!r.success||JSON.stringify(r.data)!==JSON.stringify(p.data))throw Error('The original intake or your access changed.');
 return {...verified,plan:p.data};
}
