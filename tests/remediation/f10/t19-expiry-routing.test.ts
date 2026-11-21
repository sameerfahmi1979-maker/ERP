import { beforeEach, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveNotificationRecipients, type NotificationEvent } from "@/server/notification-events";

const ports = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: () => ({
    select() { return this; },
    eq() { return this; },
    is() { return this; },
    async maybeSingle() { return { data: null, error: null }; },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ports }));

const event: NotificationEvent = {
  id: 41,
  event_key: "employee_identity_documents:19:expiry:2027-01-01:before:15",
  source_table: "employee_identity_documents",
  source_id: 19,
  source_snapshot: { t19_policy_id: 4, recipient_ids: [13, 20] },
  event_type: "compliance_expiry_reminder",
  actor_id: null,
  lease_token: "b23ec154-aa22-44cc-8fee-2b954e9bf007",
};

beforeEach(() => {
  ports.rpc.mockReset();
  ports.rpc.mockImplementation(async (_name, { p_candidate }) => ({
    data: p_candidate == null ? [13, 20] : p_candidate === 13 ? [13] : [],
    error: null,
  }));
});

it("discovers the frozen policy roster using the current reminder lease", async () => {
  const recipients = await resolveNotificationRecipients(event, createAdminClient(), undefined, { discoverOnly: true });
  expect(recipients).toEqual([13, 20]);
  expect(ports.rpc.mock.calls).toEqual([[
    "t19_expiry_recipients", { p_event: 41, p_lease: event.lease_token },
  ]]);
});

it("requalifies a candidate and retains a revoked recipient as ineligible", async () => {
  const db = createAdminClient();
  expect(await resolveNotificationRecipients(event, db, undefined, { candidateIds: [13] })).toEqual([13]);
  expect(await resolveNotificationRecipients(event, db, undefined, { candidateIds: [20] })).toEqual([]);
  expect(ports.rpc.mock.calls.map(([, input]) => input.p_candidate)).toEqual([13, 20]);
});

it("passes failed authority checks to the existing retry path", async () => {
  ports.rpc.mockResolvedValue({ data: null, error: { code: "PT409", message: "private detail" } });
  await expect(resolveNotificationRecipients(event, createAdminClient(), undefined, { candidateIds: [13] }))
    .rejects.toThrow("Expiry recipient authority unavailable");
});

