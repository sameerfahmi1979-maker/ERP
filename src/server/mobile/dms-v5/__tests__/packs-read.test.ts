import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { POST } from "@/app/api/mobile/dms/v1/route";
import { packs } from "../packs";

const ports = vi.hoisted(() => ({ auth: vi.fn(), client: vi.fn(), canonical: vi.fn() }));
vi.mock("@/lib/rbac/check", async load => ({
  ...await load<typeof import("@/lib/rbac/check")>(), getAuthContext: ports.auth,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: ports.client }));
vi.mock("@/server/actions/dms/selected-download", () => ({ getSelectedDmsDownloadFiles: ports.canonical }));

const actor = {
  profile: { id: 7, auth_user_id: "synthetic-actor", must_change_password: false },
  isAccountActive: true,
} as AuthContext;
const checksum = "1".repeat(64);
const documentHash = "2".repeat(64);
const input = { op: "documentPackManifest", format: "zip", documentIds: [2, 1] } as const;
type SourceSelection = { documentId: number; fileId?: number; sourceHash?: string };

function fixture(change?: (args: SourceSelection) => { code: string } | void) {
  const metadata = [{ id: 1, document_no: "S-1" }, { id: 2, document_no: "S-2" }];
  const files = [1, 2].map(documentId => ({
    id: documentId + 10, document_id: documentId, version_id: documentId + 20, file_name: "original.pdf",
    file_size_bytes: 30, mime_type: "application/pdf", sha256_hash: checksum,
  }));
  ports.canonical.mockResolvedValue({ success: true, files: files.map(file => ({
    id: file.id, folder: `S-${file.document_id}`, name: file.file_name, size: file.file_size_bytes,
  })) });
  const rpc = vi.fn((name: string, args: { p_caps: string[]; p_data: SourceSelection }) => {
    expect(name).toBe("mobile_dms_source");
    expect(args.p_caps).toEqual(["dms.documents.download"]);
    const run = async () => {
      const selection = args.p_data;
      const error = change?.(selection);
      if (error) return { error };
      return { data: { documentId: selection.documentId, documentVersionId: selection.documentId + 20,
        documentRevision: "r", fileId: selection.fileId ?? null, fileSha256: selection.fileId ? checksum : null,
        sourceHash: documentHash } };
    };
    return { then: (accept: () => unknown, reject: () => unknown) => run().then(accept, reject),
      abortSignal(signal: AbortSignal) { return run().then(result => { signal.throwIfAborted(); return result; }); } };
  });
  const query = (data: unknown) => {
    const chain = {
      select: () => chain, in: () => chain, is: () => chain, order: () => chain,
      abortSignal: () => chain,
      then: (accept: () => unknown, reject: () => unknown) => Promise.resolve({ data }).then(accept, reject),
    };
    return chain;
  };
  ports.client.mockResolvedValue({ rpc, from(name: string) { return query(name === "dms_documents" ? metadata : files); } });
  return rpc;
}

describe("mobile source-bound pack reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    ports.auth.mockResolvedValue(actor);
  });

  it("checks the current actor at the validation boundary while retaining every ordered source check", async () => {
    const rpc = fixture();
    const manifest = await packs({ ...input, documentIds: [...input.documentIds] }, actor);
    expect(manifest).toMatchObject({ documents: [{ id: 2 }, { id: 1 }], files: [{ id: 12 }, { id: 11 }] });
    expect(ports.auth).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls.map(([, { p_data }]) => [p_data.documentId, p_data.fileId ?? null, p_data.sourceHash ?? null])).toEqual([
      [2, null, null], [2, 12, null], [1, null, null], [1, 11, null],
      [2, null, documentHash], [2, 12, documentHash], [1, null, documentHash], [1, 11, documentHash],
    ]);
  });

  it.each([["PT409", 409], ["42501", 403]] as const)("withholds the pack when the final exact file check returns %s", async (code, status) => {
    fixture(({ fileId, sourceHash }) => fileId === 11 && sourceHash ? { code } : undefined);
    await expect(packs({ ...input, documentIds: [...input.documentIds] }, actor)).rejects.toMatchObject({ status });
  });

  it("withholds an otherwise current pack if the route's final actor check changes", async () => {
    const rpc = fixture();
    ports.auth.mockResolvedValueOnce(actor).mockResolvedValueOnce(actor)
      .mockResolvedValue({ ...actor, profile: { ...actor.profile, id: 8 } });
    const response = await POST(new Request("http://127.0.0.1/api/mobile/dms/v1", {
      method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer a.b.c" }, body: JSON.stringify(input),
    }));
    expect(rpc).toHaveBeenCalledTimes(8);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ success: false, error: "Current access is required.", code: "permission_denied" });
  });

  it("stops the exact pack recheck on HTTP cancellation without exposing a partial manifest", async () => {
    const controller = new AbortController();
    const rpc = fixture(({ sourceHash }) => { if (sourceHash) controller.abort(); });
    const response = await POST(new Request("http://127.0.0.1/api/mobile/dms/v1", {
      method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer a.b.c" },
      body: JSON.stringify(input), signal: controller.signal,
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false });
    expect(rpc).toHaveBeenCalledTimes(5);
  });
});
