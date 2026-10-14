import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {HR_ACTION_INQUIRY_KINDS, hrActionInquiryIdentity, type HrActionInquiryKind} from "@/lib/reads/hr-action-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";
import ProPage from "@/app/(protected)/admin/hr/actions/pro/page";
import DisciplinaryPage from "@/app/(protected)/admin/hr/actions/disciplinary/page";
import ApprovalsPage from "@/app/(protected)/admin/hr/actions/approvals/page";
import EosPage from "@/app/(protected)/admin/hr/actions/eos/page";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", async original => ({...await original<typeof import("@/lib/rbac/check")>(), getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-action-inquiries", () => ({readHrActionInquiry: state.read}));
vi.mock("next/navigation", () => ({redirect: state.redirect}));
const context = {profile: {id: 6, auth_user_id: "owned-synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: [], roleCodes: ["system_admin"], roleAssignments: [{roleId: 880101, roleCode: "system_admin", ownerCompanyId: null, branchId: null, permissionCodes: []}]} as unknown as AuthContext;
const pages: Record<HrActionInquiryKind, () => Promise<React.ReactElement<Record<string, unknown>>>> = {pro: ProPage, disciplinary: DisciplinaryPage, approvals: ApprovalsPage, eos: EosPage};
const payload = (kind: HrActionInquiryKind) => ({success: true, data: {kind, rows: [], totalCount: 0, page: 1, pageSize: 25}, updatedAt: 1791127000000});
afterEach(() => {state.auth.mockReset(); state.read.mockReset(); state.redirect.mockClear();});
it.each(HR_ACTION_INQUIRY_KINDS)("%s initial server read reuses the validated context and exact seed identity", async kind => {
  state.auth.mockResolvedValue(context); state.read.mockResolvedValue(payload(kind)); const result = await pages[kind]();
  expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledWith({kind}, context); expect(state.read).toHaveBeenCalledTimes(1);
  expect(result.props).toMatchObject({authContext: context, initialPage: payload(kind).data, initialReadIdentity: hrActionInquiryIdentity(context), initialUpdatedAt: payload(kind).updatedAt});
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s failed or wrong-kind initial data renders an honest retry page", async kind => {
  state.auth.mockResolvedValue(context);
  for (const response of [{success: false}, payload(kind === "pro" ? "eos" : "pro")]) {
    state.read.mockResolvedValue(response); const result = await pages[kind](); expect(result.type).toBe(LoadError); expect(result.props.retryHref).toBe("/admin/hr/actions/" + kind); expect(result.props.initialPage).toBeUndefined();
  }
});
for (const mode of ["no-role", "signed-out", "suspended", "forced-password"] as const) it.each(HR_ACTION_INQUIRY_KINDS)("%s refuses " + mode + " before business reads", async kind => {
  state.auth.mockResolvedValue(mode === "signed-out" ? null : mode === "no-role" ? {...context, permissionCodes: [], roleCodes: [], roleAssignments: []} : mode === "suspended" ? {...context, isAccountActive: false} : {...context, profile: {...context.profile!, must_change_password: true}});
  await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
it("EOS-only viewer receives EOS inquiry but no ordinary or confidential business data", async () => {
  state.auth.mockResolvedValue({...context, roleCodes: [], roleAssignments: [], permissionCodes: ["hr.eos.view"]}); state.read.mockResolvedValue(payload("eos"));
  expect((await EosPage()).props.initialPage).toEqual(payload("eos").data); state.read.mockClear();
  for (const kind of ["pro", "disciplinary", "approvals"] as const) await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
it("ordinary HR viewing does not grant the confidential discipline page", async () => {
  state.auth.mockResolvedValue({...context, roleCodes: [], roleAssignments: [], permissionCodes: ["hr.actions.view"]});
  await expect(DisciplinaryPage()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
