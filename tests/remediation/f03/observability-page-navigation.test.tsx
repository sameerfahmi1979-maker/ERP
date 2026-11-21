import { beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import type { AuthContext } from "@/lib/rbac/check";

const state = vi.hoisted(() => ({
  ctx: {} as AuthContext,
  observabilityConfig: vi.fn(),
  dashboardAvailability: vi.fn(),
  intelligenceStats: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect(path: string) { throw new Error("redirect:" + path); },
}));
vi.mock("@/lib/rbac/check", async () => ({
  ...await vi.importActual("@/lib/rbac/scope"),
  getAuthContext: async () => state.ctx,
}));
vi.mock("@/server/actions/dms/ai-observability", () => ({
  getDmsAiObservabilityConfig: state.observabilityConfig,
}));
vi.mock("@/server/actions/ai/common/dashboard", () => ({
  getAiDailyDashboardAvailability: state.dashboardAvailability,
  getAiDailyDashboard: vi.fn(),
}));
vi.mock("@/server/actions/dms/intelligence-admin", () => ({
  getDmsIntelligenceAdminStats: state.intelligenceStats,
}));
vi.mock("@/features/dms/ai-observability/dms-ai-observability-page-client", () => ({
  DmsAiObservabilityPageClient: () => null,
}));
vi.mock("@/features/ai/common/dashboard", () => ({ AiDailyDashboardPageClient: () => null }));
vi.mock("@/features/dms/admin/dms-intelligence-admin-page-client", () => ({
  DmsIntelligenceAdminPageClient: () => null,
}));
vi.mock("@/components/erp/page-header", () => ({ ERPPageHeader: () => null }));
vi.mock("@/components/erp/load-error", () => ({ LoadError: () => null }));

import AiDailyDashboardPage from "@/app/(protected)/admin/ai/dashboard/page";
import DmsAiObservabilityPage from "@/app/(protected)/admin/dms/ai-observability/page";
import DmsIntelligencePage from "@/app/(protected)/admin/dms/intelligence/page";
import { DmsIntelligenceAdminPageClient } from "@/features/dms/admin/dms-intelligence-admin-page-client";

function actor(permissionCodes: string[], globalPermissionCodes: string[]) {
  state.ctx = {
    profile: { id: 1, must_change_password: false } as AuthContext["profile"],
    email: null,
    isAccountActive: true,
    accountStatus: "active",
    roleCodes: ["viewer"],
    permissionCodes,
    globalPermissionCodes,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.dashboardAvailability.mockResolvedValue("disabled");
  state.observabilityConfig.mockResolvedValue({ success: true, data: { setupRequired: true } });
  state.intelligenceStats.mockResolvedValue({ success: true });
});

it.each([
  [AiDailyDashboardPage, "ai.common.view", state.dashboardAvailability],
  [DmsAiObservabilityPage, "settings.ai.view", state.observabilityConfig],
])("checks global authority before loading the target page", async (page, permission, read) => {
  actor([permission], []);
  await expect(page()).rejects.toThrow("redirect:/access-denied");
  expect(read).not.toHaveBeenCalled();
  actor([permission], [permission]);
  await expect(page()).resolves.toBeTruthy();
  expect(read).toHaveBeenCalledOnce();
});

it.each([false, true])("uses the same global capability for the Intelligence dashboard link (%s)", async globalGrant => {
  actor(["dms.admin", "settings.ai.view"], globalGrant ? ["settings.ai.view"] : []);
  const page = await DmsIntelligencePage() as ReactElement<{ children: ReactElement<{ canOpenAiObservability?: boolean }>[] }>;
  const client = page.props.children.find(child => child && child.type === DmsIntelligenceAdminPageClient);
  expect(client?.props.canOpenAiObservability).toBe(globalGrant);
});

