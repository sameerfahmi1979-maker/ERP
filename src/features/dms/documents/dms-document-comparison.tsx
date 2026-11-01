"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {ERPChildDialogForm} from "@/components/erp/erp-child-dialog-form";
import {Button} from "@/components/ui/button";
import {useReadCacheOwner} from "@/components/layout/read-cache-boundary";
import {compareSelectedDocuments} from "@/server/actions/dms/document-comparison";
type Source={documentId:number;versionId?:number};
type Result=Extract<Awaited<ReturnType<typeof compareSelectedDocuments>>,{success:true}>["data"];
export function DmsDocumentComparison({sources,onClose}:{sources:Source[];onClose:()=>void}){
 const owner=useReadCacheOwner();
 if(!owner?.identity||!owner.isLive())return null;
 return <ComparisonSession key={`${JSON.stringify(sources)}:${owner.identity.authUserId}:${owner.identity.scopeVersion}:${owner.generation}`} sources={sources} onClose={onClose}/>;
}
function ComparisonSession({sources,onClose}:{sources:Source[];onClose:()=>void}){
 const owner=useReadCacheOwner(),mounted=useRef(true),busyRef=useRef(false),[data,setData]=useState<Result|null>(null),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 const live=useCallback(()=>mounted.current&&!!owner?.isLive(),[owner]);
 const load=useCallback(async(recordFindings=false,expectedHashes?:string[])=>{
  if(busyRef.current)return;busyRef.current=true;setBusy(true);
  try{const r=await compareSelectedDocuments({sources,recordFindings,...(recordFindings&&expectedHashes?{expectedHashes}:{})});if(!live())return;
   if(r.success){setData(r.data);setError(null);}else{setData(null);setError(r.error);}
  }catch{if(live()){setData(null);setError("Selected sources are unavailable. No equivalence or missing text was inferred.");}}
  finally{busyRef.current=false;if(live())setBusy(false);}
 },[sources,live]);
 useEffect(()=>{mounted.current=true;let retired=false;busyRef.current=true;
  void compareSelectedDocuments({sources,recordFindings:false}).then(r=>{if(retired||!live())return;if(r.success){setData(r.data);setError(null);}else{setData(null);setError(r.error);}},()=>{if(!retired&&live()){setData(null);setError("Selected sources are unavailable. No equivalence or missing text was inferred.");}}).finally(()=>{if(!retired&&live()){busyRef.current=false;setBusy(false);}});
  return()=>{retired=true;mounted.current=false;};
 },[sources,live]);
 return <ERPChildDialogForm open onOpenChange={v=>{if(!v)onClose();}} title="Compare selected documents" mode="view" size="workbench" isSubmitting={busy} onCancel={onClose}>
  <div className="space-y-4 min-w-0">{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{busy&&<p role="status">Checking current source access…</p>}{data&&<>
   <p className="text-xs text-muted-foreground">{data.sourcePrecision} {data.sources.some(s=>!s.complete)&&"This comparison is partial; retained historical metadata and page positions may be unavailable."}</p>
   <div className="grid gap-3 sm:grid-cols-2">{data.sources.map((s,index)=><section key={index} className="border border-border rounded p-3 min-w-0 space-y-2"><a className="text-primary underline" href={`/dms/documents/record/${s.documentId}`}>{s.documentNo}</a><p className="text-xs text-muted-foreground">Selected retained version · {s.complete?"Recorded fields available":"Partial evidence"}</p>{s.passages.map(p=><details key={p.fileId}><summary className="text-sm break-words">{p.name}</summary><a className="text-xs text-primary underline" href={`/api/dms/file?fileId=${p.fileId}&disposition=inline`} target="_blank" rel="noopener noreferrer">Open permitted original</a><p className="text-xs whitespace-pre-wrap break-words" dir="auto">{p.text??"No retained text. No page position inferred."}</p></details>)}</section>)}</div>
   {data.pairs.map((pair,index)=><section key={index} className="space-y-2"><p className="text-sm font-medium">{pair.identity==="same_verified_subject"?"Same verified linked subject":"Subject relationship unresolved — similar names are not proof"}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th scope="col" className="text-start p-2">Field</th><th scope="col" className="text-start p-2">First source</th><th scope="col" className="text-start p-2">Other source</th><th scope="col" className="text-start p-2">Comparison</th></tr></thead><tbody>{pair.differences.map(d=><tr key={d.key} className="border-t border-border"><th scope="row" className="p-2 text-start font-normal">{d.key}</th><td className="p-2 whitespace-pre-wrap break-words" dir="auto">{d.left?.value??"Unknown"} {d.left?.currency??d.left?.unit}</td><td className="p-2 whitespace-pre-wrap break-words" dir="auto">{d.right?.value??"Unknown"} {d.right?.currency??d.right?.unit}</td><td className="p-2">{d.status.replaceAll("_"," ")}</td></tr>)}</tbody></table></div></section>)}
   {data.pairs.map((pair,index)=><details key={`passages-${index}`} className="rounded border border-border p-3 space-y-2"><summary className="text-sm font-medium">Retained text and clause excerpts — {pair.passageComparison.state.replaceAll("_"," ")}</summary><p className="text-xs text-muted-foreground">Literal retained excerpts only. Formatting can affect the comparison; missing or omitted text is not inferred. This does not establish legal equivalence.{!pair.passageComparison.complete&&" This comparison is partial or unavailable."}</p>{pair.passageComparison.changes.map((change,i)=><blockquote key={i} className="border-s-2 border-border ps-3 text-sm"><a className="text-primary underline text-xs" href={`/api/dms/file?fileId=${change.excerpt.fileId}&disposition=inline`} target="_blank" rel="noopener noreferrer">Open {change.source==="first"?"first":"second"} permitted original</a><p dir="auto" className="whitespace-pre-wrap break-words">{change.excerpt.text}</p></blockquote>)}</details>)}
   <p className="text-xs text-muted-foreground">Finding evaluation: {data.findingScope.replaceAll("_"," ")}. Only configured, supported facts with current authority are eligible; no authenticity, legal or medical decision is made.</p>
   {data.sources.length===2&&data.pairs[0]?.identity==="same_verified_subject"&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void load(true,data.sources.map(s=>s.sourceHash))}>Record supported consistency findings</Button>}
  </>}</div>
 </ERPChildDialogForm>;
}
