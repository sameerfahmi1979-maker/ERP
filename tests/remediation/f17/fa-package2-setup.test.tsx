import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { syntheticAuthContext } from "../../performance/fixtures/auth-context";
import BrandingPage from "@/app/(protected)/admin/settings/branding/page";
import DashboardPage from "@/app/(protected)/admin/ai/dashboard/page";
import ObservabilityPage from "@/app/(protected)/admin/dms/ai-observability/page";

const io = vi.hoisted(() => ({
  branding: vi.fn(),
  flag: vi.fn(),
  legacyFlag: vi.fn(),
  metrics: vi.fn(),
  unavailable: { data: null, error: { message: "private fixture diagnostic" } },
}));
vi.mock("@/lib/rbac/check", async () => ({
  ...await vi.importActual("@/lib/rbac/scope"),
  getAuthContext: async () => syntheticAuthContext(["branding.app.view", "ai.dashboard.view", "dms.ai_observability.view"]),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: io.flag,
    from: (table: string) => {
      const query = {
        select: () => query, eq: () => query, is: () => query,
        maybeSingle: () => table === "erp_app_branding_settings" ? io.branding() : io.legacyFlag(),
        single: () => io.legacyFlag(),
      };
      return query;
    },
  }),
}));
vi.mock("@/lib/branding/load-runtime-app-branding", () => ({
  loadRuntimeAppBranding: async () => ({}),
}));
vi.mock("@/features/branding/app-branding-settings-page-client", () => ({
  AppBrandingSettingsPageClient: () => <p>Configured branding editor</p>,
}));
vi.mock("@/lib/ai/common/dashboard/dashboard-summary", () => ({
  buildDailyDashboardSummary: io.metrics,
}));
vi.mock("@/features/ai/common/dashboard", () => ({
  AiDailyDashboardPageClient: () => <p>Configured dashboard metrics</p>,
}));
vi.mock("@/features/dms/ai-observability/dms-ai-observability-page-client", () => ({
  DmsAiObservabilityPageClient: ({ config }: { config: { featureFlagEnabled: boolean } }) =>
    <p>{config.featureFlagEnabled ? "Configured observability metrics" : "DMS AI Observability is disabled"}</p>,
}));

beforeEach(() => {
  vi.resetAllMocks();
  io.branding.mockResolvedValue({ data: null, error: null });
  io.legacyFlag.mockResolvedValue({ data: null, error: null });
  io.flag.mockResolvedValue({ data: "setup_required", error: null });
  io.metrics.mockResolvedValue({});
});

it("shows setup for confirmed missing app branding and a separate state for an inactive record", async () => {
  expect(renderToStaticMarkup(await BrandingPage())).toContain("App branding setup required");
  io.branding.mockResolvedValue({ data: { id: 8, is_active: false }, error: null });
  const inactive = renderToStaticMarkup(await BrandingPage());
  expect(inactive).toContain("App branding is inactive");
  expect(inactive).not.toContain("Configured branding editor");
});

it("loads configured branding and presents a real lookup outage as retryable", async () => {
  io.branding.mockResolvedValue({ data: { id: 9, is_active: true }, error: null });
  expect(renderToStaticMarkup(await BrandingPage())).toContain("Configured branding editor");
  io.branding.mockResolvedValue(io.unavailable);
  const unavailable = renderToStaticMarkup(await BrandingPage());
  expect(unavailable).toContain("could not be loaded");
  expect(unavailable).not.toContain("private fixture diagnostic");
});

it("keeps missing and disabled AI settings distinct and avoids any metrics work", async () => {
  expect(renderToStaticMarkup(await DashboardPage())).toContain("AI Daily Dashboard setup required");
  expect(renderToStaticMarkup(await ObservabilityPage())).toContain("DMS AI Observability setup required");
  expect(io.flag).toHaveBeenCalledWith("fa_read_ai_setup_feature", { p_feature: "ERP_AI_DAILY_DASHBOARD" });
  expect(io.flag).toHaveBeenCalledWith("fa_read_ai_setup_feature", { p_feature: "DMS_AI_OBSERVABILITY" });
  io.flag.mockResolvedValue({ data: "disabled", error: null });
  expect(renderToStaticMarkup(await DashboardPage())).toContain("AI Daily Dashboard is disabled");
  expect(renderToStaticMarkup(await ObservabilityPage())).toContain("DMS AI Observability is disabled");
  expect(io.metrics).not.toHaveBeenCalled();
});

it("uses verified AI flags only and keeps failed reads retryable", async () => {
  io.flag.mockResolvedValue({ data: "enabled", error: null });
  expect(renderToStaticMarkup(await DashboardPage())).toContain("Configured dashboard metrics");
  expect(renderToStaticMarkup(await ObservabilityPage())).toContain("Configured observability metrics");
  io.flag.mockRejectedValue(new Error("private fixture diagnostic"));
  for (const page of [DashboardPage, ObservabilityPage]) {
    const output = renderToStaticMarkup(await page());
    expect(output).toContain("could not be loaded");
    expect(output).not.toContain("private fixture diagnostic");
  }
});
