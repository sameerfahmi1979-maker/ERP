import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {PAYROLL_INQUIRY_KINDS, payrollInquiryIdentity} from "@/lib/reads/hr-payroll-inquiries-schema";
import {payrollInquiryContext as context, payrollInquiryPage} from "./hr-payroll-inquiry-fixtures";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: state.auth}));
vi.mock("@/server/reads/hr-payroll-inquiries", () => ({readPayrollInquiry: state.read}));
vi.mock("next/navigation", () => ({redirect: state.redirect}));
import SalaryPage from "@/app/(protected)/admin/hr/payroll/salaries/page";
import WpsPage from "@/app/(protected)/admin/hr/payroll/wps/page";
const pages = {salary: SalaryPage, wps: WpsPage};
afterEach(() => {state.auth.mockReset(); state.read.mockReset(); state.redirect.mockClear();});
it.each(PAYROLL_INQUIRY_KINDS)("%s server uses the same reader/context and an identity-owned seed", async kind => {
  state.auth.mockResolvedValue(context); const data = payrollInquiryPage({kind}, {count: 0}); state.read.mockResolvedValue({success: true, data, updatedAt: 123}); const result = await pages[kind]() as React.ReactElement<Record<string, unknown>>;
  expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledExactlyOnceWith({kind}, context); expect(result.props).toMatchObject({authContext: context, initialPage: data, initialUpdatedAt: 123, initialReadIdentity: payrollInquiryIdentity(context), initialReadError: false});
});
it.each(PAYROLL_INQUIRY_KINDS)("%s failed bootstrap is an explicit manual-retry state, not zero rows", async kind => {
  state.auth.mockResolvedValue(context); state.read.mockResolvedValue({success: false, error: "Unavailable"}); const result = await pages[kind]() as React.ReactElement<Record<string, unknown>>; expect(result.props.initialReadError).toBe(true); expect(result.props.initialPage).toBeUndefined();
});
for (const mode of ["none", "signed-out", "suspended", "password"] as const) it.each(PAYROLL_INQUIRY_KINDS)("%s rejects " + mode + " before business RPC", async kind => {
  state.auth.mockResolvedValue(mode === "signed-out" ? null : mode === "suspended" ? {...context, isAccountActive: false} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, permissionCodes: [], roleAssignments: []});
  await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
it("server banking gate is independent of salary capability", async () => {
  state.auth.mockResolvedValue({...context, permissionCodes: ["hr.payroll.view"], roleAssignments: []}); state.read.mockResolvedValue({success: false, error: "Unavailable"}); await SalaryPage(); state.read.mockClear(); await expect(WpsPage()).rejects.toThrow("REDIRECT:/access-denied"); expect(state.read).not.toHaveBeenCalled();
});
it.each(PAYROLL_INQUIRY_KINDS)("%s native access loss redirects without a leaked seed", async kind => {
  state.auth.mockResolvedValue(context); state.read.mockResolvedValue({success: false, error: "Permission denied"}); await expect(pages[kind]()).rejects.toThrow("REDIRECT:/access-denied");
});
