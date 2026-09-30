// Shared with the F05 redesign: a UI state is not proof of inbox delivery.
interface QueuePresentation {
  status: string; deliveryState?: string | null; pausedAt?: string | null;
  dispatchStartedAt?: string | null; lastError: string | null;
  attemptCount: number; maxAttempts: number;
}
export function queueStatusLabel(q: QueuePresentation): string {
  if (q.status === "sent") return q.deliveryState === "provider_accepted" ? "Provider accepted" : "Legacy sent (unverified)";
  if (q.status === "delivery_unknown") return "Delivery uncertain — review required";
  if (q.status === "pending" && q.pausedAt) return "Paused — review required";
  if (q.status === "pending" && q.lastError === "F09:provider_quota") return "Waiting for provider capacity";
  if (q.status === "pending" && q.lastError === "F09:retry") return "Retry scheduled";
  return ({pending:"Queued",processing:"Processing",failed:"Failed — no automatic resend",cancelled:"Cancelled"} as Record<string,string>)[q.status] ?? q.status;
}
export function queueControls(q: QueuePresentation) {
  const pending=q.status==="pending"&&!q.pausedAt&&q.attemptCount<q.maxAttempts;
  return {process:pending,retry:pending&&q.lastError==="F09:retry",
    cancel:(["pending","processing"].includes(q.status)&&!q.dispatchStartedAt)
      ||(q.status==="pending"&&q.lastError==="F09:retry"&&!q.deliveryState)};
}
