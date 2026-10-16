import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';

const safeId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const field=z.enum(['trade_name','main_activity','established_date','office_address_line_1','office_address_line_2']);
const receipt=z.object({suggestionId:safeId,companyId:safeId,field,changed:z.boolean(),revision:z.string().regex(/^[1-9]\d*$/),replayed:z.boolean()}).strict();
type AppliedCompanySuggestion=z.infer<typeof receipt>;
type ApplyResult={success:true;data:AppliedCompanySuggestion[];message:string}|{success:false;uncertain:boolean;message:string};

/** The persisted, human-reviewed suggestions are the operation identities. */
export async function applyCompanySuggestions(suggestionIds:number[],companyId:number,acceptPending=false):Promise<ApplyResult>{
 if(!safeId.safeParse(companyId).success||!z.array(safeId).min(1).max(50).safeParse(suggestionIds).success||new Set(suggestionIds).size!==suggestionIds.length)
  return {success:false,uncertain:false,message:'The reviewed company suggestion identities are invalid.'};
 try{
  const db=await createClient();
  const {data,error}=await db.rpc('apply_company_field_suggestions',{p_company:companyId,p_suggestions:suggestionIds,p_accept_pending:acceptPending});
  if(error){
   const uncertain=!(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT|55)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain,message:error.code==='42501'?'You no longer have access to this company, its suggestions or the source document.'
    :error.code==='PT409'?'The company or reviewed suggestions changed. Generate and review new suggestions before applying.'
    :error.code==='PT404'?'A reviewed company suggestion is unavailable.'
    :uncertain?'Apply unconfirmed. Retry the same selected suggestions to recover their result.'
    :'The suggestions were rejected; no company field change was committed.'};
  }
  const parsed=z.array(receipt).safeParse(data);
  if(!parsed.success||parsed.data.length!==suggestionIds.length||new Set(parsed.data.map(r=>r.suggestionId)).size!==suggestionIds.length
   ||parsed.data.some(r=>r.companyId!==companyId||!suggestionIds.includes(r.suggestionId)))
   return {success:false,uncertain:true,message:'Apply response incomplete. Retry the same selected suggestions to recover their result.'};
  return {success:true,data:parsed.data,message:parsed.data.every(r=>r.replayed)?'These reviewed suggestions were already applied.':'The reviewed company fields are saved.'};
 }catch{return {success:false,uncertain:true,message:'Apply unconfirmed. Retry the same selected suggestions to recover their result.'};}
}

export async function applyCompanySuggestion(suggestionId:number,companyId:number,targetField:string,acceptPending=false){
 const result=await applyCompanySuggestions([suggestionId],companyId,acceptPending);
 if(result.success&&result.data[0].field!==targetField)return {success:false,uncertain:true,message:'Apply response incomplete. Retry this same suggestion to recover its result.'};
 return result;
}
