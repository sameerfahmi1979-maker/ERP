import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { withMobileToken } from "@/lib/supabase/mobile-request";
import sharp from "sharp";
import {
  readCommunicationAvatar, readCommunicationDirectory, readLinkedCommunicationIdentity, requireCommunicationActor,
} from "../access";

const authId = "3b3ae7b3-960f-432e-a5a3-6d1596e0b21a";
const authSession = "4bf70ed0-254a-4144-b91b-1256c89d7940";
const bearer = "test.access.token";
const calls: string[] = [];
let validSession: boolean;
let forcedPassword: boolean;
let status: string;
let actorProfile: string;
let roleCode: string;
let directoryData: unknown;
let failure: string | undefined;
let linked: unknown;
let avatarBindings: unknown[];
const hr = vi.hoisted(() => ({ preview: vi.fn(), source: vi.fn() }));
vi.mock("@/server/hr-photo-delivery", () => ({ deliverSubjectPhoto: hr.preview }));
vi.mock("@/server/mobile/hr-photo", () => ({ subjectPhoto: hr.source }));
const run = <T>(fn: () => Promise<T>) => withMobileToken(bearer, fn);

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://communications-test.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-publishable-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-server-only-key");
  vi.stubEnv("ERP_COMM_CHAT_ENABLED","true");
  validSession = true;
  forcedPassword = false;
  status = "active";
  actorProfile = "19";
  roleCode = "group_admin";
  failure = undefined;
  calls.length = 0;
  directoryData = { items: [], nextCursor: null };
  linked = null;
  avatarBindings = [];
  hr.preview.mockReset();
  hr.source.mockReset();
  // Only replace network I/O. The real Supabase request client, ERP getAuthContext,
  // scope validation and mobile bearer binding run through their production paths.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    calls.push(path);
    const json = (value: unknown) => Response.json(value);
    if (path === "/auth/v1/user") {
      expect(req.headers.get("authorization")).toBe(`Bearer ${bearer}`);
      return json({ id: authId, aud: "authenticated", role: "authenticated" });
    }
    if (path === "/rest/v1/rpc/f03_current_session_valid") return json(validSession);
    if (path === "/rest/v1/user_profiles") {
      expect(new URL(req.url).searchParams.get("auth_user_id")).toBe(`eq.${authId}`);
      return json({ id: 19, auth_user_id: authId, must_change_password: forcedPassword, status });
    }
    if (path === "/rest/v1/user_roles") return json([
      { role_id: 7, owner_company_id: null, branch_id: null },
      { role_id: 8, owner_company_id: 10, branch_id: 11 },
      { role_id: 8, owner_company_id: 20, branch_id: 21 },
    ]);
    if (path === "/rest/v1/roles") return json([{ id: 7, role_code: roleCode }, { id: 8, role_code: "staff" }]);
    if (path === "/rest/v1/role_permissions") return json([]);
    if (path === "/rest/v1/rpc/erp_comm_budget_command") {
      const {p_command,p_payload}=await req.json();
      expect(p_command).toBe("reserve");
      expect(p_payload).toMatchObject({actorId:actorProfile,scope:"communications",feature:"chat",binding:{actorSessionId:authSession}});
      return json({ok:true,permitId:"42b145be-047f-48e4-8212-eaba638a0f8d",newReservation:true,expiresAt:new Date(Date.now()+120000).toISOString()});
    }
    if (path === "/rest/v1/rpc/erp_chat_v1") {
      expect(req.headers.get("authorization")).toBe(`Bearer ${bearer}`);
      const { p_request: command } = await req.json();
      if (command.op!=="chat.actor") expect(command._budgetPermitId).toBe("42b145be-047f-48e4-8212-eaba638a0f8d");
      if (failure) return Response.json({ code: failure, message: "Private backend detail" }, { status: 403 });
      switch (command.op) {
        case "chat.actor":
          expect(command.args).toEqual({});
          return json({ profileId: actorProfile, authUserId: authId, authSessionId: authSession,
            isGlobalSystemAdmin: roleCode === "system_admin" });
        case "chat.directory": return json(directoryData);
        case "chat.linkedIdentity": expect(command.args).toEqual({ employeeId: "313" }); return json(linked);
        case "chat.avatarBinding": return json(avatarBindings.shift() ?? null);
      }
    }
    throw new Error(`Unexpected request ${req.method} ${path}`);
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("ERP communication actor", () => {
  it("binds the checked ERP and Auth session without elevating the legacy group_admin", async () => {
    expect(await run(requireCommunicationActor)).toEqual({
      profileId: "19", authUserId: authId, authSessionId: authSession, isGlobalSystemAdmin: false,
    });
    expect(calls).toContain("/rest/v1/rpc/f03_current_session_valid");
    expect(calls.indexOf("/auth/v1/user")).toBeLessThan(calls.indexOf("/rest/v1/rpc/erp_chat_v1"));
  });
  it("uses the SQL result for the reserved administrator", async () => {
    roleCode = "system_admin";
    expect((await run(requireCommunicationActor)).isGlobalSystemAdmin).toBe(true);
  });
  it("denies a mixed actor response", async () => {
    actorProfile = "18";
    await expect(run(requireCommunicationActor)).rejects.toMatchObject({ status: 401 });
  });
  it("rejects an ended Auth session before loading any privileged profile", async () => {
    validSession = false;
    await expect(run(requireCommunicationActor)).rejects.toMatchObject({ status: 401 });
    expect(calls).not.toContain("/rest/v1/user_profiles");
  });
  it.each(["inactive", "suspended", "forced"])("denies %s before communications SQL", async reason => {
    forcedPassword = reason === "forced";
    status = forcedPassword ? "active" : reason;
    await expect(run(requireCommunicationActor)).rejects.toMatchObject({ status: 403 });
    expect(calls).not.toContain("/rest/v1/rpc/erp_chat_v1");
  });
});

