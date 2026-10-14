import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {RECRUITMENT_INQUIRY_KINDS, recruitmentReadIdentity, type RecruitmentInquiryKind} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {LoadError} from "@/components/erp/load-error";
import RequisitionsPage from "@/app/(protected)/admin/hr/recruitment/requisitions/page";
import CandidatesPage from "@/app/(protected)/admin/hr/recruitment/candidates/page";
import InterviewsPage from "@/app/(protected)/admin/hr/recruitment/interviews/page";
import OffersPage from "@/app/(protected)/admin/hr/recruitment/offers/page";
import OnboardingPage from "@/app/(protected)/admin/hr/recruitment/onboarding/page";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", async original => ({...await original<typeof import("@/lib/rbac/check")>(), getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-recruitment-inquiries", () => ({readRecruitmentInquiry: state.read}));
vi.mock("next/navigation", () => ({redirect: state.redirect}));
const context = {profile: {id: 6, auth_user_id: "owned-synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: [], roleCodes: ["system_admin"], roleAssignments: [{roleId: 880101, roleCode: "system_admin", ownerCompanyId: null, branchId: null, permissionCodes: []}]} as unknown as AuthContext;
const pages: Record<RecruitmentInquiryKind, () => Promise<React.ReactElement<Record<string, unknown>>>> = {requisitions: RequisitionsPage, candidates: CandidatesPage, interviews: InterviewsPage, offers: OffersPage, onboarding: OnboardingPage};
const payload = (kind: RecruitmentInquiryKind) => ({success: true, data: {kind, rows: [], totalCount: 0, page: 1, pageSize: 25}, updatedAt: 1791127000000});
afterEach(() => {state.auth.mockReset(); state.read.mockReset(); state.redirect.mockClear();});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s server seed reuses the validated request-local context", async kind => {
  state.auth.mockResolvedValue(context); state.read.mockResolvedValue(payload(kind)); const result = await pages[kind]();
  expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledWith({kind}, context); expect(state.read).toHaveBeenCalledTimes(1);
  expect(result.props).toMatchObject({authContext: context, initialPage: payload(kind).data, initialReadIdentity: recruitmentReadIdentity(context), initialUpdatedAt: payload(kind).updatedAt});
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s initial failure or wrong-kind data produces honest retry UI", async kind => {
  state.auth.mockResolvedValue(context);
  for (const response of [{success: false}, payload(kind === "candidates" ? "offers" : "candidates")]) {
    state.read.mockResolvedValue(response); const result = await pages[kind](); expect(result.type).toBe(LoadError); expect(result.props.retryHref).toBe("/admin/hr/recruitment/" + kind); expect(result.props.initialPage).toBeUndefined();
  }
});
for (const mode of ["no-role", "signed-out", "suspended", "forced-password"] as const) it.each(RECRUITMENT_INQUIRY_KINDS)("%s refuses " + mode + " before business reads", async kind => {
  state.auth.mockResolvedValue(mode === "signed-out" ? null : mode === "no-role" ? {...context, permissionCodes: [], roleCodes: [], roleAssignments: []} : mode === "suspended" ? {...context, isAccountActive: false} : {...context, profile: {...context.profile!, must_change_password: true}});
  await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
