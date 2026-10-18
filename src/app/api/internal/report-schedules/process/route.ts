import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { processDueSchedules } from "@/lib/report-center/schedule-worker";
import { isSchedulesWorkerEnabled } from "@/lib/output/feature-flags";
import { emailWorkerEnabled } from "@/lib/email/queue/service";
import { authorizeWorker } from "@/lib/email/queue/worker-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import { boundedQuery, InvalidWorkerInput, readWorkerInput } from "@/lib/email/queue/runtime-limits";
export const runtime = "nodejs";
function authorized(r: NextRequest) { return authorizeWorker(r.headers.get("authorization"), process.env.WORKER_SECRET); }
export async function GET(request: NextRequest) {
    if (!authorized(request))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const db = createAdminClient();
        const result = await boundedQuery(db.from("erp_report_schedules").select("id", { count: "exact", head: true })
            .eq("is_active", true).is("deleted_at", null).lte("next_run_at", new Date().toISOString()));
        if (result.error)
            throw new Error("Health read failed");
        return NextResponse.json({ status: "ok", workerEnabled: isSchedulesWorkerEnabled() && emailWorkerEnabled(),
            dueSchedules: result.count, deliveryOwner: "email_queue", catchupPolicyConfigured: ["one-slot-at-a-time", "skip-missed-after-current"].includes(process.env.F09_SCHEDULE_CATCHUP_POLICY ?? "") });
    }
    catch {
        return NextResponse.json({ status: "error", error: "Health check unavailable" }, { status: 503 });
    }
}
export async function POST(request: NextRequest) {
    if (!authorized(request))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!isSchedulesWorkerEnabled() || !emailWorkerEnabled())
        return NextResponse.json({ paused: true, claimed: 0, queued: 0, succeeded: 0 });
    try {
        const parsed = z.object({ limit: z.number().int().min(1).max(25).optional() }).strict().safeParse(await readWorkerInput(request));
        if (!parsed.success)
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        return NextResponse.json(await processDueSchedules({ workerId: randomUUID(), limit: parsed.data.limit }));
    }
    catch (error) {
        if (error instanceof InvalidWorkerInput)
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        return NextResponse.json({ error: "Schedule processing unavailable; inspect durable intents before retry." }, { status: 503 });
    }
}
