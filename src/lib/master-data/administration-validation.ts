import {z} from 'zod';

export const administrationDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a calendar date.').refine(value=>{
 const date=new Date(`${value}T00:00:00Z`);
 return Number(value.slice(0,4))>=1&&Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
},'Use a valid calendar date.').nullable().optional();

export function validateAdministrationDates(data:Record<string,unknown>,ctx:z.RefinementCtx){
 for(const [start,end]of [['opening_date','closing_date'],['trade_license_issue_date','trade_license_expiry_date'],['icv_issue_date','icv_expiry_date']]){
  if(typeof data[start]==='string'&&typeof data[end]==='string'&&data[end]<data[start])ctx.addIssue({code:'custom',path:[end],message:'The end date cannot precede the start date.'});
 }
}

/** Never return a database message, row dump or internal constraint name. */
export function administrationWriteError(error:{code?:string;message?:string}):string{
 const known:Record<string,string>={
  'Review and revoke administrator assignments before closing or transferring this scope':'Review and remove administrator assignments before closing or moving this company or branch.',
  'Organization identity is immutable':'The company code and established identifiers cannot be changed.',
  'Branch identity and ownership are immutable':'The branch code and established company cannot be changed.',
  'Invalid administration date range':'The end date cannot precede the start date.',
  'Invalid administration geography':'Country, region, city and area must form one valid location.',
  'Choose active administration geography':'Choose an available active location. Unchanged historical selections may be retained.',
  'Invalid administration value':'Check the company or branch field values before saving.',
  'Referenced administration geography cannot be reassigned':'This location is referenced by company or branch history. Its parent cannot be changed.',
 };
 if(error.message&&Object.hasOwn(known,error.message))return known[error.message];
 if(error.code==='23505')return 'A company or branch with this identifier already exists.';
 if(error.code==='42501')return 'This record is unavailable or you no longer have permission to change it.';
 if(error.code==='23503'||error.code==='23514')return 'The selected values or dependencies prevent this change. Review the current record.';
 return 'The change could not be confirmed. Keep your entries and check the latest record before retrying.';
}
