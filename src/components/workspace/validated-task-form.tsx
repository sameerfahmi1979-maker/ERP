"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { collectWorkspaceFieldIssues, resolveWorkspaceFieldIssues, type WorkspaceFieldIssue } from "@/lib/workspace/form-validation";
import { FormErrorSummary, useInlineFieldFeedback } from "./form-feedback";
import {WORKSPACE_FIELD_ERRORS_EVENT,type WorkspaceFieldErrors} from "@/lib/workspace/field-errors";

/** Inline child tasks reuse the same value-free validation as workspace/dialog forms. */
export function ValidatedTaskForm({ children, className, onSubmit, id }: {
  id?: string;
  children: ReactNode;
  className?: string;
  onSubmit: (data: FormData) => Promise<unknown>;
}) {
  const flight = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  useInlineFieldFeedback(issues);
  useEffect(()=>{
    const form=formRef.current;
    const handler=(event:Event)=>{
      if(!form||event.target!==form)return;
      const next=resolveWorkspaceFieldIssues(form,(event as CustomEvent<WorkspaceFieldErrors>).detail);
      setIssues(next);
    };
    form?.addEventListener(WORKSPACE_FIELD_ERRORS_EVENT,handler);
    return ()=>form?.removeEventListener(WORKSPACE_FIELD_ERRORS_EVENT,handler);
  },[]);
  useEffect(()=>{if(!pending&&issues[0]?.control?.isConnected)issues[0].control.focus();},[pending,issues]);
  return <form id={id} ref={formRef} noValidate aria-busy={pending} className={className}
    onChangeCapture={event => { if (issues.length) setIssues(collectWorkspaceFieldIssues(event.currentTarget)); }}
    onSubmit={async event => {
      event.preventDefault();
      if (flight.current) return;
      const invalid = collectWorkspaceFieldIssues(event.currentTarget);
      setIssues(invalid);
      if (invalid.length) { invalid[0].control?.focus(); return; }
      const values = new FormData(event.currentTarget);
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      if (submitter instanceof HTMLButtonElement && submitter.name) values.append(submitter.name, submitter.value);
      flight.current = true; setPending(true); setError(null);
      try { await onSubmit(values); }
      catch { setError("The save could not be confirmed. Your entries are still here. Check the record before retrying."); }
      finally { flight.current = false; setPending(false); }
    }}>
    <FormErrorSummary issues={issues} onReveal={issue => issue.control?.focus()} />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <fieldset disabled={pending} className="min-w-0 space-y-3">{children}</fieldset>
  </form>;
}
