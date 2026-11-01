"use client";
import {reportTemplateSelectionIdentity} from '@/lib/reads/report-template-selection-schema';
import type {AuthContext} from '@/lib/rbac/check';
import type {EmployeeOutputCatalogItem} from '@/server/actions/output/output-catalog';
import type {OfficialDocumentLanguage} from '@/lib/official-documents/types';
import {EmploymentLetterWorkbench} from './employment-letter-workbench';
interface Props {
 authContext:AuthContext;employeeId:number;item:EmployeeOutputCatalogItem|null;open:boolean;onOpenChange:(open:boolean)=>void;
 onIssue?:(language:OfficialDocumentLanguage,inputs:Record<string,string>,templateId?:number)=>Promise<void>;
 isIssuing?:boolean;issueFeedback?:{kind:string;title:string;message:string}|null;
}
/** Every fixed HR document uses one preparation surface; durable issuance stays in the employee workspace. */
export function OfficialDraftPreviewDialog(props:Props) {
 return props.open&&props.item?<EmploymentLetterWorkbench key={JSON.stringify([reportTemplateSelectionIdentity(props.authContext),props.employeeId,props.item.outputCode])} {...props} item={props.item}/>:null;
}
