import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { dmsRouteId, readDmsEmailDestination } from "@/server/dms-email-open";

const mock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => await import("@/lib/rbac/scope"));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.read }) }));
const ctx = { profile: { id: 7, must_change_password: false }, isAccountActive: true, accountStatus: "active" } as AuthContext;

beforeEach(() => {
  vi.clearAllMocks();
  mock.read.mockResolvedValue({ data: "approval_submitted" });
});

it("reads the exact recipient and source, and opens the Approvals section", async () => {
  expect(await readDmsEmailDestination(ctx, 44, "22")).toEqual({ notice: 22, section: "approvals" });
  expect(mock.read).toHaveBeenCalledExactlyOnceWith("dms_email_link_type", { p_notification: 22, p_document: 44 });
});

it("lands expiry messages on the record overview", async () => {
  mock.read.mockResolvedValue({ data: "expiry_reminder" });
  expect(await readDmsEmailDestination(ctx, 44, "22")).toEqual({ notice: 22, section: "overview" });
});

it("refuses forwarded notices, unknown events, and mismatched or forbidden destinations", async () => {
  mock.read.mockResolvedValueOnce({ data: null }).mockResolvedValueOnce({ data: "legacy" });
  expect(await readDmsEmailDestination(ctx, 44, "22")).toBeNull();
  expect(await readDmsEmailDestination(ctx, 44, "22")).toBeNull();
  mock.read.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect(await readDmsEmailDestination(ctx, 44, "22")).toBeNull();
});

it("rejects signed-out access and malformed identifiers before querying", async () => {
  for (const invalid of ["0", "01", "44?notice=1", ["22"], "9007199254740993", "https://erp.algt.net/"]) expect(dmsRouteId(invalid)).toBeNull();
  expect(await readDmsEmailDestination({ ...ctx, profile: null }, 44, "22")).toBeNull();
  expect(await readDmsEmailDestination(ctx, 44, ["22"])).toBeNull();
  expect(mock.read).not.toHaveBeenCalled();
});
