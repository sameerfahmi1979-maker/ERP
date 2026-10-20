import{roleRequirementValues,roleRequirementOpeningValues}from'@/lib/hr/role-requirement-contract';
import{operationalBlockValues,operationalBlockOpeningValues}from'@/lib/hr/operational-block-contract';
import{assetValues,assetOpeningValues,ppeValues,ppeOpeningValues,accommodationValues,accommodationOpeningValues}from '@/lib/hr/operation-item-contract';
import {proProcessValues,proProcessOpeningValues,hrActionValues,hrActionOpeningValues,performanceValues,performanceOpeningValues,disciplinaryValues,disciplinaryOpeningValues,approvalValues,approvalOpeningValues,eosCaseValues,eosCaseOpeningValues,assignmentValues,assignmentOpeningValues} from '@/lib/hr/child-save-contract';
export type HrRecordKind='pro-process'|'hr-action'|'performance'|'disciplinary'|'approval'|'eos-case'|'assignment'|'asset'|'ppe'|'accommodation'|'operational-block'|'role-requirement';
export type HrRecordField={name:string;label:string;type:'text'|'date'|'select'|'textarea'|'checkbox'|'number';min?:number;max?:number;step?:number;required?:boolean;nullable?:boolean;defaultValue?:string;maxLength?:number;options?:readonly string[]};
export const HR_RECORD_EDITORS={
 'role-requirement':{title:'Role Requirement',noun:'requirement',key:'f11-role-requirement-opening',form:'f11-role-requirement',schema:roleRequirementValues,openingSchema:roleRequirementOpeningValues,fields:[
  {name:'requirement_name',label:'Requirement Name',type:'text',required:true,maxLength:500},
  {name:'requirement_type',label:'Type',type:'select',required:true,defaultValue:'document',options:roleRequirementOpeningValues.shape.requirement_type.options},
  {name:'status',label:'Status',type:'select',required:true,defaultValue:'missing',options:roleRequirementOpeningValues.shape.status.options},
  {name:'expiry_date',label:'Expiry Date',type:'date',nullable:true},
  {name:'is_required',label:'Is Required',type:'checkbox',defaultValue:'true'},
 ]as readonly HrRecordField[]},
 'operational-block':{title:'Operational Block',noun:'block',key:'f11-operational-block-opening',form:'f11-operational-block',schema:operationalBlockValues,openingSchema:operationalBlockOpeningValues,fields:[
  {name:'block_type',label:'Block Type',type:'select',required:true,defaultValue:'operations',options:operationalBlockOpeningValues.shape.block_type.options},
  {name:'effective_from',label:'Effective From',type:'date',required:true},
  {name:'effective_to',label:'Effective To',type:'date',nullable:true},
  {name:'block_reason',label:'Block Reason',type:'textarea',required:true,maxLength:2000},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:2000},
 ]as readonly HrRecordField[]},
 asset:{title:'Asset',noun:'asset',key:'f11-asset-opening',form:'f11-asset',schema:assetValues,openingSchema:assetOpeningValues,fields:[
  {name:'asset_type',label:'Asset Type',type:'select',required:true,defaultValue:'other',options:assetOpeningValues.shape.asset_type.options},
  {name:'asset_reference',label:'Asset Reference',type:'text',nullable:true,maxLength:200},
  {name:'asset_description',label:'Description',type:'text',required:true,maxLength:1000},
  {name:'issued_date',label:'Issued Date',type:'date',required:true},
  {name:'return_due_date',label:'Return Due Date',type:'date',nullable:true},
  {name:'condition_on_issue',label:'Condition on Issue',type:'text',nullable:true,maxLength:500},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:2000},
 ]as readonly HrRecordField[]},
 ppe:{title:'PPE',noun:'PPE',key:'f11-ppe-opening',form:'f11-ppe',schema:ppeValues,openingSchema:ppeOpeningValues,fields:[
  {name:'ppe_item',label:'PPE Item',type:'text',required:true,maxLength:500},
  {name:'quantity',label:'Quantity',type:'number',required:true,defaultValue:'1',min:0.01,max:99999999.99,step:0.01},
  {name:'standard_or_size',label:'Standard / Size',type:'text',nullable:true,maxLength:200},
  {name:'issued_date',label:'Issued Date',type:'date',required:true},
  {name:'expiry_or_replacement_date',label:'Expiry / Replace Date',type:'date',nullable:true},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:2000},
 ]as readonly HrRecordField[]},
 accommodation:{title:'Accommodation',noun:'accommodation',key:'f11-accommodation-opening',form:'f11-accommodation',schema:accommodationValues,openingSchema:accommodationOpeningValues,fields:[
  {name:'accommodation_type',label:'Accommodation Type',type:'select',nullable:true,defaultValue:'company_camp',options:accommodationOpeningValues.shape.accommodation_type.unwrap().options},
  {name:'room_or_bed_no',label:'Room / Bed No.',type:'text',nullable:true,maxLength:100},
  {name:'accommodation_location',label:'Location',type:'text',nullable:true,maxLength:500},
  {name:'assigned_from',label:'Assigned From',type:'date',required:true},
  {name:'assigned_to',label:'Assigned To',type:'date',nullable:true},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:2000},
 ]as readonly HrRecordField[]},

 assignment:{title:'Assignment',noun:'assignment',key:'f11-assignment-opening',form:'f11-assignment',schema:assignmentValues,openingSchema:assignmentOpeningValues,fields:[
  {name:'assignment_type',label:'Assignment Type',type:'select',required:true,defaultValue:'primary',options:assignmentOpeningValues.shape.assignment_type.options},
  {name:'assignment_status',label:'Status',type:'select',required:true,defaultValue:'active',options:assignmentOpeningValues.shape.assignment_status.options},
  {name:'effective_from',label:'Effective From',type:'date',required:true},
  {name:'effective_to',label:'Effective To',type:'date',nullable:true},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:2000},
 ]as readonly HrRecordField[]},
 'eos-case':{title:'EOS Case',noun:'case',key:'f11-eos-opening',form:'f11-eos',schema:eosCaseValues,openingSchema:eosCaseOpeningValues,fields:[
  {name:'eos_type',label:'EOS Type',type:'select',required:true,defaultValue:'resignation',options:eosCaseValues.shape.eos_type.options},
  {name:'case_status',label:'Status',type:'select',defaultValue:'draft',options:eosCaseValues.shape.case_status.unwrap().options},
  {name:'notice_date',label:'Notice Date',type:'date',nullable:true},
  {name:'last_working_date',label:'Last Working Date',type:'date',nullable:true},
  {name:'reason',label:'Reason',type:'textarea',nullable:true,maxLength:5000},
 ]as readonly HrRecordField[]},
 approval:{title:'Approval Request',noun:'request',key:'f11-approval-opening',form:'f11-approval',schema:approvalValues,openingSchema:approvalOpeningValues,fields:[
  {name:'approval_type',label:'Type',type:'select',required:true,defaultValue:'hr_action',options:approvalValues.shape.approval_type.options},
  {name:'request_title',label:'Request Title',type:'text',required:true,maxLength:500},
 ]as readonly HrRecordField[]},
 disciplinary:{title:'Disciplinary Record',noun:'record',key:'f11-disciplinary-opening',form:'f11-disciplinary',schema:disciplinaryValues,openingSchema:disciplinaryOpeningValues,fields:[
  {name:'subject',label:'Subject',type:'text',required:true,maxLength:500},
  {name:'disciplinary_type',label:'Type',type:'select',required:true,defaultValue:'verbal_warning',options:disciplinaryValues.shape.disciplinary_type.options},
  {name:'record_date',label:'Record Date',type:'date',required:true},
  {name:'incident_date',label:'Incident Date',type:'date',nullable:true},
  {name:'severity',label:'Severity',type:'select',required:true,defaultValue:'medium',options:['low','medium','high','critical']},
  {name:'status',label:'Status',type:'select',required:true,defaultValue:'open',options:['open','under_review','closed','cancelled']},
  {name:'description',label:'Description',type:'textarea',nullable:true,maxLength:5000},
  {name:'action_taken',label:'Action Taken',type:'textarea',nullable:true,maxLength:5000},
  {name:'creates_operational_block',label:'Operational block flag',type:'checkbox',defaultValue:'false'},
 ]as readonly HrRecordField[]},
 performance:{title:'Performance Review',noun:'review',key:'f11-performance-opening',form:'f11-performance',schema:performanceValues,openingSchema:performanceOpeningValues,fields:[
  {name:'review_type',label:'Review Type',type:'select',required:true,defaultValue:'annual',options:performanceValues.shape.review_type.options},
  {name:'review_date',label:'Review Date',type:'date',required:true},
  {name:'rating',label:'Rating',type:'select',nullable:true,options:['excellent','good','satisfactory','needs_improvement','unsatisfactory']},
  {name:'status',label:'Status',type:'select',required:true,defaultValue:'draft',options:['draft','submitted','cancelled']},
  {name:'summary',label:'Summary',type:'textarea',nullable:true,maxLength:5000},
 ]as readonly HrRecordField[]},
 'pro-process':{title:'PRO Process',noun:'process',key:'f11-pro-opening',form:'f11-pro',schema:proProcessValues,openingSchema:proProcessOpeningValues,fields:[
  {name:'process_title',label:'Process Title',type:'text',required:true,maxLength:500},
  {name:'process_status',label:'Status',type:'select',required:true,defaultValue:'draft',options:proProcessValues.shape.process_status.unwrap().options},
  {name:'priority',label:'Priority',type:'select',required:true,defaultValue:'normal',options:['low','normal','high','urgent']},
  {name:'request_date',label:'Request Date',type:'date',required:true},
  {name:'target_date',label:'Target Date',type:'date',nullable:true},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:5000},
 ]as readonly HrRecordField[]},
 'hr-action':{title:'HR Action',noun:'action',key:'f11-action-opening',form:'f11-action',schema:hrActionValues,openingSchema:hrActionOpeningValues,fields:[
  {name:'action_title',label:'Action Title',type:'text',required:true,maxLength:500},
  {name:'action_type',label:'Type',type:'select',required:true,defaultValue:'general',options:hrActionValues.shape.action_type.unwrap().options},
  {name:'action_status',label:'Status',type:'select',required:true,defaultValue:'open',options:hrActionValues.shape.action_status.unwrap().options},
  {name:'action_date',label:'Action Date',type:'date',required:true},
  {name:'due_date',label:'Due Date',type:'date',nullable:true},
  {name:'notes',label:'Notes',type:'textarea',nullable:true,maxLength:5000},
 ]as readonly HrRecordField[]},
}as const;
export function hrRecordActionFields(kind:HrRecordKind,action:string):readonly HrRecordField[]|null{
 if(kind==='role-requirement'&&action==='waive')return[{name:'waiver_reason',label:'Waiver Reason',type:'textarea',required:true,maxLength:2000}];
 if(kind==='operational-block'&&action==='release')return[{name:'release_reason',label:'Release Reason',type:'textarea',required:true,maxLength:2000}];
 if(['asset','ppe'].includes(kind)&&action==='return')return[{name:'returned_date',label:'Return Date',type:'date',required:true}];
 if(kind==='accommodation'&&action==='end')return[{name:'assigned_to',label:'End Date',type:'date',required:true}];
 return null;
}
