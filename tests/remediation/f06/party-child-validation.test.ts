import {expect,it} from 'vitest';
import {createPartyLicenseSchema,updatePartyLicenseSchema,createPartyTaxRegistrationSchema,updatePartyTaxRegistrationSchema,createPartyDocumentSchema,updatePartyDocumentSchema} from '@/features/master-data/parties/party-schemas';
const cases=[
 {name:'licence',create:createPartyLicenseSchema,update:updatePartyLicenseSchema,payload:{party_id:1,license_type_id:1,license_number:'Synthetic',license_status_id:1},start:'issue_date',end:'expiry_date'},
 {name:'tax',create:createPartyTaxRegistrationSchema,update:updatePartyTaxRegistrationSchema,payload:{party_id:1,tax_type_id:1,tax_registration_number:'Synthetic',tax_status_id:1},start:'effective_from',end:'effective_to'},
 {name:'document',create:createPartyDocumentSchema,update:updatePartyDocumentSchema,payload:{party_id:1,document_type_id:1,document_title:'Synthetic',document_status_id:1},start:'issue_date',end:'expiry_date'},
] as const;
for(const c of cases){
 it(`${c.name} creation and update reject reverse and impossible dates`,()=>{
  for(const schema of [c.create,c.update])for(const dates of [{[c.start]:'2026-12-31',[c.end]:'2026-01-01'},{[c.start]:'2026-02-30'},{[c.start]:'01/02/2026'}])expect(schema.safeParse({...c.payload,...dates,...(schema===c.update?{id:8}:{})}).success).toBe(false);
 });
 it(`${c.name} accepts same-day and cross-year dates, keeps omitted update flags absent`,()=>{
  for(const dates of [{[c.start]:'2026-12-31',[c.end]:'2027-01-01'},{[c.start]:'2026-10-04',[c.end]:'2026-10-04'}]){
   expect(c.create.safeParse({...c.payload,...dates}).success).toBe(true);const update=c.update.parse({...c.payload,id:8,...dates});expect(update).not.toHaveProperty('is_active');
  }
 });
}
it('zero notice is preserved, negative/fractional notice rejected',()=>{
 for(const c of [cases[0],cases[2]]){expect(c.create.parse({...c.payload,renewal_notice_days:0})).toHaveProperty('renewal_notice_days',0);for(const value of [-1,1.5])expect(c.create.safeParse({...c.payload,renewal_notice_days:value}).success).toBe(false);}
});
it('required expiry and issuing-region parent are checked before dispatch',()=>{
 expect(createPartyDocumentSchema.safeParse({...cases[2].payload,expiry_required:true}).success).toBe(false);
 expect(createPartyLicenseSchema.safeParse({...cases[0].payload,issuing_emirate_id:8,issuing_country_id:null}).success).toBe(false);
});
it('document update omission retains stored expiry while an explicit clear is rejected',()=>{
 const input={...cases[2].payload,id:8,expiry_required:true};expect(updatePartyDocumentSchema.parse(input)).not.toHaveProperty('expiry_date');
 expect(updatePartyDocumentSchema.safeParse({...input,expiry_date:null}).success).toBe(false);
 expect(createPartyDocumentSchema.safeParse({...cases[2].payload,expiry_required:true}).success).toBe(false);
});
