/** Revised wording explicitly approved by the owner on 30 October 2026.
 * Confirmation v2 stays separate. Source-workflow holds are NOT approval gates. */
import type {OfficialBodyBlock,OfficialDocumentDefinition,OfficialDocumentInputField,OfficialDocumentRenderContext} from '../../types';
import {formatAmount,formatDateAr,formatDateEn,str} from '../helpers';
import {hrLetterSourceInputs} from '../../hr-source-contract';
import {proposedHrWording} from './review-wording';
import {approvedHrSourceError,HR_SOURCE_WORKFLOW_HOLDS} from './approved-source-readiness';
type Context=OfficialDocumentRenderContext;
const aliases:Record<string,string>={employee_name_en:'employee_name',employee_no:'employee_code',company_name_en:'company_name',job_title_en:'designation',job_title_ar:'designation_ar',bank_name_en:'bank_name',department_en:'department',end_date:'employment_end_date',last_wage:'final_wage',last_wage_ar:'final_wage',verified_termination_reason:'termination_reason',verified_termination_reason_ar:'termination_reason_ar',gross_monthly_salary:'gross_salary',gross_monthly_salary_ar:'gross_salary',leave_request_ref:'leave_reference',leave_type_en:'leave_type',leave_start_date:'leave_start',leave_end_date:'leave_end',receiving_employee_name_en:'receiving_employee_name'};
const inputAliases:Record<string,string>={recipient_name_en:'addressee',recipient_name_ar:'addressee_ar',specific_approved_activity_en:'purpose',specific_approved_activity_ar:'purpose_ar',application_purpose_en:'purpose',application_purpose_ar:'purpose_ar',embassy_or_consulate_name_en:'addressee',embassy_or_consulate_name_ar:'addressee_ar',purpose_en:'purpose'};
const field=(key:string,labelEn:string,type:'text'|'date'='text'):OfficialDocumentInputField=>({key,labelEn,type,required:false,maxLength:type==='date'?10:250});
const val=(ctx:Context,key:string,ar=false)=>str(ctx.row[ar?`${key}_ar`:key])||str(ctx.row[key])||'—';
function token(ctx:Context,key:string,ar:boolean):string {
 if(key==='issue_date')return ctx.row.issue_date?(ar?formatDateAr(ctx.row.issue_date):formatDateEn(ctx.row.issue_date)):(ar?ctx.issuedDateAr:ctx.issuedDateEn);
 if(key==='document_ref')return ctx.serialNo??'—';
 if(key==='recipient_name_en')return ctx.inputs.addressee?.trim()||'TO WHOM IT MAY CONCERN';
 if(key==='recipient_name_ar')return ctx.inputs.addressee_ar?.trim()||'إلى من يهمه الأمر';
 const source=aliases[key]??key;
 const value=str(ctx.inputs[inputAliases[key]??key])||str(ctx.row[source]);
 if(['last_wage','last_wage_ar'].includes(key))return value?`${formatAmount(value)}${ar?' درهم إماراتي — إجمالي الأجر الشهري':' (gross monthly)'}`:'—';
 if(['gross_monthly_salary','gross_monthly_salary_ar','last_wage','last_wage_ar'].includes(key))return value?`${formatAmount(value)}${ar?' درهم إماراتي':''}`:'—';
 if(/date$/.test(key)||['joining_date','end_date','leave_start_date','leave_end_date','valid_until','corrective_deadline'].includes(key))return value?(ar?formatDateAr(value):formatDateEn(value)):'—';
 return value||'—';
}
/** Drafting slash alternatives and bracketed editorial instructions never print. */
function expand(text:string,ctx:Context,ar:boolean):string {
 let output=text.replace(/\s*\[[^\]]*\]/g,'');
 if(!ctx.inputs.approved_conditions_en&&!ar)output=output.replace(', subject to {{approved_conditions_en}}','');
 if(!ctx.inputs.approved_conditions_ar&&ar)output=output.replace('، وذلك وفق الشروط المعتمدة {{approved_conditions_ar}}','');
 if(!ctx.inputs.addressee&&!ar)output=output.replace('To: {{recipient_name_en}}','TO WHOM IT MAY CONCERN');
 if(!ctx.inputs.addressee_ar&&ar)output=output.replace('إلى: {{recipient_name_ar}}','إلى من يهمه الأمر');
 const female=str(ctx.row.gender).toLowerCase()==='female';
 for(const [male,fem] of [['السيد','السيدة'],['الموظف','الموظفة'],['يعمل','تعمل'],['يشغل','تشغل'],['عمل','عملت'],['شغلها','شغلتها']])output=output.split(`${male}/${fem}`).join(female?fem:male);
 return output.replace(/{{([a-z_]+)}}/g,(_,key:string)=>token(ctx,key,ar));
}
const pair=(en:string,ar:string)=>({en,ar});
type RecordTable=Extract<OfficialBodyBlock,{kind:'record_table'}>;
const table=(titleEn:string,titleAr:string,columns:[string,string][],rows:{en:string;ar:string}[][]):RecordTable=>({kind:'record_table',titleEn,titleAr,columns:columns.map(([en,ar])=>pair(en,ar)),rows});
const blank=()=>pair('','');
function operationalTables(code:string,ctx:Context):OfficialBodyBlock[]{
 if(code==='HR_CLEARANCE_FORM')return [table('Department reviews','مراجعات الجهات',[
  ['Department','الجهة'],['Reviewer','المراجع'],['Decision','القرار'],['Outstanding item','بند معلق'],['Action owner','مسؤول الإجراء'],['Due date','الاستحقاق'],['Verified date','التحقق'],['Signature','التوقيع'],['Supporting record','المستند المؤيد']],
  ctx.rows.filter(row=>row.clearance_area).map(row=>[pair(str(row.clearance_area),str(row.clearance_area_ar)||str(row.clearance_area)),pair(str(row.reviewer_name),str(row.reviewer_name)),pair(str(row.item_status),str(row.item_status_ar)||str(row.item_status)),pair(str(row.item_title),str(row.item_title)),pair(str(row.responsible_name),str(row.responsible_name)),blank(),pair(formatDateEn(row.cleared_at),formatDateAr(row.cleared_at)),blank(),pair(str(row.evidence_reference),str(row.evidence_reference))])),
  {kind:'paragraph',en:'Decisions: Cleared / Pending / Not applicable.',ar:'القرارات: تمت التصفية / معلق / لا ينطبق.'},
  {kind:'paragraph',en:`Final clearance status: ${val(ctx,'clearance_status_label')}. Any outstanding items are listed above. This form does not itself establish payment of final entitlements or waive statutory rights.`,ar:`حالة إخلاء الطرف النهائية: ${val(ctx,'clearance_status',true)}. وترد البنود المعلقة أعلاه إن وجدت. ولا يُعد هذا النموذج بحد ذاته إثباتاً لصرف المستحقات النهائية أو تنازلاً عن الحقوق المقررة قانوناً.`}];
 if(code==='HR_JOINING_CHECKLIST')return [table('Joining requirements','متطلبات الالتحاق',[
  ['Task','المتطلب'],['Required?','إلزامي؟'],['Status','الحالة'],['Owner','المسؤول'],['Evidence document','الدليل'],['Completion date','تاريخ الإنجاز'],['Comments','ملاحظات']],
  [['Employee profile / accepted employment documents','الملف الوظيفي / مستندات العمل المقبولة'],['Identity / compliance','الهوية / الامتثال'],['Bank / payroll / WPS readiness','جاهزية البنك / الرواتب / حماية الأجور'],['Worksite / reporting','موقع العمل / الإشراف'],['DMS evidence','أدلة إدارة الوثائق'],['Induction','التهيئة'],['PPE / HSE','الوقاية / السلامة'],['IT access / equipment','صلاحيات تقنية المعلومات / الأجهزة'],['Emergency contact','الاتصال في الطوارئ'],['Unresolved mandatory tasks','المتطلبات الإلزامية المعلقة']].map(([en,ar])=>[pair(en,ar),...Array.from({length:6},blank)]))];
 if(code==='HR_PPE_ISSUE_FORM'){
  const items=ctx.rows.filter(row=>row.ppe_item&&row.ppe_item!=='No items');
  return [table('Issued equipment','المعدات المسلمة',[
   ['Item / type','البند / النوع'],['Stock / asset reference','مرجع المخزون / الأصل'],['Size / specification','المقاس / المواصفة'],['Quantity','الكمية'],['Condition','الحالة'],['Date','التاريخ'],['Issuer','المسلّم'],['Employee remarks','ملاحظات الموظف']],
   items.map(row=>[pair(str(row.ppe_item),str(row.ppe_item_ar)||str(row.ppe_item)),...['stock_reference','size_specification','quantity','condition'].map(key=>pair(str(row[key]),str(row[`${key}_ar`])||str(row[key]))),pair(formatDateEn(row.issue_date),formatDateAr(row.issue_date)),pair(str(row.issuer),str(row.issuer_ar)||str(row.issuer)),pair(str(row.employee_remarks),str(row.employee_remarks_ar)||str(row.employee_remarks))])),
   ...(items.length?[]:[{kind:'paragraph' as const,en:'No PPE items are currently recorded as issued to this employee.',ar:'لا توجد حالياً معدات وقاية شخصية مسجلة على أنها سُلّمت إلى هذا الموظف.'}])];
 }
 if(code==='HR_HANDOVER_FORM')return [table('Handover register','سجل التسليم',[
  ['Description / type','الوصف / النوع'],['Reference','المرجع'],['Status','الحالة'],['Receiver','المستلم'],['Handover date','تاريخ التسليم'],['Follow-up owner / due date','مسؤول المتابعة / الاستحقاق'],['Attachment','المرفق'],['Remarks','ملاحظات']],
  ctx.rows.map(row=>[pair(str(row.description_en),str(row.description_ar)),pair(str(row.reference),str(row.reference)),pair(str(row.status_en),str(row.status_ar)),pair(str(row.receiving_employee_name),str(row.receiving_employee_name_ar)),pair(formatDateEn(row.handover_date),formatDateAr(row.handover_date)),pair(str(row.owner_name),str(row.owner_name)),pair(str(row.evidence_reference),str(row.evidence_reference)),blank()])),
  {kind:'paragraph',en:'Signatures confirm only the specific items accepted; this document is not proof of final financial clearance.',ar:'تؤكد التوقيعات استلام البنود المحددة المقبولة فقط، ولا يُعد هذا النموذج إثباتاً لإخلاء الطرف المالي النهائي.'}];
 return [];
}
function signatureFields(code:string):OfficialBodyBlock[]{
 if(!['HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_CLEARANCE_FORM','HR_JOINING_CHECKLIST','HR_HANDOVER_FORM'].includes(code))return [];
 const labels=code==='HR_HANDOVER_FORM'?[['Handing-over employee','الموظف المسلّم'],['Receiving employee','الموظف المستلم'],['Department approver','معتمد الإدارة']]:code==='HR_PPE_ISSUE_FORM'?[['Employee recipient','الموظف المستلم'],['Issuing Store / HSE representative','ممثل المستودع / السلامة المسلّم']]:[['Employee receipt acknowledgement','إقرار الموظف بالاستلام'],['Authorised reviewer','المراجع المخوّل']];
 return [{kind:'form_table',titleEn:'Signatures and dates',titleAr:'التوقيعات والتواريخ',rows:labels.map(([labelEn,labelAr])=>({labelEn:`${labelEn} — name / signature / date`,labelAr:`${labelAr} — الاسم / التوقيع / التاريخ`,value:'',signatureCell:true}))}];
}
export function bilingualReviewDraft(base:OfficialDocumentDefinition):OfficialDocumentDefinition {
 const proposal=proposedHrWording[base.documentCode];if(!proposal)return base;
 const extra:OfficialDocumentInputField[]=[];
 if(['HR_NOC','HR_SALARY_CERT_WITH_AMOUNT','HR_EMBASSY_LETTER'].includes(base.documentCode))extra.push(field('addressee','Addressee (English)'),field('addressee_ar','Addressee (Arabic)'),field('purpose','Purpose / approved activity (English)'),field('purpose_ar','Purpose / approved activity (Arabic)'));
 if(base.documentCode==='HR_NOC')extra.push(field('approved_conditions_en','Approved conditions (English)'),field('approved_conditions_ar','Approved conditions (Arabic)'),field('valid_until','Approved expiry date','date'));
 const optionalInputs=[...base.optionalInputs.filter(f=>f.key!=='validity_period'),...hrLetterSourceInputs(base.documentCode),...extra].filter((f,i,all)=>all.findIndex(other=>other.key===f.key)===i)
  .map(input=>['purpose','valid_until'].includes(input.key)?{...input,required:true}:input);
 for(const input of [...optionalInputs])if(['addressee','purpose','validity_period'].includes(input.key)&&!optionalInputs.some(f=>f.key===`${input.key}_ar`))optionalInputs.push({...input,key:`${input.key}_ar`,labelEn:`${input.labelEn} — Arabic`,required:false});
 const evidence={source:'src/lib/official-documents/definitions/hr/review-wording.ts (ERP_HR_LETTERS_FORMS_DETAILED_REVISION_PROPOSAL.md, 2026-10-30)',provenance:'verified_prompt' as const,businessApprovalStatus:'approved' as const,
  approvedBy:'System owner',approvalDate:'2026-10-30',approvalReference:'Explicit owner approval of the revised English and Arabic wording for the other 13 letters/forms, ERP chat, 30 October 2026',
  approvalNotes:'Enable official generation locally after required checks pass. No push or deployment. This records wording approval, not completion of any employee transaction or source workflow.',
  note:'Exact revised wording approved; existing source, permission, independent transaction approval and immutable-original controls remain enforced.'};
 return {...base,version:base.version+(['HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_PPE_ISSUE_FORM','HR_HANDOVER_FORM','HR_CLEARANCE_FORM','HR_BANK_SALARY_TRANSFER','HR_EMBASSY_LETTER','HR_LEAVE_CONFIRMATION','HR_SALARY_CERT_WITH_AMOUNT'].includes(base.documentCode)?3:2),status:'published',titleEn:base.documentCode==='HR_SALARY_CERT_GENERAL'?'Employment Certificate — Without Salary Information':base.documentCode==='HR_BANK_SALARY_TRANSFER'?'Bank Salary Information Letter':base.titleEn,titleAr:proposal.ar[0],supportedLanguages:['en','ar','bilingual'],
  optionalInputs,validateInputs:(inputs,language)=>{
   const original=base.validateInputs?.(inputs,language);if(original)return original;
   if(inputs.valid_until&&!/^\d{4}-\d{2}-\d{2}$/.test(inputs.valid_until))return 'Choose a valid expiry date.';
   if(language!=='en'&&['HR_NOC','HR_EMBASSY_LETTER','HR_SALARY_CERT_WITH_AMOUNT'].includes(base.documentCode)&&inputs.purpose&&!inputs.purpose_ar?.trim())return 'Enter the Arabic purpose for Arabic or bilingual output.';
   if(language==='bilingual'&&!!inputs.addressee?.trim()!==!!inputs.addressee_ar?.trim())return 'Enter the named addressee in both English and Arabic.';
   return null;
  },
  wordingReviewOnly:!!HR_SOURCE_WORKFLOW_HOLDS[base.documentCode],sourceWorkflowReason:HR_SOURCE_WORKFLOW_HOLDS[base.documentCode],
  validateSource:context=>approvedHrSourceError(base.documentCode,context),
  bilingualLayoutType:base.documentCode.endsWith('_FORM')||base.documentCode==='HR_JOINING_CHECKLIST'?'bilingual_form_table':'narrative_two_column',wording:{en:{...evidence},ar:{...evidence}},
  build:ctx=>{
   const currentService=base.documentCode==='HR_EXPERIENCE_LETTER'&&!ctx.row.last_working_date;
   const en=currentService?['CURRENT SERVICE / EXPERIENCE CONFIRMATION','TO WHOM IT MAY CONCERN',`This is to confirm that {{employee_name_en}} has been employed by {{company_name_en}} since {{joining_date}} and currently holds the position of {{job_title_en}}.`,`Principal work performed: {{work_performed}}.`,"This certificate is issued at the employee's request as a record of current employment and service.",'For and on behalf of {{company_name_en}}']:proposal.en;
   const ar=currentService?['شهادة تأكيد الخدمة والخبرة الحالية','إلى من يهمه الأمر','تشهد {{company_name_ar}} بأن {{employee_name_ar}} يعمل/تعمل لديها منذ {{joining_date}}، ويشغل/تشغل حالياً وظيفة {{job_title_ar}}.','طبيعة العمل: {{work_performed_ar}}.','صدرت هذه الشهادة بناءً على طلب الموظف/الموظفة لإثبات العمل والخدمة الحالية.','عن {{company_name_ar}}']:proposal.ar;
   const body=(lines:string[])=>lines.slice(1).filter(line=>!(line.includes('{{verified_iban}}')&&ctx.row.bank_disclosure_authorised!==true)&&!line.startsWith('For and on behalf')&&!line.startsWith('عن {{')&&!line.startsWith('Employee receipt acknowledgment:')&&!line.startsWith('Authorised signatory:')&&!line.startsWith('إقرار بالاستلام:')&&!line.startsWith('المفوّض بالتوقيع:'));
   const enBody=body(en),arBody=body(ar);
   return {titleEn:en[0],titleAr:ar[0],blocks:[...enBody.map((text,i):OfficialBodyBlock=>({kind:'paragraph',en:expand(text,ctx,false),ar:expand(arBody[i]??'',ctx,true)})),...operationalTables(base.documentCode,ctx),...signatureFields(base.documentCode)],closingEn:`For and on behalf of ${val(ctx,'company_name')}`,closingAr:`عن ${val(ctx,'company_name',true)}`,showSignature:true};
  }};
}
