"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { getHrDocBrowserDocuments, type HrDocBrowserDocument, type HrDocBrowserEmployee } from "@/server/actions/hr/doc-browser";
import { HrDocBrowserNavigator } from "./hr-doc-browser-navigator";
import { HrDocBrowserDocList } from "./hr-doc-browser-doc-list";
import { HrDocBrowserPreview } from "./hr-doc-browser-preview";
import { HrDocBrowserResizeHandle } from "./hr-doc-browser-resize-handle";
import type { BrowserEntitySelection } from "./hr-doc-browser-types";

const DEFAULT_WIDTHS={nav:280,list:360};
const limits={nav:[200,420],list:[260,560]} as const;
export function HrDocBrowserPageClient({employees}:{employees:HrDocBrowserEmployee[]}){
 const [selection,setSelection]=useState<BrowserEntitySelection|null>(null);
 const [documents,setDocuments]=useState<HrDocBrowserDocument[]>([]);
 const [selectedDocIndex,setSelectedDocIndex]=useState<number|null>(null);
 const [loading,setLoading]=useState(false),[failed,setFailed]=useState(false);
 const [widths,setWidths]=usePersistentUiState('hr-document-browser:widths:v2',DEFAULT_WIDTHS);
 const latest=useRef(0),dragCleanup=useRef<(()=>void)|null>(null);
 useEffect(()=>()=>{latest.current++;dragCleanup.current?.();},[]);
 const resize=useCallback((column:keyof typeof DEFAULT_WIDTHS,value:number)=>{
  const[min,max]=limits[column];setWidths(current=>({...current,[column]:Math.min(max,Math.max(min,value))}));
 },[setWidths]);
 const startDrag=(column:keyof typeof DEFAULT_WIDTHS,event:MouseEvent<HTMLDivElement>)=>{
  event.preventDefault();dragCleanup.current?.();const x=event.clientX,w=widths[column];
  const move=(e:globalThis.MouseEvent)=>resize(column,w+e.clientX-x);
  const stop=()=>{document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',stop);dragCleanup.current=null;};
  dragCleanup.current=stop;document.addEventListener('mousemove',move);document.addEventListener('mouseup',stop);
 };
 const handleSelectEntity=useCallback(async(entity:BrowserEntitySelection)=>{
  const request=++latest.current;setSelection(entity);setSelectedDocIndex(null);setDocuments([]);setFailed(false);setLoading(true);
  try{const result=await getHrDocBrowserDocuments(entity.type,entity.id);if(request!==latest.current)return;
   if(!result.success||!result.data){setFailed(true);return;}setDocuments(result.data);setSelectedDocIndex(result.data.length?0:null);
  }catch{if(request===latest.current)setFailed(true);}finally{if(request===latest.current)setLoading(false);}
 },[]);
 const selectedDoc=selectedDocIndex!==null?documents[selectedDocIndex]??null:null;
 const style={'--hr-nav-width':widths.nav+'px','--hr-list-width':widths.list+'px'} as CSSProperties;
 return <div className="min-w-0 space-y-3">
  <div className="hidden xl:flex items-center justify-end"><Button variant="outline" size="sm" onClick={()=>setWidths(DEFAULT_WIDTHS)}>Reset panel widths</Button></div>
  <div style={style} className="grid min-w-0 gap-3 xl:gap-0 xl:h-[calc(100dvh-240px)] xl:min-h-[480px] xl:grid-cols-[minmax(200px,var(--hr-nav-width))_6px_minmax(260px,var(--hr-list-width))_6px_minmax(240px,1fr)] rounded-sm border bg-background">
   <section aria-label="Employees and dependents" className="min-w-0 h-80 xl:h-full overflow-hidden"><HrDocBrowserNavigator employees={employees} selection={selection} onSelect={entity=>void handleSelectEntity(entity)}/></section>
   <HrDocBrowserResizeHandle label="Employee panel width" value={widths.nav} min={200} max={420} onResize={value=>resize('nav',value)} onMouseDown={event=>startDrag('nav',event)}/>
   <section aria-label="Selected employee documents" className="min-w-0 h-96 xl:h-full overflow-auto" aria-busy={loading}>
    {failed?<div role="alert" className="m-3 rounded-sm border border-destructive p-3 text-sm">Documents could not be loaded. No previous employee files are shown. <Button variant="outline" onClick={()=>selection&&void handleSelectEntity(selection)}>Retry documents</Button></div>:<HrDocBrowserDocList entity={selection} documents={documents} isLoading={loading} selectedIndex={selectedDocIndex} onSelect={setSelectedDocIndex}/>}
   </section>
   <HrDocBrowserResizeHandle label="Documents panel width" value={widths.list} min={260} max={560} onResize={value=>resize('list',value)} onMouseDown={event=>startDrag('list',event)}/>
   <section aria-label="Document preview" className="min-w-0 h-96 xl:h-full overflow-auto"><HrDocBrowserPreview entity={selection} document={selectedDoc}/></section>
  </div>
 </div>;
}
