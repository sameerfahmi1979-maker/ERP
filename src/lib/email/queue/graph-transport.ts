import 'server-only';
import type { EmailMessageInput } from "../providers/types";
import { classifySendResponse, type DeliveryOutcome } from "./delivery-contract";

/** Token acquisition and permission/recipient authorization belong to preflight.
 * The standard Graph endpoint has no advertised sendMail idempotency key. A
 * client-request-id is correlation ONLY, not proof of deduplication or delivery. */
export function prepareGraphDelivery(input: EmailMessageInput, sender: string, accessToken: string) {
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const recipients = [...input.to, ...(input.cc ?? []), ...(input.bcc ?? [])];
  if (!email.test(sender) || !input.to.length || recipients.length > 100 || recipients.some(r => !email.test(r)))
    throw new Error("Invalid recipients");
  if (input.replyTo && !email.test(input.replyTo)) throw new Error("Invalid reply address");
  if (!input.subject.trim() || input.subject.length > 998 || !(input.htmlBody?.trim() || input.textBody?.trim()))
    throw new Error("Invalid message content");
  if (!accessToken) throw new Error("Missing provider credential");
  let total = 0;
  if ((input.attachments?.length ?? 0) > 20) throw new Error("Too many inline attachments");
  for (const a of input.attachments ?? []) {
    if (!a.filename || /[\r\n\\/\x00]/.test(a.filename) || !/^[\w.+-]+\/[\w.+-]+$/.test(a.contentType))
      throw new Error("Invalid attachment metadata");
    if (a.base64Content.length > 4_000_000 || a.filename.length > 255 || !Number.isSafeInteger(a.sizeBytes) || a.sizeBytes < 0)
      throw new Error("Invalid attachment size");
    const bytes = Buffer.from(a.base64Content, "base64");
    if (bytes.length !== a.sizeBytes || bytes.toString("base64") !== a.base64Content) throw new Error("Invalid attachment bytes");
    total += bytes.length;
    if (total > 3_000_000) throw new Error("Inline attachments exceed size limit");
  }
  // Conservative inline limit. Larger attachments need F08's upload/secure-link adapter.
  if (total > 3_000_000) throw new Error("Inline attachments exceed size limit");
  const address = (value: string) => ({ emailAddress: { address: value } });
  const body = JSON.stringify({ message: {
    subject: input.subject, body: { contentType: input.htmlBody ? "HTML" : "Text", content: input.htmlBody || input.textBody },
    toRecipients: input.to.map(address), ccRecipients: input.cc?.map(address), bccRecipients: input.bcc?.map(address),
    replyTo: input.replyTo ? [address(input.replyTo)] : undefined,
    attachments: input.attachments?.map(a => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: a.filename,
      contentType: a.contentType, contentBytes: a.base64Content })),
  }, saveToSentItems: input.saveToSentItems ?? true });
  return async (signal: AbortSignal, correlationId: string): Promise<DeliveryOutcome> => {
    try {
      const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`, {
        method: "POST", redirect: "error", signal, body,
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "client-request-id": correlationId },
      });
      // Never persist provider bodies: they can contain recipients or credentials.
      void response.body?.cancel().catch(() => {});
      return classifySendResponse(response.status, response.headers.get("retry-after"));
    } catch { return { kind: "unknown" }; }
  };
}
