import "server-only";

import type { TripOrder } from "@/lib/fleet/operations-contract";
import { renderOfflinePrintPdf } from "@/lib/official-documents/layout/offline-print-pdf";

const date = new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dubai" });
const time = (value: string) => date.format(new Date(value));

export function renderTripOrderPdf(order: TripOrder): Buffer {
  const data = order.snapshot;
  const lines = [
    "Operating order " + data.order_no + " · " + data.subject,
    "Job reference " + data.reference,
    "Authorization " + data.authorization,
  ];
  if (data.customer) lines.push("Customer " + data.customer);
  lines.push("", "Assigned resources");
  for (const item of data.assignments) {
    lines.push(`${item.asset_no} · ${item.asset_name} · ${item.worker} · ${item.site}`,
      `${time(item.from)} to ${time(item.until)}`);
  }
  lines.push("", "Planned route");
  for (const item of data.legs) {
    lines.push(`${item.sequence}. ${item.origin} to ${item.destination} · ${item.load}${item.cargo ? " · " + item.cargo : ""}`);
    const pickup = [item.pickup_address, item.pickup_contact, item.pickup_phone].filter(Boolean).join(" · ");
    const delivery = [item.delivery_address, item.delivery_contact, item.delivery_phone].filter(Boolean).join(" · ");
    if (pickup) lines.push("Pickup " + pickup);
    if (delivery) lines.push("Delivery " + delivery);
    if (item.instructions) lines.push("Instructions " + item.instructions);
    lines.push("Actual departure ____________________   Actual arrival ____________________");
  }
  lines.push("");
  for (const label of ["Operations issuer", "Driver or operator", "Pickup acknowledgement", "Delivery acknowledgement"]) {
    lines.push(label + "   Date and signature __________________________________");
  }
  return renderOfflinePrintPdf({
    title: "Trip Order",
    company: data.employer,
    companyArabic: data.employer_ar,
    reference: order.issue + " · " + data.branch,
    timestamp: time(order.issued) + " Dubai time",
    status: "Issued operating instruction",
    lines,
  });
}
