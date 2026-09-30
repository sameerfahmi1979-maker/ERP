import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveEmailProviderSecret } from "@/lib/email/vault";
import { createEmailQueueStore } from "./rpc-store";
import { processOneEmail, type PreparedDelivery } from "./worker";
import { acquireGraphToken } from "./graph-token";
import { prepareGraphDelivery } from "./graph-transport";
import { prepareQueueMessage, type DeliveryClaim } from "./source";
import { DeliveryPolicyError } from "./policy";
export function emailWorkerEnabled() { return process.env.F09_EMAIL_WORKER_ENABLED === "true"; }
export async function prepareQueuedDelivery(q: DeliveryClaim, signal: AbortSignal): Promise<PreparedDelivery> {
    try {
        const input = await prepareQueueMessage(q, signal);
        signal.throwIfAborted();
        const db = createAdminClient();
        let query = db.from("erp_email_provider_configs").select("*")
            .eq("is_active", true).eq("is_enabled", true).is("deleted_at", null);
        query = q.provider_config_id ? query.eq("id", q.provider_config_id) : query.eq("is_default", true);
        const { data, error } = await query.limit(2);
        if (error)
            throw new Error("Provider lookup failed");
        // No arbitrary/default fallback for a missing explicit provider; ambiguity fails closed.
        if (!data || data.length !== 1)
            return { ready: false, outcome: { kind: "permanent" } };
        const p = data[0];
        if (p.provider_type !== "microsoft_graph" || p.auth_mode !== "client_credentials"
            || p.send_mode !== "graph_send_mail")
            return { ready: false, outcome: { kind: "permanent" } };
        if ((p.graph_base_url && !["https://graph.microsoft.com/v1.0", "https://graph.microsoft.com/v1.0/"].includes(p.graph_base_url))
            || (p.authority_url && p.authority_url !== `https://login.microsoftonline.com/${p.tenant_id}/oauth2/v2.0/token`))
            return { ready: false, outcome: { kind: "permanent" } };
        const { secret } = await resolveEmailProviderSecret(p.secret_ref);
        if (!secret)
            return { ready: false, outcome: { kind: "permanent" } };
        const token = await acquireGraphToken({ tenantId: p.tenant_id ?? "", clientId: p.client_id ?? "", secret }, signal);
        if (!token.ready)
            return { ready: false, outcome: { kind: token.kind, retryAfter: token.retryAfter } };
        signal.throwIfAborted();
        let send;
        try {
            send = prepareGraphDelivery(input, p.sender_email ?? "", token.token);
        }
        catch {
            return { ready: false, outcome: { kind: "permanent" } };
        }
        return { ready: true, provider: { id: p.id, expected: p }, send };
    }
    catch (error) {
        if (error instanceof DeliveryPolicyError)
            return { ready: false, outcome: { kind: "cancelled" } };
        throw error; // pre-dispatch transient error: bounded retry, no raw error persistence
    }
}
export type EmailProcessResult = Awaited<ReturnType<typeof processOneEmail>> | "paused";
export async function processQueuedEmail(filter: {
    id?: number;
    module?: string;
} = {}): Promise<EmailProcessResult> {
    if (!emailWorkerEnabled())
        return "paused";
    const db = createAdminClient();
    return processOneEmail(createEmailQueueStore<DeliveryClaim>(db, randomUUID(), filter), prepareQueuedDelivery);
}
export async function processQueuedBatch(options: {
    limit?: number;
    module?: string;
} = {}) {
    const totals = { processed: 0, sent: 0, accepted: 0, failed: 0, skipped: 0, retry: 0, deferred: 0, unknown: 0, cancelled: 0, leasesReaped: 0, paused: !emailWorkerEnabled() };
    if (totals.paused)
        return totals;
    if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1 || options.limit > 100))
        throw new Error("Invalid batch limit");
    const db = createAdminClient();
    const reaped = await db.rpc("f09_reap_email_leases", { p_limit: 100 });
    if (reaped.error)
        throw new Error("Lease recovery failed");
    totals.leasesReaped = Number(reaped.data);
    const started = Date.now();
    for (let i = 0; i < (options.limit ?? 20) && Date.now() - started < 25000; i++) {
        const result = await processQueuedEmail({ module: options.module });
        if (result === "skipped" || result === "paused") {
            totals.skipped++;
            break;
        }
        totals.processed++;
        if (result === "accepted") {
            totals.sent++;
            totals.accepted++;
        }
        else if (result === "permanent")
            totals.failed++;
        else if (result === "deferred")
            totals.deferred++;
        else if (result === "retry")
            totals.retry++;
        else if (result === "unknown")
            totals.unknown++;
        else if (result === "cancelled")
            totals.cancelled++;
        else
            totals.skipped++;
    }
    return totals;
}
