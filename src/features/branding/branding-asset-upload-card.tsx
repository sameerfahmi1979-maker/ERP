"use client";

import {useEffect,useLayoutEffect,useRef,useState,useTransition} from "react";
import {useReadCacheOwner} from '@/components/layout/read-cache-boundary';
import {z} from 'zod';
import Image from "next/image";
import {toast} from "sonner";
import {Upload,Trash2,ImageOff} from "lucide-react";
import {Button} from "@/components/ui/button";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from "@/components/ui/alert-dialog";
import {uploadBrandingAsset,deactivateBrandingAsset} from "@/server/actions/branding/assets";
import type {BrandingAssetScope,BrandingAssetType} from "@/lib/branding";
import type {BrandingAssetSaveContract,BrandingAssetMutationResult} from "@/lib/branding/asset-save-contract";
import {MAX_BRANDING_FILE_SIZE_BYTES} from "@/lib/branding/constants";
import {useWorkspaceNavigationLock} from "@/hooks/use-workspace-navigation-lock";

export type BrandingAssetUploadView={
 id:number;workspaceRevision?:string;originalFilename?:string|null;mimeType?:string;fileSizeBytes?:number|null;
 versionNo:number;updatedAt:string;previewUrl?:string|null;
};
type Props={
 label:string;description:string;assetType:BrandingAssetType;scope?:BrandingAssetScope;
 appSettingsId?:number;brandingProfileId?:number;ownerCompanyId?:number|null;parentRevision?:string;
 asset:BrandingAssetUploadView|null;canUpload:boolean;required?:boolean;accept?:string;
 disabled?:boolean;
 disabledReason?:string;
 onChanged?:(receipt:NonNullable<BrandingAssetMutationResult["data"]>)=>void;
 onPendingChange?:(pending:boolean)=>boolean|void;
};
type Attempt=({kind:"upload";file:File}|{kind:"deactivate"})&{contract:BrandingAssetSaveContract;metadata:string;hadUnknown:boolean;confirmed?:boolean};
const assetReceipt=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),parent_revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
function formatBytes(bytes?:number|null){return !bytes?"—":bytes<1024?`${bytes} B`:bytes<1024*1024?`${(bytes/1024).toFixed(1)} KB`:`${(bytes/(1024*1024)).toFixed(1)} MB`;}
export function BrandingAssetUploadCard(props:Props){
 // Only ownership identity resets a session. A new version may be the result of
 // our lost response; it must not discard the retained file/request receipt.
 return <BrandingAssetUploadSession key={`${props.scope??"app"}:${props.appSettingsId??props.brandingProfileId}:${props.assetType}`} {...props}/>;
}
function BrandingAssetUploadSession({label,description,assetType,scope="app",appSettingsId,brandingProfileId,ownerCompanyId,parentRevision,asset,canUpload,disabled=false,disabledReason,required=false,accept="image/png,image/jpeg,image/webp",onChanged,onPendingChange}:Props){
 const [error,setError]=useState<string|null>(null),[confirmRemove,setConfirmRemove]=useState(false);
 const [pending,setPending]=useState<Attempt|null>(null),[confirmed,setConfirmed]=useState<{kind:Attempt['kind'];receipt:NonNullable<BrandingAssetMutationResult['data']>}|null>(null);
 const [isPending,startTransition]=useTransition();
 const flight=useRef(false),input=useRef<HTMLInputElement>(null);
 const owner=useReadCacheOwner(),activation=useRef<{live:boolean}|null>(null);
 useLayoutEffect(()=>{const token={live:true};activation.current=token;return()=>{token.live=false;};},[owner]);
 const validRevision=!!parentRevision&&(!asset||!!asset.workspaceRevision);
 const awaitingRefresh=!!confirmed&&(parentRevision!==confirmed.receipt.parent_revision||
  (confirmed.kind==='upload'?asset?.id!==confirmed.receipt.id||asset?.workspaceRevision!==confirmed.receipt.revision:asset!==null));
 // A receipt protects the interval until its authoritative revision is seen.
 // Retire it once reconciled: a later, legitimate settings save must not make
 // an already-completed asset operation appear to be waiting for refresh again.
 if(confirmed&&!awaitingRefresh)setConfirmed(null);
 const enabled=canUpload&&!disabled&&validRevision&&!awaitingRefresh&&!pending&&!isPending;
 useWorkspaceNavigationLock(!!pending);
 useEffect(()=>{
  if(!pending)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
  window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);
 },[pending]);
 function run(attempt:Attempt){
  const token=activation.current,current=()=>!!token?.live&&activation.current===token&&owner?.isLive()!==false;
  if(flight.current||!canUpload||attempt.confirmed||!current())return;
  try{if(onPendingChange?.(true)===false)return;}catch{if(current())setError('Asset change could not be started. Retry when this view is ready.');return;}
  if(!current())return;
  flight.current=true;setPending(attempt);setConfirmed(null);setError(null);
  if(attempt.kind==="deactivate")setConfirmRemove(false);
  startTransition(async()=>{
   try{
    if(!current())return;
    let result:BrandingAssetMutationResult;
    if(attempt.kind==="upload"){
     const body=new FormData();body.append("file",attempt.file);body.append("contract",JSON.stringify(attempt.contract));
     body.append("metadata",attempt.metadata);
     result=await uploadBrandingAsset(body);
    }else result=await deactivateBrandingAsset(attempt.contract.assetId!,attempt.contract);
    if(!current())return;
    if(!result||typeof result.success!=='boolean'){attempt.hadUnknown=true;setError('Asset save response incomplete. Retry the unchanged operation.');return;}
    if(!result.success){
     const earlier=attempt.hadUnknown;attempt.hadUnknown ||= result.uncertain===true;
     if(!attempt.hadUnknown){setPending(null);try{onPendingChange?.(false);}catch{/* A known rejection remains known. */}}
     setError(earlier?'The earlier asset save is still unconfirmed. Retry the unchanged operation.':result.error??"Asset save unconfirmed. Retry the unchanged operation.");return;
    }
    const parsed=assetReceipt.safeParse(result.data);
    if(!parsed.success||(attempt.kind==='deactivate'&&parsed.data.id!==attempt.contract.assetId)){attempt.hadUnknown=true;setError('Asset save response incomplete. Retry the unchanged operation.');return;}
    attempt.confirmed=true;
    setPending(null);setConfirmed(parsed.data.changed===false?null:{kind:attempt.kind,receipt:parsed.data});setConfirmRemove(false);
    let failed=false;
    try{onPendingChange?.(false);}catch{failed=true;}
    if(current())try{toast.success(parsed.data.changed===false?"No asset change was needed":attempt.kind==="upload"?`${label} uploaded`:`${label} deactivated`);}catch{failed=true;}
    if(current())try{onChanged?.(parsed.data);}catch{failed=true;}
    if(current()&&failed)setError('Saved, but the current asset display could not be refreshed. Reopen branding to refresh it.');
   }catch{if(current()){attempt.hadUnknown=true;setError(attempt.confirmed?'Saved, but the asset display could not be refreshed. Reopen branding.':"Asset save unconfirmed. Retry the same operation; the selected file remains in memory.");}}
   finally{if(current())flight.current=false;}
  });
 }
 function newContract():BrandingAssetSaveContract{return {operationId:crypto.randomUUID(),assetId:asset?.id??null,revision:asset?.workspaceRevision??null,parentRevision:parentRevision!};}
 function metadata(){return JSON.stringify({assetScope:scope,assetType,...(scope==='app'?{appSettingsId}:{brandingProfileId,ownerCompanyId:ownerCompanyId??null})});}
 function choose(file:File){
  if(!enabled||flight.current)return;
  if(!file.size||file.size>MAX_BRANDING_FILE_SIZE_BYTES){setError("Choose a non-empty image no larger than 10 MB.");return;}
  if(!["image/png","image/jpeg","image/jpg","image/webp"].includes(file.type)){setError("Choose PNG, JPEG or WebP. Convert SVG and ICO to PNG first.");return;}
  run({kind:"upload",file,contract:newContract(),metadata:metadata(),hadUnknown:false});
 }
 const preview=asset?.previewUrl;
 return <div aria-busy={isPending} className="rounded-sm border border-border bg-card p-4 flex flex-col gap-3">
  <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{label}{required&&<span className="text-destructive ml-1">*</span>}</p><p className="text-xs text-muted-foreground mt-0.5">{description}</p></div>{required&&!asset&&<span className="text-xs text-amber-800 dark:text-amber-200">Missing</span>}</div>
  <div className="relative h-28 flex items-center justify-center rounded-sm border border-dashed border-border bg-muted/20 overflow-hidden">
   {preview?<Image src={preview} alt={label} fill unoptimized className="object-contain p-2"/>:<div className="flex flex-col items-center gap-1 text-muted-foreground"><ImageOff className="h-5 w-5"/><span className="text-xs">{asset?"Preview unavailable":"No current asset"}</span></div>}
  </div>
  {asset?<div className="text-xs text-muted-foreground"><p className="truncate">{asset.originalFilename??"Uploaded file"}</p><p>{formatBytes(asset.fileSizeBytes)} · v{asset.versionNo} · {new Date(asset.updatedAt).toLocaleDateString()}</p></div>:<p className="text-xs text-muted-foreground">PNG, JPEG or WebP; verified and stored as a clean PNG. Prior versions remain in history.</p>}
  <div className="flex gap-2 mt-auto">
   <input ref={input} type="file" aria-label={`Choose ${label} file`} accept={accept} className="hidden" disabled={!enabled} onChange={event=>{const file=event.target.files?.[0];if(file)choose(file);event.target.value="";}}/>
   <Button type="button" size="sm" variant="outline" className="gap-1.5 flex-1" disabled={!enabled} aria-label={`${asset?"Replace":"Upload"} ${label}`} onClick={()=>input.current?.click()}><Upload className="h-3.5 w-3.5"/>{asset?"Replace":"Upload"}</Button>
   {asset&&canUpload&&<Button type="button" size="sm" variant="ghost" disabled={!enabled} aria-label={`Deactivate ${label}`} onClick={()=>setConfirmRemove(true)}><Trash2 className="h-3.5 w-3.5"/></Button>}
  </div>
  {isPending&&<p role="status" className="text-sm">Saving asset…</p>}
  {awaitingRefresh&&<p role="status" className="text-sm">Saved. Refreshing the current asset; reopen this profile if the preview does not update.</p>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {pending&&!isPending&&<Button type="button" variant="outline" onClick={()=>run(pending)}>Retry unchanged asset operation</Button>}
  {!validRevision&&canUpload&&<p role="alert" className="text-sm">Reopen branding to load its current version before changing an asset.</p>}
  {!canUpload&&<p className="text-xs text-muted-foreground">Changes require upload and management permission for this branding scope. Stamp/signature changes also require signing permission.</p>}
  {canUpload&&disabled&&<p className="text-xs text-muted-foreground">{disabledReason??"Finish the current operation before changing another asset."}</p>}
  <AlertDialog open={confirmRemove} onOpenChange={value=>{if(!isPending&&!pending)setConfirmRemove(value);}}>
   <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Deactivate {label}?</AlertDialogTitle><AlertDialogDescription>The current asset will stop being used for new outputs. Existing issued documents and asset history remain unchanged. Previously issued signed links expire according to their original lifetime.</AlertDialogDescription></AlertDialogHeader>
    <AlertDialogFooter><AlertDialogCancel disabled={isPending||!!pending}>Keep asset</AlertDialogCancel><AlertDialogAction disabled={isPending||!!pending} onClick={event=>{event.preventDefault();if(enabled&&asset)run({kind:"deactivate",contract:newContract(),metadata:metadata(),hadUnknown:false});}}>Deactivate</AlertDialogAction></AlertDialogFooter>
   </AlertDialogContent>
  </AlertDialog>
 </div>;
}


