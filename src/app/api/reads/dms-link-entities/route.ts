import { z } from "zod";
import { searchDmsLinkEntityOptions } from "@/server/actions/dms/document-links";
import { readRoute } from "@/server/reads/route-response";
const schema = z.object({entityType:z.string().min(1).max(100),search:z.string().max(200).optional()}).strict();
export const dynamic = "force-dynamic";
export async function POST(request:Request) {
  return readRoute(request, async input => {
    const p=schema.safeParse(input);
    return p.success ? searchDmsLinkEntityOptions(p.data.entityType,p.data.search,50) : {success:false,error:"Invalid entity search"};
  });
}
