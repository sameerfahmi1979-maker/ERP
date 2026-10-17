// Actual browser/server shared validation. No database or browser claim.
import {expect,it} from 'vitest';
import {createBranchSchema,updateBranchSchema} from '@/features/branches/branch-schema';
import {createOrganizationSchema,updateOrganizationSchema} from '@/features/organizations/organization-schema';
import {administrationWriteError} from '@/lib/master-data/administration-validation';
it('branch creation retains every rendered extended field and false/zero',()=>{
 const fields={opening_date:'2026-01-01',closing_date:'2026-03-01',legal_branch_name:'Legal branch',trade_license_branch_ref:'Synthetic',emirate_id:1,city_id:2,area_zone_id:3,latitude:0,longitude:0,has_yard:false};
 expect(createBranchSchema.parse({owner_company_id:1,branch_code:'TEST',branch_name_en:'Synthetic',...fields})).toMatchObject(fields);
});
it('organization creation retains all extended screen values',()=>{
 const fields={trade_name:'Synthetic',main_activity:'Test',established_date:'2026-01-01',compliance_status:'under_review',office_address_line_1:'Line 1',office_address_line_2:'Line 2',office_emirate_id:1,office_city_id:2,vat_registered:false,icv_score:0};
 expect(createOrganizationSchema.parse({company_code:'TEST',legal_name_en:'Synthetic',...fields})).toMatchObject(fields);
});
it.each(['2026-02-30','2026-13-01','2026-2-1','0000-01-01','not a date'])('rejects impossible or ambiguous date %s',value=>{
 expect(updateBranchSchema.safeParse({id:1,opening_date:value}).success).toBe(false);
 expect(updateOrganizationSchema.safeParse({id:1,established_date:value}).success).toBe(false);
});
it.each(['2024-02-29','2026-01-01'])('accepts valid date %s',value=>{
 expect(updateBranchSchema.safeParse({id:1,opening_date:value}).success).toBe(true);
 expect(updateOrganizationSchema.safeParse({id:1,established_date:value}).success).toBe(true);
});
it('chronology has a linkable end-field error',()=>{
 const b=updateBranchSchema.safeParse({id:1,opening_date:'2026-02-01',closing_date:'2026-01-01'});expect(b.success).toBe(false);if(!b.success)expect(b.error.issues[0].path).toEqual(['closing_date']);
 const o=updateOrganizationSchema.safeParse({id:1,icv_issue_date:'2026-02-01',icv_expiry_date:'2026-01-01'});expect(o.success).toBe(false);if(!o.success)expect(o.error.issues[0].path).toEqual(['icv_expiry_date']);
});
it('omitted fields remain omitted and explicit null/false/zero remain intact',()=>{
 expect(updateBranchSchema.parse({id:1,has_workshop:false,latitude:0,closing_date:null})).toEqual({id:1,has_workshop:false,latitude:0,closing_date:null});
 expect(updateOrganizationSchema.parse({id:1,office_city_id:null,corporate_tax_registered:false})).toEqual({id:1,office_city_id:null,corporate_tax_registered:false});
});
it('unknown fields, blank names and invalid compliance state fail closed',()=>{
 expect(updateBranchSchema.safeParse({id:1,created_by:7}).success).toBe(false);
 expect(updateBranchSchema.safeParse({id:1,branch_name_en:'   '}).success).toBe(false);
 expect(updateOrganizationSchema.safeParse({id:1,legal_name_en:'   '}).success).toBe(false);
 expect(updateOrganizationSchema.safeParse({id:1,compliance_status:'invented'}).success).toBe(false);
});
it('database errors never echo a raw row or diagnostic',()=>{
 expect(administrationWriteError({code:'XX000',message:'PRIVATE_ROW'})).not.toContain('PRIVATE');
 expect(administrationWriteError({code:'23514',message:'PRIVATE_ROW'})).not.toContain('PRIVATE');
 expect(administrationWriteError({code:'23514',message:'Invalid administration date range'})).toBe('The end date cannot precede the start date.');
});
