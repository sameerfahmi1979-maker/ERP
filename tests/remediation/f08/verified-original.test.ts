import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), serviceRpc: vi.fn(), original: vi.fn(), info: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: m.serviceRpc,
  from: () => ({ select: () => ({ eq: () => ({ single: m.original }) }) }),
  storage: { from: () => ({ info: m.info, download: m.download }) },
}) }));
import { attestStoredOutput, finalizeVerifiedOutput, activateVerifiedOutput } from "@/lib/output/verified-original";
import { hashFinalPdfBytes } from "@/lib/output/idempotency";
const bytes = Buffer.from("%PDF-1.7 Synthetic retained original");
const object = { id: "f0800000-0000-4000-8000-000000000001", version: "v1", lastModified: "2026-10-18T00:00:00.123Z" };
const command = { issuanceId: 7, expectedSha256: hashFinalPdfBytes(bytes), rendererVersion: "synthetic@1" };
beforeEach(() => {
  vi.resetAllMocks();
  m.rpc.mockResolvedValue({ data: { actorId: 11, authSessionId: "f0800000-0000-4000-8000-000000000002" }, error: null });
  m.original.mockResolvedValue({ data: { storage_path: "synthetic/7.pdf", generated_by: 11 }, error: null });
  m.info.mockResolvedValue({ data: object, error: null });
  m.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
  m.serviceRpc.mockResolvedValue({ data: null, error: null });
});
describe("stored-original attestation, controlled Storage ports (not live Storage)", () => {
  it("attests actual downloaded hash and length only after two matching object observations", async () => {
    expect(await attestStoredOutput(command)).toEqual(bytes);
    expect(m.info).toHaveBeenCalledTimes(2);
    expect(m.serviceRpc).toHaveBeenCalledWith("f08_attest_pdf", expect.objectContaining({
      p_id: 7, p_actor: 11, p_object: object.id, p_sha: command.expectedSha256, p_size: bytes.length, p_version: "v1", p_renderer: "synthetic@1",
    }));
    expect(m.info.mock.invocationCallOrder[0]).toBeLessThan(m.download.mock.invocationCallOrder[0]);
    expect(m.info.mock.invocationCallOrder[1]).toBeLessThan(m.serviceRpc.mock.invocationCallOrder[0]);
  });
  it.each([null, { actorId: 11 }, { actorId: -1, authSessionId: object.id }])("denies missing or invalid current principal %j", async data => {
    m.rpc.mockResolvedValue({ data, error: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("authority");
    expect(m.original).not.toHaveBeenCalled(); expect(m.serviceRpc).not.toHaveBeenCalled();
  });
  it("never falls back to service authority after authenticated RPC denial", async () => {
    m.rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    await expect(attestStoredOutput(command)).rejects.toThrow("authority"); expect(m.download).not.toHaveBeenCalled();
  });
  it("denies a different original owner before reading bytes", async () => {
    m.original.mockResolvedValue({ data: { storage_path: "synthetic/7.pdf", generated_by: 12 }, error: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("identity"); expect(m.download).not.toHaveBeenCalled();
  });
  it.each([0, 33554433])("denies out-of-bounds bytes %d without attesting", async size => {
    m.download.mockResolvedValue({ data: { size, arrayBuffer: vi.fn() }, error: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("bounds"); expect(m.serviceRpc).not.toHaveBeenCalled();
  });
  it("denies different bytes despite a successful Storage response", async () => {
    m.download.mockResolvedValue({ data: new Blob(["different bytes"]), error: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("retained rendering"); expect(m.serviceRpc).not.toHaveBeenCalled();
  });
  it.each(["version", "id", "lastModified"] as const)("denies changed object %s", async key => {
    const changed = { ...object, [key]: key === "id" ? "f0800000-0000-4000-8000-000000000003" : key === "lastModified" ? "2026-10-18T00:00:01.123Z" : "v2" };
    m.info.mockResolvedValueOnce({ data: object, error: null }).mockResolvedValueOnce({ data: changed, error: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("changed"); expect(m.serviceRpc).not.toHaveBeenCalled();
  });
  it("treats lost service confirmation as unconfirmed, never issued", async () => {
    m.serviceRpc.mockResolvedValue({ error: new Error("response lost"), data: null });
    await expect(attestStoredOutput(command)).rejects.toThrow("Retain this issuance for recovery");
  });
  it.each([finalizeVerifiedOutput, activateVerifiedOutput])("requires exact returned identity for lifecycle success", async operation => {
    m.rpc.mockResolvedValue({ error: null, data: { id: 8 } });
    await expect(operation(7, command.expectedSha256)).rejects.toThrow("not confirmed");
    m.rpc.mockResolvedValue({ error: null, data: { id: 7 } });
    await expect(operation(7, command.expectedSha256)).resolves.toBeUndefined();
  });
});
