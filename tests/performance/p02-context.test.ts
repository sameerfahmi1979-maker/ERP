import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({auth: vi.fn()}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: state.auth}));
import { getReadAuthContext, withReadRequest } from "@/server/reads/read-context";
import { readScopeVersion } from "@/lib/reads/scope-version";
import type { AuthContext } from "@/lib/rbac/check";
afterEach(() => vi.resetAllMocks());
it("coalesces authority only inside one explicit request; next request rechecks", async () => {
  state.auth.mockResolvedValueOnce({isAccountActive: true}).mockResolvedValueOnce({isAccountActive: false});
  await withReadRequest(async () => {const [a,b] = await Promise.all([getReadAuthContext(), getReadAuthContext()]); expect(a).toBe(b); expect(a.isAccountActive).toBe(true);});
  expect((await withReadRequest(getReadAuthContext)).isAccountActive).toBe(false);
  expect(state.auth).toHaveBeenCalledTimes(2);
});
it("isolates simultaneous requests and nested request owners", async () => {
  state.auth.mockImplementation(async () => ({nonce: Math.random()}));
  const [a,b] = await Promise.all([withReadRequest(getReadAuthContext), withReadRequest(getReadAuthContext)]);
  expect(a).not.toBe(b);
  await withReadRequest(async () => {const outer = await getReadAuthContext(); const inner = await withReadRequest(getReadAuthContext); expect(inner).not.toBe(outer); expect(await getReadAuthContext()).toBe(outer);});
  expect(state.auth).toHaveBeenCalledTimes(4);
});
it("does not memoize authority outside explicit scope or in escaped background work", async () => {
  state.auth.mockResolvedValue({});
  await getReadAuthContext(); await getReadAuthContext();
  let release!: () => void;
  const wait = new Promise<void>(resolve => {release = resolve;});
  let escaped!: Promise<unknown>;
  await withReadRequest(async () => {await getReadAuthContext(); escaped = (async () => {await wait; return getReadAuthContext();})();});
  release(); await escaped; expect(state.auth).toHaveBeenCalledTimes(4);
});
it("contains rejection within request and re-verifies the next request", async () => {
  state.auth.mockRejectedValueOnce(Error("denied")).mockResolvedValue({isAccountActive: true});
  await withReadRequest(async () => {const result = await Promise.allSettled([getReadAuthContext(), getReadAuthContext()]); expect(result.every(r => r.status === "rejected")).toBe(true);});
  expect((await withReadRequest(getReadAuthContext)).isAccountActive).toBe(true); expect(state.auth).toHaveBeenCalledTimes(2);
});
it("scope generation changes on permission/role revocation and status, but not order", () => {
  const ctx: AuthContext = {profile: null, email: null, accountStatus: "active", isAccountActive: true, roleCodes: ["A","B"], permissionCodes: ["read","write"], globalPermissionCodes: ["x"]};
  const first = readScopeVersion(ctx);
  expect(readScopeVersion({...ctx, roleCodes:["B","A"], permissionCodes:["write","read"]})).toBe(first);
  for (const update of [{permissionCodes:["read"]},{globalPermissionCodes:[]},{roleCodes:["A"]},{accountStatus:"suspended" as const},{isAccountActive:false}]) expect(readScopeVersion({...ctx,...update})).not.toBe(first);
});
