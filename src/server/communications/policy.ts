import "server-only";
import { z } from "zod";
import type { CommunicationActor } from "./access";
import { id, type CommunicationCommand } from "./contracts";
import { CommunicationHttpError, userRpc } from "./http";

const targetProfileId = z.string().regex(/^[1-9]\d{0,18}$/u).refine(value => value.length < 19 || value <= "9223372036854775807");
const compactText = z.string().trim().min(1).max(1000);
const version = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
const mutation = { clientMutationId: id };
const strict = z.strictObject;
const reasons = z.enum([
  "harassment_threats", "hate_discrimination", "sexual_exploitation", "impersonation_spam", "privacy", "other",
]);
const policyCommands = {
  "policy.status": strict({}),
  "policy.accept": strict({ version, ...mutation }),
  "policy.blocks": strict({}),
  "policy.block": strict({ targetProfileId, blocked: z.boolean(), ...mutation }),
  "policy.report": z.discriminatedUnion("kind", [
    strict({ kind: z.literal("user"), targetId: targetProfileId, reason: reasons, details: compactText.optional(), ...mutation }),
    strict({ kind: z.enum(["chat_message", "chat_thread", "ptt_transmission", "ptt_channel", "ptt_sos"]),
      targetId: id, reason: reasons, details: compactText.optional(), ...mutation }),
  ]),
  "policy.cases": strict({ limit: z.number().int().min(1).max(100).optional(), before: id.optional() }),
  "policy.case": strict({ caseId: id }),
  "policy.moderate": z.discriminatedUnion("action", [
    strict({ action: z.enum(["review", "dismiss", "hideContent"]), caseId: id, note: compactText.optional(), ...mutation }),
    strict({ action: z.literal("restrictCommunication"), caseId: id, note: compactText.optional(),
      until: z.iso.datetime({ offset: true }), ...mutation }),
  ]),
  "policy.setModerator": strict({ targetProfileId, enabled: z.boolean(), ...mutation }),
} satisfies Record<string, z.ZodType>;

export async function dispatchPolicy(command: CommunicationCommand, actor: CommunicationActor): Promise<unknown> {
  if (!Object.hasOwn(policyCommands, command.op)) throw new CommunicationHttpError("invalid_request");
  const parsed = policyCommands[command.op as keyof typeof policyCommands].safeParse(command.args);
  if (!parsed.success) throw new CommunicationHttpError("invalid_request");
  const args = parsed.data;
  if ((command.op === "policy.block" && "targetProfileId" in args && args.targetProfileId === actor.profileId)
    || (command.op === "policy.report" && "kind" in args && args.kind === "user" && args.targetId === actor.profileId)) {
    throw new CommunicationHttpError("invalid_request");
  }
  // The RPC rechecks ERP identity and debits existing safety capacity only for an actual change.
  return userRpc("erp_communications_policy_v1", { p_request: { op: command.op, args } });
}
