import { type NextRequest, NextResponse } from "next/server";
import { deliverIssuedFile } from "@/server/issued-file-delivery";
export const runtime = "nodejs";
export async function GET(req: NextRequest) {
  const raw=req.nextUrl.searchParams.get("issuanceId");
  if(!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw)<=0)
    return NextResponse.json({error:"Invalid issuance."},{status:400,headers:{"Cache-Control":"private, no-store"}});
  return deliverIssuedFile(Number(raw));
}
