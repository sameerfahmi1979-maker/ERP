"use client";
import {useWorkspace} from "@/hooks/use-workspace";
import {Button} from "@/components/ui/button";
/** Navigation is not a grant: each destination rechecks its own permissions. */
export function DmsLifecycleNavigation() {
 const {openTab}=useWorkspace();
 return <nav aria-label="Document lifecycle" className="flex flex-wrap gap-2">
  {[["Documents & lifecycle","/dms/documents"],["Upload Inbox","/dms/inbox"],["Review Queue","/dms/review-queue"],["Approval Queue","/dms/approvals"],["Expiry & Renewals","/dms/expiring"],["Archive","/dms/archive"]].map(([title,route])=>
   <Button key={route} type="button" size="sm" variant="outline" onClick={()=>openTab({title,route})}>{title}</Button>)}
 </nav>;
}
