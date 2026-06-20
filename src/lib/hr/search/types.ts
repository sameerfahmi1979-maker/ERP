export type HrSearchCategory =
  | "employees"
  | "candidates"
  | "compliance"
  | "time"
  | "payroll"
  | "operations"
  | "actions"
  | "onboarding";

export type HrSearchResult = {
  id: string;
  category: HrSearchCategory;
  entityType: string;
  entityId: number;
  title: string;
  subtitle?: string;
  description?: string;
  status?: string;
  statusVariant?: "success" | "warning" | "danger" | "muted";
  employeeId?: number;
  employeeCode?: string;
  employeeName?: string;
  candidateId?: number;
  candidateCode?: string;
  date?: string;
  href: string;
  matchedFields?: string[];
  restricted?: boolean;
};

export type HrSearchInput = {
  query?: string;
  categories?: HrSearchCategory[];
  ownerCompanyId?: number;
  branchId?: number;
  departmentId?: number;
  designationId?: number;
  workSiteId?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
};

export type HrSearchOutput = {
  results: HrSearchResult[];
  totalCount: number;
  groupCounts: Partial<Record<HrSearchCategory, number>>;
  query: string;
  hasMore: boolean;
};

export type HrSearchSuggestion = {
  label: string;
  sublabel?: string;
  href: string;
  category: HrSearchCategory;
};

export const HR_SEARCH_CATEGORY_LABELS: Record<HrSearchCategory, string> = {
  employees: "Employees",
  candidates: "Candidates",
  compliance: "Compliance",
  time: "Time & Leave",
  payroll: "Payroll & WPS",
  operations: "Operations",
  actions: "HR Actions",
  onboarding: "Onboarding",
};

export const HR_SEARCH_CATEGORY_ORDER: HrSearchCategory[] = [
  "employees",
  "candidates",
  "compliance",
  "time",
  "payroll",
  "operations",
  "actions",
  "onboarding",
];
