import "server-only";
import type { CommunicationActor } from "./access";
import { readCommunicationDirectory, readLinkedCommunicationIdentity } from "./access";
import { chatOperations, MAX_CHAT_FILE_BYTES, type CommunicationCommand } from "./contracts";
import { CommunicationHttpError, paidChatRpc } from "./http";

export async function dispatchChat(command: CommunicationCommand, actor: CommunicationActor) {
  if (!Object.hasOwn(chatOperations, command.op)) throw new CommunicationHttpError("invalid_request");
  if (command.op === "chat.uploadBegin" && typeof command.args.byteLength === "number" && command.args.byteLength > MAX_CHAT_FILE_BYTES)
    throw new CommunicationHttpError("size_limit");
  const schema = chatOperations[command.op as keyof typeof chatOperations];
  const parsed = schema.safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError("invalid_request");
  const args = parsed.data;
  const maintenance = command.op === "chat.historyCapacity" || command.op === "chat.scopeReconcile";
  if (maintenance && !actor.isGlobalSystemAdmin) throw new CommunicationHttpError("permission_denied");
  const realtime = command.op === "chat.pulse" || command.op === "chat.activity";
  const retained = maintenance || !realtime && "clientMutationId" in args;

  if (command.op === "chat.directory") return readCommunicationDirectory(chatOperations["chat.directory"].parse(args),actor);
  if (command.op === "chat.linkedIdentity") {
    const { employeeId } = chatOperations["chat.linkedIdentity"].parse(args);
    return readLinkedCommunicationIdentity(employeeId,actor);
  }
  const feature = realtime ? "realtime" : command.op.startsWith("chat.upload") ? "media_upload" : "chat";
  return paidChatRpc(actor, feature, command.op, args, retained);
}
