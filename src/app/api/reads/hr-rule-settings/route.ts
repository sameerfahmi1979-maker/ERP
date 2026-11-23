import { readHrRuleSettings } from "@/server/reads/hr-rule-settings";
import { readRoute } from "@/server/reads/route-response";

export async function POST(request: Request) {
  return readRoute(request, input => readHrRuleSettings(input, request.signal), { maxBytes: 128 * 1024 });
}
