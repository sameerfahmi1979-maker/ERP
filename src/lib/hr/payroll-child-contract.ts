import{z}from'zod';
import{employeeDate,employeeId}from'./employee-contract';
import{salaryMinorUnits}from'./payroll/salary-as-of';
export const payrollChildKind=z.enum(['payroll-profile','salary-component','salary-revision','wps-profile','payroll-hold']);
export type PayrollChildKind=z.infer<typeof payrollChildKind>;
const money=z.number().finite().min(0).max(9999999999.99).refine(v=>{try{salaryMinorUnits(v);return true;}catch{return false;}},'Use at most two decimal places.');
const profileFields={payroll_group_id:employeeId.nullable(),effective_date:employeeDate,currency:z.string().trim().regex(/^[A-Z]{3}$/,'Use an uppercase three-letter currency code.'),payroll_status:z.enum(['active','hold','inactive','not_configured']),notes:z.string().max(2000).nullable()};
const componentFields={component_type_id:employeeId,amount:money,effective_from:employeeDate,effective_to:employeeDate.nullable(),is_active:z.boolean(),notes:z.string().max(1000).nullable()};
const wpsFields={wps_applicable:z.boolean(),wps_status:z.enum(['active','hold','exempt','not_enrolled']),bank_id:employeeId.nullable(),account_holder_name:z.string().max(200).nullable(),exchange_house:z.string().max(200).nullable(),salary_payment_method:z.enum(['bank_transfer','exchange_house','cheque']),labour_card_number:z.string().max(100).nullable(),mohre_person_code:z.string().max(100).nullable(),mohre_establishment_id:employeeId.nullable(),salary_effective_date:employeeDate.nullable()};
export const payrollProfileValues=z.object(profileFields).strict();
export const salaryComponentValues=z.object(componentFields).strict().refine(v=>v.effective_to===null||v.effective_to>=v.effective_from,{path:['effective_to'],message:'Effective to must not precede effective from.'});
export const salaryRevisionValues=z.object({effective_date:employeeDate,revision_reason:z.string().max(1000).nullable(),new_gross:money,apply_to_components:z.boolean(),fingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
export const payrollHoldValues=z.object({hold_reason:z.string().trim().min(1,'Hold reason is required.').max(500),hold_date:employeeDate,notes:z.string().max(1000).nullable()}).strict();
export const wpsProfileValues=z.object({...wpsFields,account_number:z.string().trim().min(1).max(50).nullable().optional(),iban:z.string().trim().min(1).max(34).refine(v=>!v.startsWith('AE')||v.length===23,'UAE IBAN must be 23 characters starting with AE.').nullable().optional()}).strict();
export const payrollChildValues=(kind:PayrollChildKind)=>kind==='payroll-profile'?payrollProfileValues:kind==='salary-component'?salaryComponentValues:kind==='salary-revision'?salaryRevisionValues:kind==='wps-profile'?wpsProfileValues:payrollHoldValues;
export const payrollOpeningValues=(kind:PayrollChildKind)=>kind==='payroll-profile'?z.object({...profileFields,currency:z.string(),notes:z.string().nullable()}).strict():kind==='salary-component'?z.object({...componentFields,notes:z.string().nullable()}).strict():kind==='wps-profile'?z.object({...wpsFields,account_holder_name:z.string().nullable(),exchange_house:z.string().nullable(),labour_card_number:z.string().nullable(),mohre_person_code:z.string().nullable()}).strict():kind==='payroll-hold'?payrollHoldValues.extend({hold_reason:z.string(),notes:z.string().nullable()}):z.object({fingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
export const PAYROLL_CHILD_TABLES={
 'payroll-profile':'employee_payroll_profiles','salary-component':'employee_salary_components','salary-revision':'employee_salary_revisions','wps-profile':'employee_wps_profiles','payroll-hold':'employee_payroll_holds',
}as const;
/** Complete permitted visible columns. Bank account/IBAN values never return in an opening. */
export const PAYROLL_CHILD_COLUMNS={
 'payroll-profile':'payroll_group_id,effective_date,currency,payroll_status,notes',
 'salary-component':'component_type_id,amount,effective_from,effective_to,is_active,notes',
 'salary-revision':'effective_date,revision_reason,old_gross,new_gross',
 'wps-profile':'wps_applicable,wps_status,bank_id,account_holder_name,exchange_house,salary_payment_method,labour_card_number,mohre_person_code,mohre_establishment_id,salary_effective_date',
 'payroll-hold':'hold_reason,hold_date,notes',
}as const;
