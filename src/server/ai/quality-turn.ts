import 'server-only';
import {createHash} from 'node:crypto';
import type {createClient} from '@/lib/supabase/server';
type Db=Awaited<ReturnType<typeof createClient>>;
/** A verified missing contract preserves old deployed compatibility. Other
 * errors hold admission; a network/access failure never disables a control. */
export async function beginQualityTurn(db:Db,sessionId:number,requestId:string|undefined,userMessage:string){
 const version=await db.rpc('ai_mod05_version');
 if(version.error&&['PGRST202','42883'].includes(version.error.code))return null;
 if(version.error||version.data!==1)throw Error('Quality admission is unavailable.');
 if(!requestId)throw Error('Refresh the client to retain an original request.');
 const hash=createHash('sha256').update(JSON.stringify({sessionId,userMessage})).digest('hex');
 const result=await db.rpc('ai_mod05_turn',{p_action:'begin',p_session:sessionId,p_request:requestId,p_hash:hash});
 if(result.error||result.data?.state!=='started'||result.data?.replayed!==false)throw Error('This turn is paused, limited or retained for recovery. Reload its original conversation; do not repeat paid processing.');
 if(typeof result.data.authorityHash!=='string'||!/^[a-f0-9]{64}$/.test(result.data.authorityHash))throw Error('Current authority receipt unavailable.');
 return {sessionId,requestId,hash,authorityHash:result.data.authorityHash as string};
}
export async function finishQualityTurn(db:Db,admission:Awaited<ReturnType<typeof beginQualityTurn>>){
 if(!admission)return true;
 const r=await db.rpc('ai_mod05_turn',{p_action:'finish',p_session:admission.sessionId,p_request:admission.requestId,p_hash:admission.hash});
 return !r.error&&r.data?.state==='complete';
}
