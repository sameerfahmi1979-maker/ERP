
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/hr/payroll/payslips/[slipId]/route";

const deps = vi.hoisted(() => ({
  canUse: vi.fn(() => true),
  rpc: vi.fn(),
  readOriginal: vi.fn(),
}));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: vi.fn(), canUseApplication: deps.canUse,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: deps.rpc }),
}));
vi.mock("@/lib/official-documents/payslip-storage", () => ({
  readPayslipOriginal: deps.readOriginal,
}));

const bytes = Buffer.from("%PDF-1.7\n" + "A".repeat(180));
const manifest = {
  path: "hr/payslips/1/2/00000000-0000-4000-8000-000000000008.pdf", filename: "Payslip-2026-11-8.pdf",
  checksum: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
  object_id: "00000000-0000-4000-8000-000000000018",
};
const get = () => GET(new Request("http://localhost/api/hr/payroll/payslips/8"), { params: Promise.resolve({ slipId: "8" }) });

beforeEach(() => {
  deps.canUse.mockReset().mockReturnValue(true);
  deps.rpc.mockReset().mockResolvedValue({ data: manifest, error: null });
  deps.readOriginal.mockReset().mockResolvedValue({ bytes, identity: { id: manifest.object_id } });
});

describe("original payslip download", () => {
  it("streams only exact original bytes after scoped audit and prevents caching", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="Payslip-2026-11-8.pdf"');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(deps.rpc.mock.calls).toEqual([
      ["t17_file_manifest", { p_slip: 8, p_record_access: false }],
      ["t17_file_manifest", { p_slip: 8, p_record_access: true }],
    ]);
  });

  it("prevents unauthenticated and sibling access to storage", async () => {
    deps.canUse.mockReturnValueOnce(false);
    expect((await get()).status).toBe(401);
    deps.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect((await get()).status).toBe(404);
    expect(deps.readOriginal).not.toHaveBeenCalled();
  });

  it("holds an object replacement even with identical PDF bytes", async () => {
    deps.readOriginal.mockResolvedValueOnce({ bytes, identity: { id: "00000000-0000-4000-8000-000000000028" } });
    expect((await get()).status).toBe(409);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
  });

  it("withholds the response when scope was revoked during storage read", async () => {
    deps.rpc.mockResolvedValueOnce({ data: manifest, error: null }).mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect((await get()).status).toBe(404);
    expect(deps.readOriginal).toHaveBeenCalledOnce();
  });
});
