import {describe, expect, it} from 'vitest';
import {normalizeDocumentDate} from '@/lib/hr/document-to-record/document-date';
import {buildEmployeeDraftFromDocuments} from '@/lib/hr/document-to-record/dms-employee-draft-mapper';
import {buildComplianceSuggestions} from '@/lib/hr/document-to-record/dms-compliance-suggestion-mapper';
import {matchDocumentNationality, type NationalityCountry} from '@/lib/hr/document-to-record/document-nationality';
import {employeeCreateSchema, employeeUpdateSchema} from '@/lib/hr/employee-contract';
import {documentEmployeeInputSchema} from '@/lib/hr/numbered-document-employee-contract';
import type {HrDmsDocumentSelection} from '@/lib/hr/document-to-record/types';

const nigeria: NationalityCountry = {id: 17, name_en:'Nigeria', name_ar:'نيجيريا', nationality_en:'Nigerian', nationality_ar:'نيجيري', country_code:'NG', iso3_code:'NGA'};
const countries = [nigeria, {...nigeria,id:18,name_en:'Niger',nationality_en:'Nigerien',country_code:'NE',iso3_code:'NER',name_ar:'النيجر',nationality_ar:'نيجري'}];
const source = (fields:Record<string,unknown>, id=1) => ({doc:{id,title:'Synthetic passport',document_no:`SYN-${id}`,document_type_code:'PASSPORT',issue_date:null,expiry_date:null} as HrDmsDocumentSelection,extractedFields:fields,fieldConfidence:{}});
describe('document calendar dates',()=>{
  it.each([['28/05/2025','2025-05-28'],['04/05/2025','2025-05-04'],['2025-05-28','2025-05-28'],['4-Apr-2023','2023-04-04'],['29 February 2024','2024-02-29'],['2025-05-28T23:00:00-04:00','2025-05-28']])('keeps the documented calendar day %s', (input,expected)=>expect(normalizeDocumentDate(input)).toBe(expected));
  it.each(['2025-02-29','31/04/2025','2025-02-30','05/28/2025','May 2025','bad','2025-05-28garbage','2025-05-28T00:00:00'])('rejects unsupported/impossible dates %s',input=>expect(normalizeDocumentDate(input)).toBeNull());
  it('uses the same day-first conversion for birth, issue and expiry',()=>{
    const docs=[source({date_of_birth:'04/05/1985',document_number:'SYN-P',issue_date:'04/05/2025',expiry_date:'03/05/2027'})];
    expect(buildEmployeeDraftFromDocuments(docs).date_of_birth?.userValue).toBe('1985-05-04');
    expect(buildComplianceSuggestions(docs,{PASSPORT:1})[0].fields).toMatchObject({issue_date:'2025-05-04',expiry_date:'2027-05-03'});
  });
});
describe('nationality resolved only from actual countries master',()=>{
  it.each(['Nigeria','Nigerian',' nigerian ','NG','NGA','نيجيريا','نيجيري'])('maps exact country/demonym/code %s',value=>expect(matchDocumentNationality(value,countries)?.id).toBe(17));
  it.each(['Nig','Ni','Nigerian unknown','%','NG,iso3_code.eq.NER',''])('does not guess or interpolate %s into a database query',value=>expect(matchDocumentNationality(value,countries)).toBeNull());
  it('rejects ambiguous master-data aliases',()=>expect(matchDocumentNationality('Nigerian',[nigeria,{...nigeria,id:99}])).toBeNull());
  it('retains nationality with source and resolved FK',()=>expect(buildEmployeeDraftFromDocuments([source({nationality:'Nigerian'})],countries)).toMatchObject({nationality_id:{userValue:'17',sourceDocumentId:1},nationalityEvidence:[{value:'Nigerian',matched:true}]}));
  it('equivalent country/demonym values are not conflicting IDs',()=>expect(buildEmployeeDraftFromDocuments([source({nationality:'Nigeria'}),source({nationality:'Nigerian'},2)],countries).conflicts).toEqual([]));
  it('two different resolved nationalities require review',()=>expect(buildEmployeeDraftFromDocuments([source({nationality:'Nigeria'}),source({nationality:'Niger'},2)],countries).conflicts[0]).toMatchObject({fieldName:'nationality_id',resolvedValue:null}));
  it('unmatched evidence remains visible without inventing a country',()=>expect(buildEmployeeDraftFromDocuments([source({nationality:'Unknown nationality'})],countries)).toMatchObject({nationality_id:null,nationalityEvidence:[{matched:false}]}));
  it('does not infer nationality from names/issuing country',()=>expect(buildEmployeeDraftFromDocuments([source({name:'Synthetic',issue_country:'Nigeria'})],countries).nationality_id).toBeNull());
});
describe('contact details are optional; identity/employment protections remain',()=>{
  const core={full_name_en:'Synthetic employee',gender:'male',date_of_birth:'1985-01-01',owner_company_id:1,employee_category_id:1,joining_date:'2026-01-01'};
  const input={...core,selectedDocumentIds:[1],totalDocumentsSelected:1,complianceRecords:[]};
  it('manual and document creation accept omitted/blank contacts',()=>{
    for(const contacts of [{},{mobile_number:'',personal_email:'',emergency_contact_name:'',emergency_contact_mobile:''},{mobile_number:'  ',emergency_contact_name:' ',emergency_contact_mobile:' '}]) {
      expect(employeeCreateSchema.parse({...core,...contacts}).mobile_number).toBe('');
      expect(documentEmployeeInputSchema.parse({...input,...contacts}).emergency_contact_mobile).toBe('');
    }
  });
  it('partial profile edits never silently clear existing contacts',()=>{const parsed=employeeUpdateSchema.parse({known_name:'Synthetic'});for(const field of ['mobile_number','emergency_contact_name','emergency_contact_mobile'])expect(parsed).not.toHaveProperty(field);});
  it('validates supplied email, without requiring email',()=>{expect(documentEmployeeInputSchema.safeParse({...input,personal_email:'bad'}).success).toBe(false);expect(documentEmployeeInputSchema.safeParse({...input,personal_email:'synthetic@example.invalid'}).success).toBe(true);});
  it('does not call missing mobile a missing required document fact',()=>expect(buildEmployeeDraftFromDocuments([source({full_name:'Synthetic'})]).missingRequiredFields).not.toContain('mobile_number'));
});
