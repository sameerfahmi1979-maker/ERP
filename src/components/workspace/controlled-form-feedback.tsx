"use client";

import { useEffect, useRef, useState } from "react";
import { FormErrorSummary, useInlineFieldFeedback } from "./form-feedback";
import type { WorkspaceFieldIssue } from "@/lib/workspace/form-validation";

type Props = {
  errors: Record<string, { message?: string } | undefined>;
  labels: Record<string, string>;
  action?: string;
};

/** Adapts schema errors to the shared contract. Never reads or stores field values. */
export function ControlledFormFeedback({ errors, labels, action = "continuing" }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<WorkspaceFieldIssue[]>([]);
  const description = JSON.stringify(Object.entries(labels).flatMap(([name, label]) =>
    errors[name]?.message ? [{ name, label, message: errors[name]?.message }] : []));
  useEffect(() => {
    const form = root.current?.closest("form");
    const entries = JSON.parse(description) as { name: string; label: string; message: string }[];
    setIssues(entries.map(({ name, label, message }) => {
      const control = form?.elements.namedItem(name);
      return { label, message, control: control instanceof HTMLElement ? control : null, section: null };
    }));
  }, [description]);
  useInlineFieldFeedback(issues);
  return <div ref={root} className="algt-controlled-feedback">
    <FormErrorSummary issues={issues} action={action} onReveal={issue => {
      issue.control?.focus();
      issue.control?.scrollIntoView({ block: "nearest" });
    }} />
  </div>;
}
