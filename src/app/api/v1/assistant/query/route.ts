import { readRoute } from "@/server/reads/route-response";
import { answerAssistantQuestion } from "@/server/ai/assistant/questions";
/** Stateless read. Conversation writes and draft commit remain separate owning workflows. */
export async function POST(request: Request) {
  return readRoute(request, input => answerAssistantQuestion(input, request.signal));
}
