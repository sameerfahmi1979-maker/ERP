// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {NotificationsPageClient} from "@/features/notifications/notifications-page-client";
import {AdminNotificationsPageClient} from "@/features/notifications/admin/admin-notifications-page-client";
import {NotificationBell} from "@/components/erp/notification-bell";
import {notificationReadIdentity, type NotificationReadRow} from "@/lib/reads/notifications-schema";
import type {NotificationPageProps} from "@/hooks/use-notification-page";
import {ReadError} from "@/lib/reads/client";
const state = vi.hoisted(() => ({read: vi.fn(), action: vi.fn(), toast: vi.fn(), fetch: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("next/navigation", () => ({usePathname: () => "/notifications"}));
vi.mock("@/server/actions/notifications/notifications", () => ({markAllMyNotificationsRead: state.action, markNotificationRead: state.action, dismissNotification: state.action, archiveNotification: state.action}));
vi.mock("sonner", () => ({toast: {error: state.toast, success: state.toast}}));
const ctx = {profile: {id: 6, auth_user_id: "synthetic-notification-owner", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: [], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
const row = (id = 1): NotificationReadRow => ({id, notificationCode: `N-${id}`, sourceModule: "HR", sourceEntityType: null, sourceEntityId: null, notificationType: "test", severity: "info", title: `Synthetic notification ${id}`, message: `Synthetic message ${id}`, recipientUserId: 6, recipientRoleCode: null, recipientEmail: null, channelInApp: true, channelEmail: false, status: "unread", scheduledFor: "2026-10-14T00:00:00Z", readAt: null, dismissedAt: null, archivedAt: null, actionUrl: "/notifications", actionLabel: "Open", metadataJson: null, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z"});
const page = (rows = [row()], totalCount = rows.length, number = 1) => ({page: number, pageSize: 25, totalCount, rows});
const clients: QueryClient[] = [];
function mount(input: Partial<NotificationPageProps> = {}, admin = false) {
  const client = new QueryClient({defaultOptions: {queries: {retryDelay: 0}}}); clients.push(client);
  const props: NotificationPageProps = {authContext: ctx, initialPage: page(), initialIdentity: notificationReadIdentity(ctx), initialUpdatedAt: Date.now(), ...input};
  const tree = (p: NotificationPageProps) => <QueryClientProvider client={client}>{admin ? <AdminNotificationsPageClient {...p}/> : <NotificationsPageClient {...p}/>}</QueryClientProvider>;
  const view = render(tree(props)); return {...view, client, replace: (next: Partial<NotificationPageProps>) => view.rerender(tree({...props, ...next}))};
}
beforeEach(() => {state.fetch.mockImplementation(async () => ({ok: true, json: async () => ({success: true, data: {count: 1103}})})); vi.stubGlobal("fetch", state.fetch);});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); vi.unstubAllGlobals(); state.read.mockReset(); state.action.mockReset(); state.toast.mockReset(); state.fetch.mockReset();});
it("uses matching SSR seed and displays an independently verified whole-account unread count", async () => {
  mount(); await screen.findByText("1103 unread notifications"); expect(screen.getByText("Synthetic notification 1")).toBeTruthy(); expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByText("1 matching notifications")).toBeTruthy(); expect(screen.queryByText(/Showing up to 200/)).toBeNull();
});
it("next page requests native criteria rather than paging only a loaded subset", async () => {
  const rows = Array.from({length: 25}, (_, n) => row(n + 1));
  state.read.mockResolvedValue({success: true, data: page([row(26)], 26, 2)}); mount({initialPage: page(rows, 26)});
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("Synthetic notification 26");
  expect(state.read.mock.calls[0][1]).toMatchObject({page: 2, pageSize: 25, audience: "my"}); expect(screen.queryByText("Synthetic notification 1")).toBeNull();
});
it("typing masks old rows immediately and debounces the server search", async () => {
  state.read.mockResolvedValue({success: true, data: page([row(9)])}); mount(); const input = screen.getByPlaceholderText("Search notifications…");
  fireEvent.change(input, {target: {value: "one"}}); fireEvent.change(input, {target: {value: "two"}});
  expect(screen.queryByText("Synthetic notification 1")).toBeNull(); await screen.findByText("Synthetic notification 9");
  expect(state.read).toHaveBeenCalledTimes(1); expect(state.read.mock.calls[0][1]).toMatchObject({search: "two", page: 1});
});
it("refresh failure hides warm rows, leaves unknown count and allows retry", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); mount(); fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
  await screen.findByRole("alert"); expect(screen.queryByText("Synthetic notification 1")).toBeNull(); expect(screen.getAllByText("Count unavailable").length).toBeGreaterThan(0);
  state.read.mockResolvedValue({success: true, data: page([row(2)])}); fireEvent.click(screen.getByRole("button", {name: "Refresh"})); await screen.findByText("Synthetic notification 2");
});
it("account retirement aborts the pending page and late data cannot reappear", async () => {
  const finishes: Array<(value: unknown) => void> = []; state.read.mockImplementation(() => new Promise(resolve => finishes.push(resolve)));
  const view = mount({initialPage: undefined}); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); const signal = state.read.mock.calls[0][2] as AbortSignal;
  view.replace({authContext: {...ctx, profile: {...ctx.profile!, id: 7, auth_user_id: "another-synthetic-owner"}}}); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(signal.aborted).toBe(true);
  await act(async () => finishes[0]({success: true, data: page([row(8)])})); expect(screen.queryByText("Synthetic notification 8")).toBeNull();
  await act(async () => finishes[1]({success: true, data: page([row(9)])})); await screen.findByText("Synthetic notification 9");
});
it.each([401, 403])("denial %s clears warm records and does not retry the read", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); mount(); fireEvent.click(screen.getByRole("button", {name: "Refresh"}));
  await screen.findByText(/Your notification access could not be verified/); expect(screen.queryByText("Synthetic notification 1")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
});
it("suspension masks a seeded page before a new fetch", () => {
  mount({authContext: {...ctx, isAccountActive: false, accountStatus: "suspended"}}); expect(screen.getByRole("alert")).toBeTruthy(); expect(state.read).not.toHaveBeenCalled(); expect(screen.queryByText("Synthetic notification 1")).toBeNull();
});
it("administration route cannot expose seed data to an unprivileged owner", () => {
  mount({}, true); expect(screen.getByRole("alert")).toBeTruthy(); expect(screen.queryByText("Synthetic notification 1")).toBeNull(); expect(state.read).not.toHaveBeenCalled();
});
it("bell count failure is visibly unavailable rather than a successful empty inbox", async () => {
  state.fetch.mockResolvedValue({ok: false, status: 503}); const client = new QueryClient({defaultOptions: {queries: {retryDelay: 0}}}); clients.push(client);
  render(<QueryClientProvider client={client}><NotificationBell identity="synthetic-bell"/></QueryClientProvider>);
  const trigger = await screen.findByRole("button", {name: "Notifications unavailable"}); fireEvent.click(trigger); await screen.findByRole("alert"); expect(screen.queryByText("No unread notifications")).toBeNull();
});
it("the bell does not send preview queries while closed", async () => {
  const client = new QueryClient(); clients.push(client); render(<QueryClientProvider client={client}><NotificationBell identity="synthetic-bell"/></QueryClientProvider>);
  await screen.findByLabelText("1103 unread notifications"); expect(state.fetch).toHaveBeenCalledTimes(1); expect(state.fetch.mock.calls[0][0]).toBe("/api/notifications/bell"); expect(state.fetch.mock.calls[0][1]).toMatchObject({cache: "no-store", credentials: "same-origin"});
});
it("unmounted mark-all completion cannot refresh or announce success to another owner", async () => {
  let finish!: (value: unknown) => void; state.action.mockImplementation(() => new Promise(resolve => {finish = resolve;})); const view = mount(); await screen.findByText("1103 unread notifications");
  fireEvent.click(screen.getByRole("button", {name: "Mark all read"})); await waitFor(() => expect(state.action).toHaveBeenCalledTimes(1)); view.unmount();
  await act(async () => finish({success: true, data: {count: 1}})); expect(state.toast).not.toHaveBeenCalled(); expect(state.read).not.toHaveBeenCalled();
});
