import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ enabled: vi.fn(), sessions: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 11 }, roleCodes: [] }),
  hasPermission: () => true,
}));
vi.mock("@/components/erp/page-header", () => ({ ERPPageHeader: () => null }));
vi.mock("@/features/ai/common/assistant", () => ({ AssistantPageClient: () => null }));
vi.mock("@/server/actions/ai/common/assistant", () => ({
  getAssistantSessions: m.sessions,
  isAssistantEnabled: m.enabled,
}));

import AssistantPage from "@/app/(protected)/assistant/page";
beforeEach(() => {
  vi.clearAllMocks();
  m.sessions.mockResolvedValue({ success: true, data: [] });
});

it("keeps the paused Assistant page read-only and avoids saved session collection", async () => {
  m.enabled.mockResolvedValue(false);
  await AssistantPage({ searchParams: Promise.resolve({}) });
  expect(m.enabled).toHaveBeenCalledOnce();
  expect(m.sessions).not.toHaveBeenCalled();
});

it("loads one initial bounded session list when the Assistant is enabled", async () => {
  m.enabled.mockResolvedValue(true);
  await AssistantPage({ searchParams: Promise.resolve({}) });
  expect(m.sessions).toHaveBeenCalledExactlyOnceWith({ limit: 20 });
});
