import { z } from "zod";
import { escapeEmailHtml } from "@/lib/auth/invitation-email";

const id = z.number().int().positive().refine(Number.isSafeInteger);
export const dmsEmailEvent = z.strictObject({
  event: z.enum(["expiry", "overdue", "approval-request", "approved", "rejected"]),
  documentId: id,
  recipientId: id,
  documentNo: z.string().regex(/^DMS-[0-9]{4}-[0-9]{1,12}$/),
  documentUpdatedAt: z.string().nullable(),
  typeCode: z.string().nullable(),
  expiry: z.iso.date().nullable(),
  employeeId: id.nullable(),
});

export type DmsEmailEvent = z.infer<typeof dmsEmailEvent>;

const routineDocumentTypes = new Map([
  ["CICPA_PASS", "CICPA gate pass"], ["SITE_ACCESS_PERMIT", "Site access permit"], ["ADNOC_GATE_PASS", "ADNOC gate pass"],
  ["ADNOC_ATA", "ADNOC ATA certificate"], ["ADNOC_INDUCTION", "ADNOC induction certificate"],
  ["ADNOC_OPITO", "ADNOC OPITO certificate"], ["ADSD", "Defensive driving certificate"], ["H2S_TRAINING_CERTIFICATE", "H2S training certificate"],
  ["CALIBRATION_CERTIFICATE", "Calibration certificate"], ["CHAMBER_OF_COMMERCE", "Chamber membership certificate"],
  ["TRADE_LICENSE", "Trade licence"], ["COMMERCIAL_REGISTER_AR", "Commercial register"], ["ISO_14001", "ISO 14001 certificate"],
  ["ISO_27001", "ISO 27001 certificate"], ["ISO_45001", "ISO 45001 certificate"], ["ISO_9001", "ISO 9001 certificate"],
  ["VEHICLE_REGISTRATION", "Vehicle registration"], ["EQUIPMENT_REGISTRATION", "Equipment registration"],
  ["WASTE_MANAGEMENT_PERMIT", "Waste management permit"], ["METHOD_STATEMENT", "Method statement"], ["RISK_ASSESSMENT", "Risk assessment"],
]);

export function dmsEmailDocumentLabel(typeCode: string | null) {
  return typeCode ? routineDocumentTypes.get(typeCode) : undefined;
}

export function dmsEmailApprovalEvent(type: string) {
  return ["approval_submitted", "approval_approved", "approval_rejected"].includes(type);
}

export function isContextualDmsEmail(type: string) {
  return dmsEmailApprovalEvent(type) || ["expiry_reminder", "document_expired", "expired_document"].includes(type);
}

const copy: Record<DmsEmailEvent["event"], { heading: string; button: string; action: string }> = {
  expiry: { heading: "Document expiring", button: "View document", action: "Review the document and arrange renewal if required." },
  overdue: { heading: "Document expired", button: "View document", action: "Review the document and its renewal status in ERP." },
  "approval-request": { heading: "Approval required", button: "Review approval", action: "This document is awaiting your decision. Open ERP to review it and record your decision." },
  approved: { heading: "Document approved", button: "View approval", action: "The document was approved. Open ERP to see the decision and its history." },
  rejected: { heading: "Document returned", button: "View decision", action: "The document was rejected. Open ERP to read the decision and check whether a correction is required." },
};

const origin = "https://erp.algt.net";
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function renderDmsEmail(input: DmsEmailEvent, notificationId: number, employee?: { name: string; code: string }) {
  const event = dmsEmailEvent.parse(input);
  const link = `${origin}/dms/documents/record/${event.documentId}?notice=${id.parse(notificationId)}`;
  const { heading, button, action } = copy[event.event];
  const label = dmsEmailDocumentLabel(event.typeCode);
  const date = label && event.expiry && ["expiry", "overdue"].includes(event.event) ? dateFormat.format(new Date(event.expiry + "T00:00:00Z")) : null;
  const person = label && event.employeeId && employee ? `${employee.name} (${employee.code})` : null;
  const subject = `${date ? `${event.event === "overdue" ? "Expired" : "Expires"} ${date}` : heading} · ${event.documentNo}`;
  const details = [
    ["Document", event.documentNo], ...(label ? [["Document type", label]] : []),
    ...(person ? [["Employee", person]] : []), ...(date ? [["Expiry date", date]] : []),
  ];
  const h = escapeEmailHtml;
  return {
    subject,
    textBody: `${heading}\n\n${details.map(([name, value]) => `${name}: ${value}`).join("\n")}\n\n${action}\n\n${button}: ${link}\n\nALGT ERP`,
    htmlBody: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(subject)}</title></head>
<body style="margin:0;background:#edf1f6;color:#20324d;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#edf1f6;"><tr><td align="center" style="padding:24px 10px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dce3ec;">
<tr><td style="padding:24px 28px;background:#20324d;color:#fff;border-bottom:4px solid #ffc400;">
<img src="${origin}/api/branding/public/app_logo" width="84" alt="ALGT logo" style="display:block;border:0;margin-bottom:10px;"><strong>ALGT ERP</strong></td></tr>
<tr><td style="padding:28px;">
<h1 style="margin:0 0 18px;font-size:25px;line-height:1.25;">${h(heading)}</h1>
<table width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;border-left:3px solid #ffc400;">${details.map(([name, value]) =>
    `<tr><th scope="row" align="left" style="padding:8px 10px;font-size:14px;color:#475569;">${h(name)}</th><td style="padding:8px 10px;font-size:14px;">${h(value)}</td></tr>`).join("")}</table>
<p style="margin:20px 0;font-size:16px;line-height:1.5;">${h(action)}</p>
<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="#ffc400" style="border-radius:4px;"><a href="${h(link)}" style="display:inline-block;padding:12px 20px;color:#172940;text-decoration:none;font-size:15px;font-weight:bold;">${h(button)}</a></td></tr></table>
<p style="margin:20px 0 0;color:#475569;font-size:13px;">Sign in with your ERP account to open the record.</p>
</td></tr><tr><td style="padding:14px 28px;background:#f8fafc;color:#475569;font-size:13px;">ALGT ERP · erp.algt.net</td></tr></table>
</td></tr></table></body></html>`,
  };
}
