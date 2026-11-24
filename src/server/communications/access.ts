import "server-only";
import { z } from "zod";
import { admitOperation } from "./http";
import { canUseApplication, getAuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";

const profileId = z.string().regex(/^[1-9]\d{0,18}$/)
  .refine(value => value.length < 19 || value <= "9223372036854775807");
const directoryArgs = z.strictObject({
  query: z.string().trim().max(128).optional(),
  cursor: z.string().min(1).max(1024).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

const actorShape = z.object({
  profileId,
  authUserId: z.uuid(),
  authSessionId: z.uuid(),
  isGlobalSystemAdmin: z.boolean(),
});
export type CommunicationActor = z.infer<typeof actorShape>;

const workLabel = z.string().max(512).nullish().transform(value => value ?? undefined);
const workIdentity = z.object({
  profileId,
  name: z.string().min(1).max(512),
  jobTitle: workLabel,
  companyName: workLabel,
  branchName: workLabel,
  photoRef: z.string().max(1024).nullish(),
}).transform(card => ({
  ...card,
  // Profile-editable URLs and private HR/DMS routes cannot be directory photos.
  photoRef: card.photoRef === `/api/mobile/communications/v1/avatars/${card.profileId}`
    ? card.photoRef : undefined,
}));
export type WorkIdentity = z.output<typeof workIdentity>;
const directoryPage = z.object({
  items: z.array(workIdentity).max(100),
  nextCursor: z.string().min(1).max(1024).nullable(),
});

const errors = {
  unauthenticated: [401, "Sign in with your ERP account."],
  permission_denied: [403, "ERP access is unavailable for this account."],
  unavailable: [404, "The requested work identity is unavailable."],
  invalid_request: [400, "Invalid work identity request."],
  temporarily_unavailable: [503, "Work identity is temporarily unavailable."],
} as const;
export class CommunicationAccessError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) {
    super(errors[code][1]);
    this.status = errors[code][0];
  }
}

async function activeProfile() {
  // The existing ERP context calls auth.getUser and f03_current_session_valid under
  // the cookie or AsyncLocalStorage bearer bound to this request.
  const ctx = await getAuthContext();
  if (!ctx.profile) throw new CommunicationAccessError("unauthenticated");
  if (!canUseApplication(ctx)) throw new CommunicationAccessError("permission_denied");
  return ctx.profile;
}

async function readProjection<T>(op: string, args: Record<string, unknown>, schema: z.ZodType<T>, actor?: CommunicationActor) {
  const command = {op,args};
  const permit = op === "chat.actor" ? null :
    await admitOperation(actor ?? await requireCommunicationActor(), "chat", undefined, false, command);
  const db = await createClient();
  const { data, error } = await db.rpc("erp_chat_v1", { p_request: { ...command, ...(permit ? {_budgetPermitId:permit.permitId} : {}) } });
  if (error) {
    switch (error.code) {
      case "28000": case "PT401": case "PGRST301": case "PGRST303":
        throw new CommunicationAccessError("unauthenticated");
      case "42501": case "PT403": throw new CommunicationAccessError("permission_denied");
      case "PT404": throw new CommunicationAccessError("unavailable");
      case "22023": case "PT400": throw new CommunicationAccessError("invalid_request");
      default: throw new CommunicationAccessError("temporarily_unavailable");
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new CommunicationAccessError("temporarily_unavailable");
  return parsed.data;
}

/** Server-only identity. Sensitive operations independently check the same current actor in SQL. */
export async function requireCommunicationActor(): Promise<CommunicationActor> {
  const profile = await activeProfile();
  // The SQL predicate checks active reserved system_admin, is_system_role and
  // both NULL scope IDs on the same assignment. Generic isGlobalAdmin includes group_admin.
  const actor = await readProjection("chat.actor", {}, actorShape);
  // PostgREST can round a bigint decoded as a JS number by the legacy profile API.
  // The checked actor RPC emits its exact bigint as text for all subsequent work.
  if (actor.authUserId !== profile.auth_user_id
    || (Number.isSafeInteger(profile.id) && actor.profileId !== String(profile.id))) {
    throw new CommunicationAccessError("unauthenticated");
  }
  return actor;
}

export async function readCommunicationDirectory(args: z.input<typeof directoryArgs>, actor?: CommunicationActor) {
  const parsed = directoryArgs.safeParse(args);
  if (!parsed.success) throw new CommunicationAccessError("invalid_request");
  return readProjection("chat.directory", parsed.data, directoryPage, actor);
}

/** The SQL projection checks the viewer's HR subject permission before resolving an employee shortcut. */
export async function readLinkedCommunicationIdentity(employeeId: number | string, actor?: CommunicationActor): Promise<WorkIdentity | null> {
  if ((typeof employeeId === "number" && !Number.isSafeInteger(employeeId))
    || !profileId.safeParse(String(employeeId)).success) {
    throw new CommunicationAccessError("invalid_request");
  }
  return readProjection("chat.linkedIdentity", { employeeId: String(employeeId) }, workIdentity.nullable(), actor);
}

/** Preview of an officially linked employee photo under current HR/DMS permissions. */
export async function readCommunicationAvatar(targetProfileId: string, currentActor?: CommunicationActor): Promise<Response> {
  if (!profileId.safeParse(targetProfileId).success) throw new CommunicationAccessError("invalid_request");
  const actor = currentActor ?? await requireCommunicationActor();
  const args = { profileId: targetProfileId };
  const binding = z.object({ employeeId: profileId }).nullable();
  const initial = await readProjection("chat.avatarBinding", args, binding, actor);
  const employeeId = Number(initial?.employeeId);
  if (!initial || !Number.isSafeInteger(employeeId)) throw new CommunicationAccessError("unavailable");
  const [{ deliverSubjectPhoto }, { subjectPhoto }] = await Promise.all([
    import("@/server/hr-photo-delivery"), import("@/server/mobile/hr-photo"),
  ]);
  const source = await subjectPhoto(employeeId);
  if (!source) throw new CommunicationAccessError("unavailable");
  const preview = await deliverSubjectPhoto(employeeId, null, "preview", source);
  if (!preview.ok) {
    throw new CommunicationAccessError(preview.status >= 500 ? "temporarily_unavailable" : "unavailable");
  }
  const { default: sharp } = await import("sharp");
  const image = await sharp(Buffer.from(await preview.arrayBuffer()))
    .autoOrient().resize(128, 128, { fit: "cover" }).jpeg().toBuffer();
  const fresh = await readProjection("chat.avatarBinding", args, binding, actor);
  if (fresh?.employeeId !== initial.employeeId) throw new CommunicationAccessError("unavailable");
  if ((await subjectPhoto(employeeId))?.fingerprint !== source.fingerprint) {
    throw new CommunicationAccessError("unavailable");
  }
  return new Response(new Uint8Array(image), { headers: {
    "Content-Type": "image/jpeg",
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "Vary": "Authorization, Cookie",
  } });
}
