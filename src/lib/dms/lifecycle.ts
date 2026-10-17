/** Presentation only: current database state, never an authorization grant. */
export type LifecycleSubject = {status:string; review_status:string; approval_status?:string|null; current_version_id?:number|null; is_archived:boolean; superseded_by_document_id?:number|null; owner_user_id:number|null};
export function documentLifecycle(d:LifecycleSubject) {
 const owner=d.owner_user_id ? `Document owner #${d.owner_user_id}` : "No document owner assigned";
 if(d.status==="superseded") return {stage:"Replaced",next:"Read historical content or open the permitted replacement in Expiry / Archive.",owner:"History retained",section:"expiry",blocker:d.superseded_by_document_id?null:"Replacement needs reconciliation; no link is inferred."};
 if(d.is_archived||d.status==="archived") return {stage:"Archived",next:"Review retained files and history; use the checked Restore action in Archive.",owner,section:"audit",blocker:"Not part of the active collection; retention is not permission to purge."};
 if(d.approval_status==="pending_approval") return {stage:"Awaiting approval",next:"Open Approvals to see the current stage and your permitted actions.",owner:"Assigned approval-stage reviewers",section:"approvals",blocker:"Publication waits for the configured independent decisions."};
 if(d.approval_status==="rejected"||d.status==="rejected") return {stage:"Changes requested",next:"Read the decision, correct the document, then resubmit through Approvals.",owner,section:"approvals",blocker:"A rejected submission cannot be treated as approved."};
 if(d.current_version_id===null) return {stage:"Needs original",next:"Attach a verified original in Versions / Files.",owner,section:"versions",blocker:"No current original version is linked."};
 if(d.status==="pending_review"||["pending","pending_review","needs_review"].includes(d.review_status)) return {stage:"Review needed",next:"Use Review Queue to review source data and proposed values before approval.",owner:"Authorized document reviewers",section:"ai",blocker:"AI suggestions are not accepted business data."};
 if(["active","approved","expired"].includes(d.status)||d.approval_status==="approved") return {stage:d.status==="expired"?"Expired":"Published",next:"Check expiry and renewal; historical files and decisions remain available.",owner,section:"expiry",blocker:d.status==="expired"?"The document has expired; review renewal requirements.":null};
 return {stage:"Preparation",next:"Check required metadata, original files and review requirements, then open Approvals.",owner,section:"overview",blocker:null};
}
