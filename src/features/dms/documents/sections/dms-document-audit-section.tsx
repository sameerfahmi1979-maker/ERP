"use client";
import {useState} from "react";
import {DmsLoadError} from "@/features/dms/dms-load-error";
import {readDmsSection} from "../section-read";
import {useDmsSectionQuery} from "../section-activity";
import {Button} from "@/components/ui/button";
import {format,parseISO} from "date-fns";

const labels:Record<string,string>={file_download_response_prepared:"Download response prepared",file_preview_response_prepared:"Preview response prepared",
 file_downloaded:"Legacy download event",file_previewed:"Legacy preview event",archived:"Document archived",unarchived:"Document restored"};
export function DmsDocumentAuditSection({documentId}:{documentId:number|null}) {
 const [page,setPage]=useState(1),[filter,setFilter]=useState<"all"|"downloads">("all");
 const read=useDmsSectionQuery({queryKey:["dms","document-events-page",documentId,page,filter],enabled:!!documentId,staleTime:0,
  queryFn:async({signal})=>{const r=await readDmsSection("getDmsDocumentHistoryPage",[documentId!,page,filter],signal);if(!r.success||!r.data)throw Error("History unavailable");return r.data;}});
 if(!documentId)return <p>Save the document to see history.</p>;
 const data=read.data;
 return <section aria-label="History and downloads" className="space-y-3">
  <div className="flex flex-wrap items-center gap-2">
   <label className="text-sm">Show <select aria-label="History type" value={filter} onChange={e=>{setFilter(e.target.value as "all"|"downloads");setPage(1);}} className="rounded border border-input bg-background text-foreground p-2">
    <option value="all">All lifecycle events</option><option value="downloads">Downloads & previews</option></select></label>
   <Button type="button" size="sm" variant="outline" onClick={()=>void read.refetch()}>Refresh history</Button>
  </div>
  <p className="text-xs text-muted-foreground">A response receipt records server preparation, not proof that a person received, read or saved the file. Already downloaded copies cannot be revoked. Legacy events retain their original evidence level.</p>
  {read.isError?<DmsLoadError subject="document history" pending={read.isFetching} retry={()=>read.refetch()}/>:
   read.isFetching||!data?<p role="status">Loading verified history…</p>:<>
    {data.rows.length===0&&<p>{data.totalCount===0?"No matching history recorded.":"No events on this page. Return to an earlier page."}</p>}
    <ol className="space-y-3">{data.rows.map(event=>{const m=event.metadata_json as Record<string,unknown>;return <li key={event.id} className="border-l-2 border-border pl-3 text-sm space-y-1">
     <h4 className="font-medium">{labels[event.event_type]??event.event_type.replaceAll("_"," ")}</h4>
     {event.description&&<p>{event.description}</p>}
     <p className="text-xs text-muted-foreground">{format(parseISO(event.performed_at),"dd MMM yyyy HH:mm:ss")} · {event.performer?.display_name??"Actor label unavailable"} · Event #{event.id}</p>
     {typeof m.file_id==="number"&&<p className="text-xs">File #{m.file_id}{typeof m.version_id==="number"?` · Version #${m.version_id}`:""}{typeof m.bytes==="number"?` · ${m.bytes} bytes`:""}{m.historical===true?" · Historical version":""}</p>}
    </li>;})}</ol>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{data.totalCount} events · Page {page} of {Math.max(1,Math.ceil(data.totalCount/data.pageSize))}</span>
     <div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous history</Button>
      <Button type="button" size="sm" variant="outline" disabled={page*data.pageSize>=data.totalCount} onClick={()=>setPage(page+1)}>Next history</Button></div></div>
   </>}
 </section>;
}
