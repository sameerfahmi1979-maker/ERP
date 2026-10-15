// @vitest-environment jsdom
import {cleanup, render} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({ctx: {} as AuthContext, auth: vi.fn(), types: vi.fn(), client: vi.fn()}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: () => {state.auth(); return Promise.resolve(state.ctx);}}));
vi.mock("next/navigation", () => ({redirect: (url: string) => {throw Error(`redirect:${url}`);}}));
vi.mock("@/server/actions/dms/browser", () => ({getDmsBrowserDocumentTypes: () => state.types()}));
vi.mock("@/features/dms/browser/dms-browser-page-client", () => ({DmsBrowserPageClient: (props: unknown) => {state.client(props); return null;}}));
import Page from "@/app/(protected)/admin/dms/browser/page";
beforeEach(() => {state.ctx = {profile: {id: 1, must_change_password: false}, isAccountActive: true, roleCodes: [], permissionCodes: ["dms.documents.view"], roleAssignments: []} as unknown as AuthContext;});
afterEach(() => {cleanup(); vi.clearAllMocks();});
it("SSR passes its already-resolved principal without an eager untyped catalogue or duplicate source read", async () => {
  render(await Page()); expect(state.auth).toHaveBeenCalledTimes(1); expect(state.types).not.toHaveBeenCalled(); expect(state.client).toHaveBeenCalledWith({authContext: state.ctx});
});
it("SSR retains its existing denied-user redirect", async () => {
  state.ctx.permissionCodes = []; await expect(Page()).rejects.toThrow("redirect:/access-denied"); expect(state.types).not.toHaveBeenCalled(); expect(state.client).not.toHaveBeenCalled();
});
