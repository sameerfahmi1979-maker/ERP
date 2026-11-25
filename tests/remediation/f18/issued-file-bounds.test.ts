import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  record: {} as Record<string, unknown>,
  body: Buffer.alloc(0),
  originalBytesRead: 0,
  streamCancelled: false,
  access: vi.fn(),
  downloads: 0,
  abortDuringRead: null as (() => void) | null,
  audit: vi.fn(),
}));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({profile: {id: 7}}),
  canUseApplication: () => true,
}));
vi.mock("@/lib/output/issued-file-access", () => ({canAccessIssuedFile: m.access}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data:m.record, error:null})})})}),
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: () => ({
        download: () => {
          m.downloads++;
          return {
            then: (done: (result: unknown) => void) => {
              m.originalBytesRead = m.body.length;
              done({data: new Blob([Uint8Array.from(m.body)]), error:null});
            },
            asStream: async () => ({
              error: null,
              data: new ReadableStream<Uint8Array>({
                pull(controller) {
                  if (m.originalBytesRead === m.body.length) { controller.close(); return; }
                  m.abortDuringRead?.();
                  const end = Math.min(m.originalBytesRead+32,m.body.length);
                  controller.enqueue(m.body.subarray(m.originalBytesRead,end));
                  m.originalBytesRead = end;
                },
                cancel() { m.streamCancelled = true; },
              }, {highWaterMark:0}),
            }),
          };
        },
      }),
    },
    from: () => ({insert: m.audit}),
  }),
}));
import { deliverIssuedFile } from "@/server/issued-file-delivery";

beforeEach(() => {
  m.body = Buffer.alloc(32,7);
  m.originalBytesRead = 0;
  m.streamCancelled = false;
  m.downloads = 0;
  m.abortDuringRead = null;
  m.record = {
    storage_path: "synthetic/retained.pdf", file_name: "synthetic.pdf",
    checksum: createHash("sha256").update(m.body).digest("hex"),
    file_size_bytes: m.body.length, lifecycle_state: "issued", owner_company_id: 1,
    source_record_type:"employee", source_record_id: 3,
  };
  m.access.mockReset().mockResolvedValue(true);
  m.audit.mockReset().mockResolvedValue({error:null});
});

it("bounds a 32-byte manifest before reading a 4-MiB original and skips its audit", async () => {
  m.body=Buffer.alloc(4*1024*1024,7);
  expect((await deliverIssuedFile(5)).status).toBe(409);
  expect(m.originalBytesRead).toBe(64);
  expect(m.streamCancelled).toBe(true);
  expect(m.audit).not.toHaveBeenCalled();
});

it("delivers exactly the authorized retained bytes and one audit",async()=>{
  const response=await deliverIssuedFile(5);
  expect(response.status).toBe(200);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(m.body);
  expect(m.access).toHaveBeenCalledTimes(2);
  expect(m.audit).toHaveBeenCalledTimes(1);
});

it("rechecks revocation before return",async()=>{
  m.access.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  expect((await deliverIssuedFile(5)).status).toBe(404);
  expect(m.audit).not.toHaveBeenCalled();
});

it("rechecks the bound HEAD but does not read Storage or write an audit",async()=>{
  const response = await deliverIssuedFile(5,{employeeId:3,checksum:String(m.record.checksum),mode:"preview"},true);
  expect(response.status).toBe(200);
  expect(response.headers.get("X-HR-Issued-Bytes")).toBe("32");
  expect(m.access).toHaveBeenCalledTimes(2);
  expect(m.downloads).toBe(0);
  expect(m.audit).not.toHaveBeenCalled();
});

it("retires a disconnected request before authorization recheck and audit",async()=>{
  const controller=new AbortController();
  m.abortDuringRead=()=>controller.abort("synthetic requester reason");
  const response=await deliverIssuedFile(5,undefined,false,controller.signal);
  expect(response.status).toBe(400);
  expect(await response.text()).not.toContain("synthetic requester reason");
  expect(m.audit).not.toHaveBeenCalled();
});