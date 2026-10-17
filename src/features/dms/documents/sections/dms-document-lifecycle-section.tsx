"use client";
import {useDmsSectionQuery} from "../section-activity";
import {readDmsSection} from "../section-read";
import {DmsLoadError} from "@/features/dms/dms-load-error";
import {DmsLifecycleNavigation} from "../dms-lifecycle-navigation";
import {Button} from "@/components/ui/button";

export function DmsDocumentLifecycleSection({documentId,onNavigate}:{documentId:number|null;onNavigate:(section:string)=>void}) {
 const read=useDmsSectionQuery({queryKey:["dms","lifecycle",documentId],enabled:!!documentId,staleTime:0,
  queryFn:async({signal})=>{const r=await readDmsSection("getDmsDocumentLifecycle",[documentId!],signal);if(!r.success||!r.data)throw Error("Lifecycle unavailable");return r.data;}});
 if(!documentId)return <p>Save the document to follow its lifecycle.</p>;
 if(read.isError)return <DmsLoadError subject="document lifecycle" retry={()=>read.refetch()} pending={read.isFetching}/>;
 if(!read.data||read.isFetching)return <p role="status">Checking the current lifecycle…</p>;
 const d=read.data;
 return <section aria-label="Document lifecycle" className="space-y-4 text-sm">
  <div className="border-l-2 border-primary pl-4 space-y-2">
   <h3 className="font-semibold">{d.stage}</h3><p>{d.next}</p><p className="text-muted-foreground">Next owner: {d.owner}</p>
   {d.blocker&&<p role="note">{d.blocker}</p>}
   <p className="text-xs text-muted-foreground">Current version: {d.currentVersionId??"Not linked"} · Document: {d.status} · Approval: {d.approvalStatus??"Not submitted"}</p>
  </div>
  <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onClick={()=>onNavigate(d.section)}>Open next section</Button>
   <Button type="button" size="sm" variant="outline" onClick={()=>onNavigate("audit")}>History & downloads</Button>
   <Button type="button" size="sm" variant="outline" onClick={()=>void read.refetch()}>Refresh status</Button></div>
  <DmsLifecycleNavigation/>
  <p className="text-xs text-muted-foreground">Queue links do not grant access. Each screen checks your current permissions. An approval, renewal or archive preserves original files and recorded decisions; it is not permission to permanently dispose of them.</p>
 </section>;
}
