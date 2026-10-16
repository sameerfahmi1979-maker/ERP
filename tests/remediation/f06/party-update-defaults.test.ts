import {expect,it} from 'vitest';
import {updatePartySchema,updatePartyAddressSchema,updatePartyContactSchema,updatePartyBankDetailSchema,updatePartyLicenseSchema,updatePartyTaxRegistrationSchema,updatePartyDocumentSchema} from '@/features/master-data/parties/party-schemas';
const cases=[
 ['party',updatePartySchema,{id:1,display_name:'Synthetic',legal_name_en:'Synthetic',party_nature_id:1,party_status_id:1,country_id:1},['is_active']],
 ['address',updatePartyAddressSchema,{id:1,party_id:1,address_type_id:1,country_id:1},['is_active','is_primary','is_billing_address','is_shipping_address','is_site_address']],
 ['contact',updatePartyContactSchema,{id:1,party_id:1,full_name:'Synthetic'},['is_active','is_primary','is_accounts_contact','is_sales_contact','is_operations_contact','is_hse_contact','is_documents_contact']],
 ['bank',updatePartyBankDetailSchema,{id:1,party_id:1,account_holder_name:'Synthetic'},['is_active','is_primary']],
 ['license',updatePartyLicenseSchema,{id:1,party_id:1,license_type_id:1,license_number:'SYNTHETIC',license_status_id:1},['is_active','is_primary','renewal_required']],
 ['tax',updatePartyTaxRegistrationSchema,{id:1,party_id:1,tax_type_id:1,tax_registration_number:'SYNTHETIC',tax_status_id:1},['is_active','is_primary','reverse_charge_applicable','vat_exempt']],
 ['document',updatePartyDocumentSchema,{id:1,party_id:1,document_type_id:1,document_title:'Synthetic',document_status_id:1},['expiry_required']],
] as const;
it.each(cases)('%s edits do not invent omitted boolean values',(_,schema,input,fields)=>{
 const parsed=schema.parse(input);for(const field of fields)expect(parsed).not.toHaveProperty(field);
});
it.each(cases)('%s edits preserve explicit false and true values',(_,schema,input,fields)=>{
 for(const flag of [false,true]){const supplied=Object.fromEntries(fields.map(field=>[field,flag]));expect(schema.parse({...input,...supplied})).toMatchObject(supplied);}
});
