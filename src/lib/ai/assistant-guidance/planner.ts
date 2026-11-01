import { questionPlanSchema, type QuestionPlan } from "./contracts";

export function dubaiDate(now = new Date()) { return new Date(now.getTime() + 4 * 3600000).toISOString().slice(0, 10); }
export function expiryStatus(value: string | null, today = dubaiDate()) {
  if (!value) return "Expiry is not recorded";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(Date.parse(value)).toISOString().slice(0, 10) !== value) return "Recorded expiry needs review";
  const days = Math.round((Date.parse(value) - Date.parse(today)) / 86400000);
  return days < 0 ? `Expired ${-days} day(s) ago` : days === 0 ? "Expires today" : `Expires in ${days} day(s)`;
}
export function questionPeriod(question: string): QuestionPlan["period"] {
  return /next month/i.test(question) ? "next_month" : /this month/i.test(question) ? "this_month" : /next 30 days/i.test(question) ? "next_30_days" : /\btoday\b/i.test(question) ? "today" : "any";
}
export function dateRange(period: QuestionPlan["period"], today = dubaiDate()) {
  const [year, month] = today.split("-").map(Number);
  const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
  if (period === "today") return { from: today, to: today };
  if (period === "this_month") return { from: day(year, month - 1, 1), to: day(year, month, 0) };
  if (period === "next_month") return { from: day(year, month, 1), to: day(year, month + 1, 0) };
  if (period === "next_30_days") return { from: today, to: new Date(Date.parse(today) + 30 * 86400000).toISOString().slice(0, 10) };
  return null;
}
export function deterministicPlan(question: string): QuestionPlan | null {
  const q = question.toLowerCase(); let tool: QuestionPlan["tool"] | null = null;
  if (/\b(dependents?|dependants?)\b|المعالين|التابعين/.test(q)) tool = "dependents";
  else if (/\b(policy|policies|procedure)\b|سياسة|سياسات/.test(q)) tool = "policy";
  else if (/\b(daily briefing|work briefing|daily summary|my priorities)\b/.test(q)) tool = "briefing";
  else if (/\b(who|where|why|status)\b.*\b(approv|submit)|\bapproval status\b/.test(q)) tool = "approval";
  else if (/\b(how many|count|grouped? by|report of|report on)\b/.test(q)) tool = "report";
  else if (/\b(how|help|steps)\b.*\b(renew|correct|edit|upload|recover|review)\b/.test(q)) tool = "guidance";
  else if (/\b(expire|expires|expiry|expiration|expiring)\b|تنتهي|انتهاء/.test(q)) tool = "expiry";
  else if (/\b(passport|cicpa|emirates id|iso|document|certificate|visa)\b|جواز|شهادة|هوية/.test(q)) tool = "documents";
  else if (/\b(this record|this employee|employee details|company details|branch details|site details|joining date|employment status|employee status)\b/.test(q)) tool = "record";
  if (!tool) return null;
  const groupBy = /\bby status\b/.test(q) ? "status" : /\bby (?:document )?type\b/.test(q) ? "type" : /\bby expiry\b/.test(q) ? "expiry" : /\bby company\b/.test(q) ? "company" : /\bby branch\b/.test(q) ? "branch" : /\bby site\b/.test(q) ? "site" : "none";
  return questionPlanSchema.parse({ tool, groupBy, period: questionPeriod(q) });
}
/** Only conversational syntax is removed. Names/codes remain the search service's concern. */
export function questionSearchText(question: string) {
  return question.replace(/['’]s\b/gi, "").replace(/\b(?:when|does|will|would|please|give|show|find|me|the|a|an|document|documents|link|links|expire|expires|expiry|expiration|expiring|who|are|is|dependents?|dependants?|of|for|how many|count|report of|report on)\b/gi, " ")
    .replace(/\b(?:next month|this month|next 30 days|today|grouped? by (?:document )?(?:type|status|expiry|company|branch|site))\b/gi, " ")
    .replace(/\b(?:his|her|their|this|that|my|what about)\b/gi, " ").replace(/[?؟]/g, " ").replace(/\s+/g, " ").trim();
}
export function isFollowUp(question: string) { return /\b(?:his|her|their|this document|that document|what about)\b|هذه الوثيقة/.test(question.toLowerCase()); }
