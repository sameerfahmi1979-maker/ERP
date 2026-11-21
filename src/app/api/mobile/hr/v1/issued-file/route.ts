import { mobileBytes } from "@/server/mobile/hr-binary";
export const runtime = "nodejs";
export function GET(request:Request) { return mobileBytes(request,"issued-file"); }
export function HEAD(request:Request) { return mobileBytes(request,"issued-file"); }
