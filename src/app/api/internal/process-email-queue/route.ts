import { NextRequest, NextResponse } from "next/server";
import { authorizeWorker } from "@/lib/email/queue/worker-auth";
import { emailWorkerEnabled, processQueuedBatch } from "@/lib/email/queue/service";
import { z } from "zod";
export const runtime = "nodejs";
const input = z.object({ module: z.string().min(1).max(50).optional(), limit: z.number().int().min(1).max(100).optional() }).strict();
export async function POST(request: NextRequest) {
    if (!authorizeWorker(request.headers.get("authorization"), process.env.INTERNAL_API_SECRET))
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!emailWorkerEnabled())
        return NextResponse.json({ paused: true, processed: 0, sent: 0, accepted: 0, failed: 0 });
    try {
        const text = await request.text();
        if (text.length > 2048)
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        const parsed = input.safeParse(text ? JSON.parse(text) : {});
        if (!parsed.success)
            return NextResponse.json({ error: "Invalid request" }, { status: 400 });
        return NextResponse.json(await processQueuedBatch(parsed.data));
    }
    catch {
        return NextResponse.json({ error: "Queue processing unavailable; inspect outcomes before retry." }, { status: 503 });
    }
}
