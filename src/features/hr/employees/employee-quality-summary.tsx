'use client';
import {employeeFoundationIssues}from '@/lib/hr/employee-foundation';
import type{EmployeeListRow}from '@/server/actions/hr/employees';

/** Labels only: never persist/repair facts, expose a medical value or invent a
 * complete HR readiness score. Existing section navigation handles each link. */
export function EmployeeQualitySummary({employee,onProfile}:{employee:EmployeeListRow;onProfile:(field:string)=>void}){
 const issues=employeeFoundationIssues(employee,true);
 if(!issues.length)return null;
 return <div className="space-y-2 text-sm" role="status">
  <p>Employee facts to review. This is not a payroll, compliance or onboarding decision.</p>
  <ul>{issues.map(issue=><li key={`${issue.code}:${issue.field}`}><button type="button" className="underline" onClick={()=>onProfile(issue.field)}>{issue.label}: {issue.code==='legacy-category'?'legacy unassigned value; unrelated edits remain allowed':issue.code==='invalid-chronology'?'date order needs review':'required fact is missing'}</button></li>)}</ul>
  <p>Review the original evidence; no correction or identity mapping has been applied.</p>
 </div>;
}
