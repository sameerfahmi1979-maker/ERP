import { sessionFingerprint } from "@/features/messages/session-fingerprint";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/rbac/check";

import { Messages } from "@/features/messages/messages";
import { requireCommunicationActor } from "@/server/communications/access";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [context, query] = await Promise.all([getAuthContext(), searchParams]);
  if (!context.profile || !context.isAccountActive || context.profile.must_change_password)
    redirect("/login");
  const session = await sessionFingerprint(context.profile.auth_user_id);
  if (!session) redirect("/login");
  const profileId = Number.isSafeInteger(context.profile.id)
    ? String(context.profile.id)
    : (await requireCommunicationActor()).profileId;
  return (
    <Messages
      key={session}
      account={context.profile.auth_user_id}
      session={session}
      expectedProfile={profileId}
      initialThread={typeof query.conversationId === "string" ? query.conversationId : undefined}
      initialMessage={typeof query.messageId === "string" ? query.messageId : undefined}
      initialReview={query.mode === "review"}
      employeeId={typeof query.employeeId === "string" ? query.employeeId : undefined}
    />
  );
}
