import { readRoute } from "@/server/reads/route-response";
import { readAgentCenterSnapshot } from "@/server/reads/ai-agent-center";

export function POST(request: Request) {
  return readRoute(request, readAgentCenterSnapshot);
}
