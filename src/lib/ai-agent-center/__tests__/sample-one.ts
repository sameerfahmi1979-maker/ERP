export const SAMPLE_ONE = {
  now: "2026-11-20T06:44:24.000Z",
  scope: { companyId: 1, branchId: null as number | null, company: "ALGT", branch: "All branches" },
  totals: { filed: 8, duplicate: 3, review: 1, failed: 0 },
  intake: { stage: "intake", status: "running", label: "Files checked", completedUnits: 12, totalUnits: 20 },
  selectedCase: { id: "00000000-0000-4000-8000-000000000001", title: "CICPA Onshore", stage: "extraction", status: "running",
    step: "Reading Arabic locations", startedAt: "2026-11-20T06:44:00.000Z",
    discoveredAt: "2026-11-20T06:41:00.000Z", importedAt: "2026-11-20T06:42:00.000Z" },
  attention: { title: "CICPA Offshore", reason: "Awaiting DMS officer approval" },
  nextScanAt: "2026-11-20T06:50:00.000Z",
} as const;
