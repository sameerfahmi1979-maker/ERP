export type ExitSearchParams = Record<string, string | string[] | undefined>;
export type ExitScope = { company: number; branch: number; company_name: string; branch_name: string };
export type ExitAccess = { hr: boolean; accounts: boolean; approve: boolean; pay: boolean };
type Money = string | number;

type Basis = "basic" | "gross";
export type ExitPolicyFacts = {
  proration: "calendar-days" | "fixed-days"; fixed_days?: Money;
  absence: "unpaid-only" | "verified-absence";
  leave_wage_basis: Basis; leave_cashout: "current-and-approved-carry" | "none"; leave_cashout_divisor?: Money;
  daily_recovery_basis: Basis; recovery_fraction: Money; net_floor: Money;
  payment_channels: readonly string[];
  benefit: { mode: "none" } | {
    mode: "tiered-basic"; service: "current-period" | "continuous-employer"; exit_types: readonly string[];
    minimum_days: Money; first_band_years: Money; first_days_per_year: Money; later_days_per_year: Money;
    day_divisor: Money; year_divisor: Money; cap_days: Money; exclude_unpaid: boolean;
  };
};
export type ExitPolicy = {
  id: number; from: string; until: string; status: string; digest: string; reason: string;
  facts: ExitPolicyFacts; can_decide: boolean;
};
export type AdjustmentSummary = {
  id: number; kind: string; amount: Money; currency: string; status: string; digest: string;
  reason: string; can_decide: boolean; evidence_attached: boolean;
};
export type ExitWorkspace = {
  access: ExitAccess; cases: readonly CaseSummary[]; selected: ExitCase | null;
  policies?: readonly ExitPolicy[]; next_after?: number | null;
};

export type CaseSummary = { id: number; employee: number; name: string; last_day: string | null; state: string };
export type ClearanceItem = {
  origin: string; source_id: number; owner: string; title: string; status: string; evidence_attached?: boolean;
};
export type RecoveryCase = {
  id: number;
  kind: string;
  state: string;
  fingerprint: string;
  can_include?: boolean;
  can_recommend?: boolean;
  can_accept?: boolean;
  decision: null | { id: number; disposition: string; state: string; reason: string };
};
export type SettlementLine = { id: string; category: string; kind: string; amount: Money; reason: string };
export type SettlementDraft = {
  version: string;
  number: number;
  digest: string;
  state: string;
  gross: Money;
  deductions: Money;
  net: Money;
  currency: string;
  lines: readonly SettlementLine[];
  issues: ReadonlyArray<{ code: string; reason: string; blocking: boolean }>;
};
type Approval = { version: string; digest: string; state: string };
type Movement = {
  id: string;
  amount: Money;
  currency: string;
  outcome: string;
  paid_on?: string | null;
  reference_suffix?: string | null;
  allocation_revision?: number;
  reversed?: boolean;
  can_allocate?: boolean;
  can_reverse?: boolean;
};
type Payment = {
  state: string;
  channel?: string | null;
  currency?: string | null;
  verified_cash: Money;
  applied_wages: Money;
  applied_deductions: Money;
  unallocated: Money;
  remaining?: Money | null;
  movements: readonly Movement[];
};
export type ExitCase = CaseSummary & {
  activated: boolean;
  clearance: { blocking_count: number; items: readonly ClearanceItem[] };
  cases: readonly RecoveryCase[];
  reviewed_cases?: ReadonlyArray<{ id: number; kind: string; disposition: string; reason: string }>;
  draft: SettlementDraft | null;
  approval: Approval | null;
  payment: Payment | null;
  actions: readonly string[];
  payment_channels: readonly string[];
  adjustments?: readonly AdjustmentSummary[];
  can_propose_adjustment?: boolean;
  needs_dates?: boolean;
  employment_end_day?: string | null;
  history?: ReadonlyArray<{ version: string; number: number; digest: string; state: string; calculated_at: string }>;
};

export const exitPath = "/admin/hr/actions/final-settlement";
export const selectClassName = "min-h-9 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function scopeKey(scope: ExitScope) {
  return scope.company + "." + scope.branch;
}

export function caseUrl(scope: ExitScope, eos?: number, after?: number) {
  const params = new URLSearchParams({ company: String(scope.company), branch: String(scope.branch) });
  if (eos !== undefined) params.set("eos", String(eos));
  if (after !== undefined) params.set("after", String(after));
  return exitPath + "?" + params;
}

export function positiveInteger(value: unknown) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

const labels: Record<string, string> = {
  wps: "WPS",
  hr: "HR",
  it: "IT",
  hse: "HSE",
  eos: "Exit case",
  fleet: "Fleet",
  "exit-bank-transfer": "Bank transfer",
  "exit-cheque": "Cheque",
  "not-applicable": "Not applicable",
  "handoff-pending": "Awaiting verified payment outcome",
  "paid-unallocated": "Payment allocation required",
  "unstarted": "Payment not started",
  "separate": "Continue review separately",
  "include": "Include approved recovery",
  "reviewed": "HR review complete",
  "pending-final-settlement": "Pending final settlement",
  "request-revoke": "Revocation requested",
  "unused-annual-leave": "Unused annual leave",
};

