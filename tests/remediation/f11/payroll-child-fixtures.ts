import type{PayrollChildKind}from'@/lib/hr/payroll-child-contract';
export const payrollValues:Record<PayrollChildKind,Record<string,unknown>>={
 'payroll-profile':{payroll_group_id:null,effective_date:'2026-01-01',currency:'AED',payroll_status:'active',notes:null},
 'salary-component':{component_type_id:21,amount:1000,effective_from:'2026-01-01',effective_to:null,is_active:true,notes:null},
 'salary-revision':{effective_date:'2026-02-01',revision_reason:'Synthetic revision',new_gross:1500,apply_to_components:true,fingerprint:'a'.repeat(64)},
 'wps-profile':{wps_applicable:true,wps_status:'active',bank_id:null,account_holder_name:'Synthetic holder',exchange_house:null,salary_payment_method:'bank_transfer',labour_card_number:null,mohre_person_code:null,mohre_establishment_id:null,salary_effective_date:null},
 'payroll-hold':{hold_reason:'Synthetic hold',hold_date:'2026-01-01',notes:null},
};
