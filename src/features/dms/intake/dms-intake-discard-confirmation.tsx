"use client";

import {useId,useRef} from "react";
import {AlertTriangle,XCircle} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Popover,PopoverContent,PopoverTrigger} from "@/components/ui/popover";

type Props={
  placement:"header"|"footer";
  open:boolean;
  onOpenChange:(open:boolean)=>void;
  disabled:boolean;
  pending:boolean;
  hasDraftDocument:boolean;
  canSaveDraft:boolean;
  reason:string;
  onReasonChange:(reason:string)=>void;
  onConfirm:()=>void;
};

/** Each entry point owns its anchor; the page controls which one is open. */
export function DmsIntakeDiscardConfirmation({placement,open,onOpenChange,disabled,pending,hasDraftDocument,canSaveDraft,reason,onReasonChange,onConfirm}:Props){
  const id=useId();
  const cancelRef=useRef<HTMLButtonElement>(null);
  return <Popover open={open} onOpenChange={next=>{if(!pending)onOpenChange(next);}}>
    <PopoverTrigger asChild>
      <Button type="button" variant={placement==="header"?"ghost":"outline"} size="sm" disabled={disabled||pending}
        className="text-destructive border-destructive/30 hover:bg-destructive/5">
        <XCircle className="h-3.5 w-3.5 mr-1.5"/>{placement==="header"?"Discard":"Discard Intake"}
      </Button>
    </PopoverTrigger>
    <PopoverContent side={placement==="header"?"bottom":"top"} align={placement==="header"?"end":"start"}
      sideOffset={8} collisionPadding={12} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
      className="w-80 max-w-[calc(100vw-24px)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto space-y-3 p-3"
      onOpenAutoFocus={event=>{event.preventDefault();cancelRef.current?.focus();}}
      onEscapeKeyDown={event=>{if(pending)event.preventDefault();}}
      onInteractOutside={event=>{if(pending)event.preventDefault();}}>
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle aria-hidden="true" className="h-4 w-4 text-destructive"/>Discard this intake?</h3>
      <p id={`${id}-description`} className="text-xs text-muted-foreground">
        It will leave the active Inbox. {hasDraftDocument?"Its draft will be archived; files and history are kept.":"No document will be created. Upload history is kept, and you can upload the file again."}
        {canSaveDraft&&" To review it later, choose Cancel, then Save Draft."}
      </p>
      <div className="space-y-1">
        <label htmlFor={`${id}-reason`} className="text-xs font-medium">Reason (optional)</label>
        <input id={`${id}-reason`} type="text" maxLength={500} value={reason} disabled={pending}
          onChange={event=>onReasonChange(event.target.value)}
          className="h-8 w-full min-w-0 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button ref={cancelRef} type="button" size="sm" variant="outline" disabled={pending} onClick={()=>onOpenChange(false)}>Cancel</Button>
        <Button type="button" size="sm" variant="destructive" disabled={disabled||pending} onClick={onConfirm}>{pending?"Discarding…":"Confirm Discard"}</Button>
      </div>
    </PopoverContent>
  </Popover>;
}
