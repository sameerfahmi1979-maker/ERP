import type { AgentCenterCase } from "./contracts";

export type CaseProgress = { completedUnits: number; totalUnits: number };
type CasePosition = Pick<AgentCenterCase, "id" | "stage" | "updatedAt">;

const stages = ["intake", "extraction", "validation", "linking"] as const;
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function getMeasuredProgress(progress: CaseProgress | null) {
  if (!progress) return null;
  const { completedUnits: completed, totalUnits: total } = progress;
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total) || total <= 0 || completed < 0 || completed > total) {
    return null;
  }
  return { completed, total, percent: Math.floor(100 * (completed / total)) };
}

export function getConfirmedHandoff(previous: CasePosition | null, current: CasePosition | null) {
  if (!previous || !current || previous.id !== current.id || Date.parse(current.updatedAt) <= Date.parse(previous.updatedAt)) return null;
  return stages.indexOf(current.stage) > stages.indexOf(previous.stage) ? { from: previous.stage, to: current.stage } : null;
}

export function dubaiTime(value: string) {
  return clock.format(new Date(value));
}
