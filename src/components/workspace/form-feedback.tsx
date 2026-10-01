"use client";

import { useEffect, useId } from "react";
import type { WorkspaceFieldIssue } from "@/lib/workspace/form-validation";

export function mergeFieldIssues(...groups: WorkspaceFieldIssue[][]): WorkspaceFieldIssue[] {
  const result: WorkspaceFieldIssue[] = [];
  for (const issue of groups.flat()) {
    const index = result.findIndex(previous => issue.control ? previous.control === issue.control : !previous.control && previous.label === issue.label);
    if (index < 0) result.push(issue); else result[index] = issue;
  }
  return result;
}

/** Value-free feedback for native and registered custom fields, without changing their controllers. */
export function useInlineFieldFeedback(issues: WorkspaceFieldIssue[]) {
  const prefix = useId();
  useEffect(() => {
    const cleanups = issues.flatMap((issue, index) => {
      const control = issue.control;
      if (!control?.isConnected) return [];
      const invalid = control.getAttribute("aria-invalid");
      const description = control.getAttribute("aria-describedby");
      const message = document.createElement("span");
      message.id = `${prefix}-field-${index}`;
      message.className = "algt-field-error";
      message.textContent = issue.message;
      // Do not place a span inside an input/button; keep React's controlled value untouched.
      // A wrapping label contributes all descendant text to the accessible
      // name. Keep feedback outside it and associate it as a description.
      (control.closest("label") ?? control).insertAdjacentElement("afterend", message);
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", [description, message.id].filter(Boolean).join(" "));
      return [() => {
        message.remove();
        if (invalid === null) control.removeAttribute("aria-invalid"); else control.setAttribute("aria-invalid", invalid);
        if (description === null) control.removeAttribute("aria-describedby"); else control.setAttribute("aria-describedby", description);
      }];
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, [issues, prefix]);
}

export function FormErrorSummary({ issues, onReveal, id, action = "saving" }: { issues: WorkspaceFieldIssue[]; onReveal: (issue: WorkspaceFieldIssue) => void; id?: string; action?: string }) {
  if (!issues.length) return null;
  return <div role="alert" id={id} className="mb-4 rounded-sm border border-destructive/60 bg-destructive/5 p-4 text-sm">
    <p className="font-semibold">Check {issues.length} {issues.length === 1 ? "field" : "fields"} before {action}</p>
    <ul className="mt-2 space-y-2">{issues.map((issue, index) => <li key={index}>
      {issue.control ? <button type="button" className="text-left underline underline-offset-2 focus-visible:outline-2" onClick={() => onReveal(issue)}>{issue.label}: {issue.message}</button> : <span>{issue.label}: {issue.message}</span>}
    </li>)}</ul>
  </div>;
}
