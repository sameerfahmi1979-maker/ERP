import 'server-only';
import {createClient} from '@/lib/supabase/server';
import {letterReviewRow} from '@/lib/official-documents/hr-source-review';

/** The session RPC independently checks employee, source and DMS authority.
 * Never substitute an admin client or a newer evidence version here. */
export async function readApprovedLetterReview(employeeId:number,code:string,id:unknown){
 if(!/^[1-9]\d*$/.test(String(id))||!Number.isSafeInteger(Number(id)))throw Error('Choose an approved source review.');
 const db=await createClient();
 const response=await db.rpc('hr_letter_source_review',{p_employee:employeeId,p_code:code,p_action:'read',p_id:Number(id)});
 if(response.error)throw Error('The approved source review or its original evidence is unavailable. Review the source again.');
 const row=letterReviewRow.parse(response.data);
 if(row.id!==Number(id)||row.employee_id!==employeeId||row.code!==code||row.status!=='approved'||!row.reviewed_by||row.reviewed_by===row.created_by)throw Error('Independent source approval is required.');
 return row;
}
