import { createHash } from "node:crypto";
import { finalizeTripOrder, getIssuedTripOrderPdf } from "@/server/actions/fleet/operations";

export const runtime = "nodejs";
const noStore = {"Cache-Control":"private, no-store"};

export async function POST(request:Request,{params}:{params:Promise<{id:string;issue:string}>}) {
  if (request.headers.get("X-Fleet-Action")!=="finalize") return new Response(null,{status:400,headers:noStore});
  const {id,issue} = await params;
  try {
    const complete = await finalizeTripOrder(Number(id),Number(issue));
    return new Response(null,{status:complete?204:404,headers:noStore});
  } catch {
    return new Response(null,{status:503,headers:noStore});
  }
}

export async function GET(_request:Request,{params}:{params:Promise<{id:string;issue:string}>}) {
  const {id,issue} = await params;
  const order = await getIssuedTripOrderPdf(Number(id),Number(issue));
  const headers = {...noStore,"X-Content-Type-Options":"nosniff"};
  if (!order) return new Response(null,{status:404,headers});
  const bytes = Buffer.from(order.pdf,"base64");
  if (createHash("sha256").update(bytes).digest("hex")!==order.sha256) return new Response(null,{status:409,headers});
  const filename = order.issue.replace(/[^-A-Za-z0-9_.]/g,"_");
  return new Response(new Uint8Array(bytes),{headers:{...headers,"Content-Type":"application/pdf",
    "Content-Disposition":`inline; filename="${filename}.pdf"`,"Referrer-Policy":"no-referrer",
    "Content-Security-Policy":"sandbox; default-src 'none'; frame-ancestors 'self'"}});
}