describe("work projection", () => {
  it("returns only work fields, omitting raw HR photo paths and sensitive attributes", async () => {
    directoryData = { items: [
      { profileId: "20", name: "Across companies", photoRef: "https://external.invalid/image",
        employeeId: 887, salary: 10000, email: "private@example.invalid", jobTitle: "Driver", companyName: "B" },
      { profileId: "21", name: "Unlinked account", photoRef: "/api/mobile/communications/v1/avatars/20" },
      { profileId: "22", name: "Verified photo", photoRef: "/api/mobile/communications/v1/avatars/22" },
    ], nextCursor: null };
    const page = await run(() => readCommunicationDirectory({ query: "employee" }));
    expect(JSON.parse(JSON.stringify(page.items))).toEqual([
      { profileId: "20", name: "Across companies", jobTitle: "Driver", companyName: "B" },
      { profileId: "21", name: "Unlinked account" },
      { profileId: "22", name: "Verified photo", photoRef: "/api/mobile/communications/v1/avatars/22" },
    ]);
  });
  it("keeps actor bootstrap available but denies directory work when cost admission is disabled",async()=>{
    vi.stubEnv("ERP_COMM_CHAT_ENABLED","false");
    await expect(run(requireCommunicationActor)).resolves.toMatchObject({profileId:"19"});
    await expect(run(()=>readCommunicationDirectory({}))).rejects.toMatchObject({status:503});
    expect(calls).not.toContain("/rest/v1/rpc/erp_comm_budget_command");
  });
  it("returns no shortcut for a missing or disallowed employee link", async () => {
    expect(await run(() => readLinkedCommunicationIdentity(313))).toBeNull();
  });
  it("does not expose private HR fields on a valid reverse link", async () => {
    linked = { name: "Official Employee", profileId: "20", employeeId: 313, emergencyContact: "Private" };
    const result = await run(() => readLinkedCommunicationIdentity(313));
    expect(JSON.parse(JSON.stringify(result))).toEqual({ name: "Official Employee", profileId: "20" });
  });
  it("rejects nondecimal IDs, DB overflow and caller-supplied authority", async () => {
    for (const invalid of ["1e3", "-1", "9223372036854775808"]) {
      await expect(run(() => readCommunicationAvatar(invalid))).rejects.toMatchObject({ status: 400 });
    }
    const extra = { query: "A", actorProfileId: "1" };
    await expect(run(() => readCommunicationDirectory(extra))).rejects.toMatchObject({ status: 400 });
    expect(calls).toHaveLength(0);
  });
  it("refuses a missing/revoked official photo binding", async () => {
    await expect(run(() => readCommunicationAvatar("18"))).rejects.toMatchObject({ status: 404 });
  });
  it.each(["same", "transferred", "photo changed"])("validates official photo source after resizing: %s", async change => {
    avatarBindings = [{ employeeId: "313" }, { employeeId: change === "transferred" ? "999" : "313" }];
    const source = { documentId: 4, versionId: 3, fileId: 7, fingerprint: "original", canDownload: false };
    hr.source.mockResolvedValueOnce(source).mockResolvedValue({ ...source, fingerprint: change === "photo changed" ? "new" : "original" });
    const bytes = await sharp({ create: { width: 240, height: 300, channels: 3, background: "blue" } }).png().toBuffer();
    hr.preview.mockResolvedValue(new Response(new Uint8Array(bytes), { headers: { "X-HR-Employee-Id": "313" } }));
    const request = run(() => readCommunicationAvatar("18"));
    if (change === "same") {
      const response = await request;
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.has("X-HR-Employee-Id")).toBe(false);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
      expect(metadata).toMatchObject({ width: 128, height: 128, format: "jpeg" });
      expect(metadata.exif).toBeUndefined();
    } else {
      await expect(request).rejects.toMatchObject({ status: 404 });
    }
    expect(hr.preview).toHaveBeenCalledWith(313, null, "preview", source);
  });
  it("returns bounded errors without leaking backend text", async () => {
    failure = "42501";
    await expect(run(() => readCommunicationDirectory({}))).rejects.toMatchObject({
      status: 403, message: "ERP access is unavailable for this account.",
    });
    failure = "PGRST202";
    await expect(run(() => readCommunicationDirectory({}))).rejects.toMatchObject({ status: 503 });
  });
});
