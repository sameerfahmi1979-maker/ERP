import {beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {candidateRecordIdentity} from "@/lib/reads/hr-candidate-record-schema";
import CandidateRecordPage from "@/app/(protected)/admin/hr/recruitment/candidates/record/[id]/page";
const state = vi.hoisted(() => ({read: vi.fn(), auth: vi.fn(), allowed: true}));
vi.mock("@/server/reads/hr-candidate-record", () => ({readCandidateRecord: state.read}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: state.auth, hasPermission: () => state.allowed}));
vi.mock("@/features/hr/recruitment/candidate-workspace-form", () => ({CandidateWorkspaceForm: () => null}));
vi.mock("next/navigation", () => ({notFound: () => {throw Error("NOT_FOUND");}, redirect: (path: string) => {throw Error(`REDIRECT:${path}`);}}));
const context = {profile: {id: 1, auth_user_id: "synthetic-ssr"}, roleCodes: [], permissionCodes: ["hr.recruitment.view"], isAccountActive: true, accountStatus: "active"} as unknown as AuthContext;
beforeEach(() => {state.read.mockReset(); state.auth.mockResolvedValue(context); state.allowed = true;});
it("SSR passes exact reader output with matching identity/time and reuses server auth context", async () => {
  const data = {kind: "record", candidate: {id: 42, workspace_revision: 7}, salaryAccess: {canView: false}};
  const before = Date.now(); state.read.mockResolvedValue({success: true, data, updatedAt: before});
  const element = await CandidateRecordPage({params: Promise.resolve({id: "42"})});
  expect(state.read).toHaveBeenCalledExactlyOnceWith({kind: "record", candidateId: 42}, context);
  expect(element.props.candidate).toBe(data.candidate); expect(element.props.initialRead.data).toBe(data);
  expect(element.props.initialRead.identity).toBe(candidateRecordIdentity(context)); expect(element.props.initialRead.updatedAt).toBeGreaterThanOrEqual(before);
});
it.each(["42extra", "-2", "0", "1e3", "9007199254740992"])("invalid route %s never reaches native record reading", async id => {
  await expect(CandidateRecordPage({params: Promise.resolve({id})})).rejects.toThrow("NOT_FOUND"); expect(state.read).not.toHaveBeenCalled();
});
it("definitive denial redirects without implying a missing record", async () => {
  state.read.mockResolvedValue({success: false, error: "Permission denied"});
  await expect(CandidateRecordPage({params: Promise.resolve({id: "42"})})).rejects.toThrow("REDIRECT:/access-denied");
});
it("ordinary failure reaches error handling instead of false not-found", async () => {
  state.read.mockResolvedValue({success: false, error: "Unavailable"});
  await expect(CandidateRecordPage({params: Promise.resolve({id: "42"})})).rejects.toThrow("could not be loaded");
});
