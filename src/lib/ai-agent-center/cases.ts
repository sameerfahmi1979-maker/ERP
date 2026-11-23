import type { AgentCenterCase } from "./contracts";

export const CASE_STATUS = {
  queued: "Queued",
  running: "Running",
  review: "Awaiting DMS officer approval",
  filed: "Filed",
  duplicate: "Duplicate confirmed",
  failed: "Failed",
  exception: "Needs review",
} as const;

export function caseHref(item: AgentCenterCase) {
  if (item.documentId) return { href: `/dms/documents/record/${item.documentId}`, label: "Open document" };
  if (item.sessionCode) return { href: `/dms/intake/${item.sessionCode}`, label: "Open intake" };
  return null;
}

export function caseTimeline(item: AgentCenterCase) {
  return [
    { label: "Discovered in SharePoint", at: item.discoveredAt },
    { label: "PDF imported", at: item.uploadedAt },
    { label: "AI Fill started", at: item.startedAt },
    { label: "Analysis completed", at: item.analysisFinishedAt },
    { label: "DMS officer review queued", at: item.waitingSince },
    { label: CASE_STATUS[item.status], at: item.finishedAt },
  ].flatMap(({ label, at }) => at ? [{ label, at }] : []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
