import { z } from "zod";
import { readDmsListChoices } from "@/server/reads/dms-list-choices";
import { readRoute } from "@/server/reads/route-response";

const criteria = z.strictObject({});

export async function POST(request: Request) {
  return readRoute(request, input => criteria.safeParse(input).success
    ? readDmsListChoices(undefined, request.signal)
    : Promise.resolve({ success: false, error: "Invalid document filter choices criteria" }));
}
