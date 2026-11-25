"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PayrollRefreshNotice } from "@/features/hr/payroll/payroll-refresh-notice";
import { usePayrollCommand } from "@/hooks/use-payroll-command";
import { Textarea } from "@/components/ui/textarea";
import type { PayrollReviewAction } from "@/lib/hr/payroll/approval-contract";
import { savePayrollReviewCommand } from "@/server/actions/hr/payroll-approvals";

const approvalSelectClass = "min-h-9 rounded-md border bg-background px-3 py-2 text-sm";

const controls: Record<PayrollReviewAction, string> = {
  submit: "Submit exact version",
  approve: "Approve exact version",
  reject: "Reject this version",
  withdraw: "Withdraw submission",
  "request-release": "Request release",
  release: "Release approval",
  "decline-release": "Decline release",
};

const confirmations: Record<PayrollReviewAction, string> = {
  submit: "Version submitted.",
  approve: "Exact version approved.",
  reject: "Version rejected.",
  withdraw: "Submission withdrawn.",
  "request-release": "Release requested.",
  release: "Approval released.",
  "decline-release": "Release declined.",
};

type Target = {
  actions: Exclude<PayrollReviewAction, "submit">[];
  review: string;
  recoveryScheduleDigest?: string;
} | {
  actions: ["submit"];
  run: string;
  acknowledge: boolean;
  returnTo: string;
};

export function PayrollApprovalForm({ company, branch, version, digest, target }: {
  company: number;
  branch: number;
  version: string;
  digest: string;
  target: Target;
}) {
  const router = useRouter();
  const singleAction = target.actions.length === 1 ? target.actions[0] : undefined;
  const recoveryScheduleDigest = "recoveryScheduleDigest" in target ? target.recoveryScheduleDigest : undefined;
  const controlLabel = (action: PayrollReviewAction) => action === "approve" && recoveryScheduleDigest
    ? "Approve exact version and recovery schedules" : controls[action];
  const mutation = usePayrollCommand(
    (request: { action: PayrollReviewAction; company: number; branch: number; operation: string; data: FormData; form: HTMLFormElement }) =>
      savePayrollReviewCommand(request.action, request.company, request.branch, request.operation, request.data),
    {
      target: "approvals",
      onSuccess(request) {
        request.form.reset();
        return confirmations[request.action];
      },
      updateView: "returnTo" in target ? receipt => {
        const next = new URL(target.returnTo, window.location.origin);
        next.searchParams.set("review", receipt.review);
        router.push(next.pathname + next.search + "#payroll-snapshot");
      } : undefined,
      unconfirmed: "The decision could not be confirmed. Retry the same request.",
    },
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    return mutation.submit(() => {
      const data = new FormData(form);
      const action = target.actions.find(value => value === (singleAction ?? data.get("decision")));
      if (!action) return null;
      data.delete("decision");
      if (action !== "approve") data.delete("recovery_schedule_digest");
      return { action, company, branch, operation: crypto.randomUUID(), data, form };
    });
  }

  const { busy, locked, retry, refreshError, message } = mutation;
  if (!target.actions.length) return null;
  return <form onSubmit={submit} aria-label="Payroll decision" className="space-y-3">
    <fieldset disabled={locked} className="min-w-0 space-y-3">
      {"run" in target ? <input type="hidden" name="run" value={target.run} /> : <input type="hidden" name="review" value={target.review} />}
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="digest" value={digest} />
      {recoveryScheduleDigest && <input type="hidden" name="recovery_schedule_digest" value={recoveryScheduleDigest} />}
      {!singleAction && <label className="grid gap-1.5 text-sm font-medium">Decision
        <select name="decision" className={approvalSelectClass} defaultValue="" required>
          <option value="" disabled>Choose a decision</option>
          {target.actions.map(value => <option value={value} key={value}>{controlLabel(value)}</option>)}
        </select>
      </label>}
      {"acknowledge" in target && target.acknowledge &&
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="acknowledge_exceptions" value="true" className="mt-1" required />
          <span>Acknowledge the remaining non-blocking exceptions on this version.</span>
        </label>}
      <label className="grid gap-1.5 text-sm font-medium">Reason
        <Textarea name="reason" required maxLength={2000} rows={2} />
      </label>
      <Button type="submit" size="sm">{busy ? "Saving…" : singleAction ? controlLabel(singleAction) : "Record decision"}</Button>
    </fieldset>
    {retry && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void mutation.submit()}>
      Retry same request
    </Button>}
    {refreshError && <PayrollRefreshNotice busy={busy} retry={() => void mutation.retryRefresh()} />}
    {message && <p role={message.error ? "alert" : "status"} className={message.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
      {message.text}
    </p>}
  </form>;
}