export function label(value: string) {
  const key = value.toLowerCase().replaceAll("_", "-");
  return labels[key] ?? key.replaceAll("-", " ").replace(/^\w/, first => first.toUpperCase());
}

export function money(value: Money, currency: string) {
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value));
  if (!parts) return "Amount unavailable";
  const [, sign, whole, fraction = ""] = parts;
  const amount = sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction.padEnd(2, "0");
  return currency ? currency + " " + amount : amount;
}

const formatter = new Intl.DateTimeFormat("en-AE", { timeZone: "Asia/Dubai", dateStyle: "medium" });
export function dateLabel(value: string | null | undefined) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? formatter.format(date) : "Date unavailable";
}

export function maskedReference(suffix: string | null | undefined) {
  return suffix?.match(/^[A-Za-z0-9]{1,8}$/)?.[0];
}

const captions = {
  activate: "Open exit clearance",
  calculate: "Calculate settlement",
  "recommend-case": "Recommend disposition",
  "accept-case": "Accept disposition",
  review: "Record HR review",
  submit: "Submit to GM",
  approve: "Approve exact version",
  reject: "Reject version",
  withdraw: "Withdraw submission",
  "request-revoke": "Request revocation",
  revoke: "Revoke approval",
  "decline-revoke": "Decline revocation",
  "payment-start": "Start approved payment",
  "payment-receipt": "Record payment outcome",
  "payment-allocate": "Allocate payment",
  "payment-reverse": "Reverse payment",
  "close-exit": "Close exit case",
} as const;

export type Action = keyof typeof captions;
export type CommandOption = {
  key: string;
  action: Action;
  title: string;
  caption: string;
  data: Record<string, number | string>;
  canInclude?: boolean;
};

const versionRights = {
  review: "hr", submit: "accounts", approve: "approve", reject: "approve", withdraw: "accounts",
  "request-revoke": "accounts", revoke: "approve", "decline-revoke": "approve",
  "close-exit": "hr",
} as const;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function sealed(value: Approval | SettlementDraft | null): value is Approval | SettlementDraft {
  return value !== null && uuid.test(value.version) && /^[a-f0-9]{64}$/i.test(value.digest);
}

export function commandOptions(selected: ExitCase, access: ExitAccess): CommandOption[] {
  const options: CommandOption[] = [];
  const enabled = (action: Action, role: keyof ExitAccess) => access[role] && selected.actions.includes(action);
  function add(action: Action, data: CommandOption["data"] = {}, detail?: string, canInclude?: boolean) {
    const key = [action, data.version ?? data.settlement_version, data.digest ?? data.fingerprint,
      data.case, data.decision, data.payment, data.revision].join(":");
    options.push({
      action, data, key, caption: captions[action], canInclude,
      title: detail ? captions[action] + " · " + detail : captions[action],
    });
  }

  if (!selected.activated && enabled("activate", "hr")) add("activate");
  if (selected.activated && enabled("calculate", "accounts")) add("calculate");
  for (const item of selected.cases) {
    if (!/^[a-f0-9]{64}$/i.test(item.fingerprint)) continue;
    const input = { case: item.id, fingerprint: item.fingerprint };
    const detail = "Case " + item.id;
    if (item.can_recommend !== false && enabled("recommend-case", "hr")) {
      add("recommend-case", input, detail, item.can_include);
    }
    if (item.decision && item.can_accept !== false && enabled("accept-case", "accounts")) {
      add("accept-case", { ...input, decision: item.decision.id }, detail);
    }
  }

  for (const [action, role] of Object.entries(versionRights) as Array<[keyof typeof versionRights, keyof ExitAccess]>) {
    const target = action.includes("revoke") || action === "close-exit" ? selected.approval : selected.draft;
    if (enabled(action, role) && sealed(target)) add(action, { version: target.version, digest: target.digest });
  }

  const approval = selected.approval;
  if (!sealed(approval) || approval.state !== "approved") return options;
  const exact = { settlement_version: approval.version, digest: approval.digest };
  if (selected.payment_channels.length && enabled("payment-start", "pay")) add("payment-start", exact);
  if (enabled("payment-receipt", "pay") && /^[A-Z]{3}$/.test(selected.payment?.currency ?? selected.draft?.currency ?? "")) {
    add("payment-receipt", exact);
  }
  const exactDraft = selected.draft?.version === approval.version && selected.draft.digest === approval.digest;
  for (const event of selected.payment?.movements ?? []) {
    if (event.reversed || !uuid.test(event.id) || !Number.isSafeInteger(event.allocation_revision)
        || event.allocation_revision === undefined || event.allocation_revision < 0) continue;
    const data = { ...exact, payment: event.id, revision: event.allocation_revision };
    const suffix = maskedReference(event.reference_suffix);
    const detail = [suffix ? "…" + suffix : null, "Event " + event.id.slice(-8)].filter(Boolean).join(" · ");
    if (event.can_allocate && exactDraft && selected.draft?.lines.length && enabled("payment-allocate", "pay")) {
      add("payment-allocate", data, detail);
    }
    if (event.can_reverse && enabled("payment-reverse", "pay")) add("payment-reverse", data, detail);
  }
  return options;
}

