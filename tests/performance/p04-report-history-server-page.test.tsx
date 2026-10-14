import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
import {reportHistoryIdentity} from "@/lib/reads/report-history-schema";
const state = vi.hoisted(() => ({auth: vi.fn(), read: vi.fn(), redirect: vi.fn((url: string) => {throw Error("REDIRECT:" + url);})}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: state.auth}));
vi.mock("@/server/reads/report-history", () => ({readReportHistory: state.read}));
vi.mock("@/features/report-center/report-history-page", () => ({ReportHistoryPage: () => null}));
vi.mock("next/navigation", () => ({redirect: state.redirect}));
import Page from "@/app/(protected)/admin/reports/history/page";
const context = {profile: {id: 6, auth_user_id: "synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: ["reports.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
afterEach(() => {state.auth.mockReset(); state.read.mockReset(); state.redirect.mockClear();});
it.each(["reports.view", "reports.history.view"])("SSR %s shares one live auth context and a principal-bound seed", async permission => {
  const ctx = {...context, permissionCodes: [permission]}, data = {mode: "list", page: 1, pageSize: 25, totalCount: 0, rows: []}; state.auth.mockResolvedValue(ctx); state.read.mockResolvedValue({success: true, data, updatedAt: 123});
  const result = await Page(), child = result.props.children as React.ReactElement<Record<string, unknown>>;
  expect(state.auth).toHaveBeenCalledTimes(1); expect(state.read).toHaveBeenCalledWith({}, ctx); expect(child.props).toMatchObject({authContext: ctx, initialPage: data, initialUpdatedAt: 123, initialReadIdentity: reportHistoryIdentity(ctx)});
});
it("failed initial read leaves data unknown for the client's honest retry path", async () => {
  state.auth.mockResolvedValue(context); state.read.mockResolvedValue({success: false}); const result = await Page(), child = result.props.children as React.ReactElement<Record<string, unknown>>;
  expect(child.props.initialPage).toBeUndefined(); expect(child.props.initialUpdatedAt).toBeUndefined();
});
it.each(["signed-out", "no-role", "suspended", "forced-password"])("%s retains the existing redirect before a business read", async kind => {
  state.auth.mockResolvedValue(kind === "signed-out" ? {...context, profile: null, email: null, accountStatus: "none", isAccountActive: false, permissionCodes: []} : kind === "no-role" ? {...context, permissionCodes: []} : kind === "suspended" ? {...context, isAccountActive: false} : {...context, profile: {...context.profile!, must_change_password: true}});
  await expect(Page()).rejects.toThrow("REDIRECT:/admin/reports"); expect(state.read).not.toHaveBeenCalled();
});
