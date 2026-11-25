import { fleetId } from "@/lib/fleet/asset-contract";

const dubaiOffset = 4 * 60 * 60 * 1000;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

export function fleetPayrollReviewQuery(company: number, day: string, params: Record<string, string | string[] | undefined>) {
  const now = new Date();
  const entered = typeof params.cutoff === "string" && localDateTime.test(params.cutoff) ? params.cutoff : undefined;
  const cutoffText = entered ?? new Date(now.getTime() + dubaiOffset).toISOString().slice(0, -1);
  const cutoff = entered ? cutoffText + (cutoffText.length === 16 ? ":00" : "") + "+04:00" : now.toISOString();
  const before = params.before === undefined ? undefined : Number(params.before);
  const older = params.older === undefined ? undefined : Number(params.older);
  const query = new URLSearchParams({ company: String(company), day, cutoff: cutoffText });
  if (fleetId.safeParse(before).success) query.set("before", String(before));
  if (fleetId.safeParse(older).success) query.set("older", String(older));
  function pageHref(path: string, key: "before" | "older", value: number) {
    const page = new URLSearchParams(query);
    page.set(key, String(value));
    return path + "?" + page.toString();
  }
  return { cutoffText, cutoff, before, older, pageHref };
}

