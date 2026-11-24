import { z } from "zod";

export const MAX_CHAT_FILE_BYTES = 52_428_800;
export const id = z.uuid();
export const decimal = z.string().regex(/^(?:0|[1-9]\d{0,18})$/)
  .refine(value => value.length < 19 || value.length === 19 && value <= "9223372036854775807");
const person = decimal.refine(value => value !== "0");
export const historyMode = z.enum(["participant", "review"]);
export type HistoryMode = z.infer<typeof historyMode>;
const instant = z.iso.datetime({ offset: true });
export const filename = z.string().min(1).max(240)
  .refine(value => value.trim() === value && !/[\\/\u0000-\u001f\u007f]/u.test(value) && value !== "." && value !== "..");
const mime = z.string().max(150).regex(/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/);
const cursor = z.string().min(1).max(4096);
const paging = { cursor: cursor.optional(), limit: z.number().int().min(1).max(100).optional() };
const history = { conversationId: id, mode: historyMode };
const mutation = { clientMutationId: id };
const revision = { expectedRevision: decimal };
const dates = { from: instant.optional(), until: instant.optional() };
const dateOrder = (value: {from?: string; until?: string}) =>
  !value.from || !value.until || Date.parse(value.from) < Date.parse(value.until);
const text = z.string().min(1).max(32000);
const members = z.array(person).max(4096);
const media = z.enum(["file", "image", "audio", "video", "voice"]);
const toggle = { ...mutation, messageId: id, enabled: z.boolean() };
const object = z.strictObject;
export const exportArgs = object({ ...history, ...dates }).refine(dateOrder);
export const commandEnvelope = object({ op: z.string().max(80).regex(/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){1,3}$/), args: z.record(z.string(), z.unknown()) });
export type CommunicationCommand = z.infer<typeof commandEnvelope>;

export const chatOperations = {
  "chat.capabilities": object({}),
  "chat.historyCapacity": object({ slotCount: z.number().int().min(1).max(4096) }),
  "chat.scopeReconcile": object({ episodeId: person }),
  "chat.resolveDmsReference": object({ token:z.string().regex(/^[A-Za-z0-9_-]{43}$/) }),
  "chat.directory": object({ ...paging, query: z.string().max(128).optional() }),
  "chat.linkedIdentity": object({ employeeId: person }),
  "chat.conversations": object({ ...paging, mode: historyMode, archived: z.boolean().optional(), query: z.string().max(256).optional() }),
  "chat.direct": object({ ...mutation, peerProfileId: person }),
  "chat.groupCreate": object({ ...mutation, name: z.string().trim().min(1).max(160), memberProfileIds: members }),
  "chat.groupChange": object({ ...mutation, ...revision, conversationId: id, action: z.enum(["rename","add","remove","leave","promote","demote","replaceOwner"]), targetProfileId: person.optional(), name: z.string().trim().min(1).max(160).optional() })
    .refine(a => a.action === "rename" ? Boolean(a.name) && !a.targetProfileId : a.action === "leave" ? !a.name && !a.targetProfileId : Boolean(a.targetProfileId) && !a.name),
  "chat.namedGrant": object({ ...mutation, targetProfileId: person, kind: z.enum(["historyReview","groupCreate"]), enabled: z.boolean(), expectedRevision: decimal.optional() }),
  "chat.conversation": object(history),
  "chat.members": object({ ...paging, ...history }),
  "chat.messages": object({ ...paging, ...history }),
  "chat.send": object({ ...mutation, conversationId: id, body: text.optional(), replyToMessageId: id.optional(), uploadIds: z.array(id).optional(), mentionProfileIds: members.optional(), dmsRef: object({shareId: person, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).optional() })
    .refine(a => Boolean(a.body?.trim() || a.uploadIds?.length || a.dmsRef)),
  "chat.edit": object({ ...mutation, ...revision, messageId: id, body: text, mentionProfileIds: members.optional() }),
  "chat.delete": object({ ...mutation, ...revision, messageId: id }),
  "chat.forward": object({ ...mutation, ...revision, sourceMessageId: id, destinationConversationId: id }),
  "chat.reaction": object({ ...toggle, emoji: z.string().min(1).max(32) }),
  "chat.pin": object(toggle),
  "chat.star": object(toggle),
  "chat.stars": object(paging),
  "chat.personal": object({ ...mutation, conversationId: id, muted: z.boolean().optional(), archived: z.boolean().optional() }).refine(a => a.muted !== undefined || a.archived !== undefined),
  "chat.read": object({ ...mutation, conversationId: id, upToSeq: decimal }),
  "chat.readers": object({ ...paging, messageId: id }),
  "chat.search": object({ ...paging, ...dates, mode: historyMode, query: z.string().trim().min(1).max(256), senderProfileId: person.optional() }).refine(dateOrder),
  "chat.media": object({ ...paging, ...history, kind: media.optional() }),
  "chat.uploadBegin": object({ ...mutation, conversationId: id, filename, mime, kind: z.literal("voice").optional(), byteLength: z.number().int().min(1).max(MAX_CHAT_FILE_BYTES) }),
  "chat.uploadStatus": object({ uploadId: id }),
  "chat.sync": object({ manifestCursor: cursor.optional(), cursors: z.array(object({ conversationId: id, changeSeq: decimal })).max(100).optional(), limit: paging.limit }),
  "chat.pulse": object({ ...mutation, conversationId: id, typing: z.boolean(), pulseAt: instant.optional() }),
  "chat.activity": object({ conversationId: id }),
} satisfies Record<string, z.ZodType>;
