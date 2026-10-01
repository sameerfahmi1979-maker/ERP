import { queueStatusLabel } from "./presentation";

type Item = Parameters<typeof queueStatusLabel>[0] & { nextRetryAt?: string | null };
/** End-user text must not expose raw provider messages, addresses or credentials. */
export function queueDeliveryDetails(item: Item): string {
  if (item.status === "delivery_unknown") return "The provider may have accepted this message. An administrator must reconcile it; do not resend automatically.";
  if (item.status === "sent") return item.deliveryState === "provider_accepted"
    ? "Accepted by the email provider. This is not confirmation that it reached the recipient's inbox."
    : "Historical sent status. Provider acceptance and inbox delivery have not been independently verified.";
  if (item.pausedAt) return "Paused for review. Processing is unavailable until an authorized operator resolves the hold.";
  if (item.lastError === "F09:provider_quota") return "Waiting for available provider capacity. Do not create a second message.";
  if (item.lastError === "F09:retry") return "A retry is scheduled. The backend retains its cooldown and attempt limits.";
  if (item.status === "processing") return "The backend is processing this message. Delivery is not yet confirmed.";
  if (item.status === "failed") return "Sending stopped. Review delivery history with an administrator; no automatic resend is available.";
  if (item.status === "cancelled") return "Cancelled. This does not recall a message already accepted by the provider.";
  return item.lastError ? "A delivery issue needs review. Sensitive provider details are not shown in this list." : "Waiting for the backend delivery service.";
}
