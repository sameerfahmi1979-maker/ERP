import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {HR_INTEGRATED_LETTERS} from '@/lib/official-documents/hr-source-contract';
export async function hrLetterIntegrationReady(){
 try{const db=await createClient();const r=await db.rpc('hr_letter_integration_version');return !r.error&&r.data===1;}catch{return false;}
}
export async function requireHrLetterIntegration(code:string){
 if(HR_INTEGRATED_LETTERS.includes(code)&&!await hrLetterIntegrationReady())throw Error('The reviewed letter integration database update is not installed or current access is unavailable. No official document was issued.');
}
