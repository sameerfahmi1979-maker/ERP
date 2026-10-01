"use client";

import type { ReviewQueueFilters } from "@/server/actions/dms/review-queue";
import { EditFilters, type FilterValues, type ListFilter } from "@/components/erp/table/list-controls";

const definitions: ListFilter[] = [
  { id: "status", label: "Status", type: "multi-select", options: [
    {value:"open",label:"Open"},{value:"assigned",label:"Assigned"},{value:"in_review",label:"In review"},{value:"resolved",label:"Resolved"},{value:"dismissed",label:"Dismissed"},
  ] },
  { id: "reviewType", label: "Review type", type: "multi-select", options: [
    {value:"intake_classification_review",label:"Intake classification"},{value:"intake_metadata_review",label:"Intake metadata"},{value:"ai_analysis_metadata_review",label:"AI analysis"},
    {value:"ocr_failure_review",label:"OCR failure"},{value:"semantic_index_review",label:"Semantic index"},{value:"ai_job_failure_review",label:"AI job failure"},{value:"metadata_definition_suggestions_review",label:"AI metadata suggestions"},
  ] },
  { id:"priority",label:"Priority",type:"multi-select",options:[{value:"urgent",label:"Urgent"},{value:"high",label:"High"},{value:"normal",label:"Normal"},{value:"low",label:"Low"}] },
  { id:"assignedTo",label:"Assigned to",type:"select",options:[{value:"me",label:"Me"},{value:"unassigned",label:"Unassigned"}] },
];
export function DmsReviewQueueFilters({filters,onChange,isLoading}: { filters:ReviewQueueFilters;onChange:(filters:ReviewQueueFilters)=>void;isLoading:boolean }) {
  const values:FilterValues={status:filters.status?.join(",")??"",reviewType:filters.reviewType?.join(",")??"",priority:filters.priority?.join(",")??"",assignedTo:typeof filters.assignedTo==='string'?filters.assignedTo:""};
  return <div aria-busy={isLoading} className="flex flex-wrap gap-2">
    <EditFilters definitions={definitions} values={values} scopeLabel="These criteria are applied by the server to your permitted review items, not just the current page."
      onApply={next=>onChange({...filters,status:next.status?next.status.split(","):undefined,reviewType:next.reviewType?next.reviewType.split(","):undefined,priority:next.priority?next.priority.split(","):undefined,assignedTo:next.assignedTo==='me'||next.assignedTo==='unassigned'?next.assignedTo:undefined})}/>
  </div>;
}
