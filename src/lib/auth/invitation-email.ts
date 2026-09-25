/** F03-owned, email-client-safe invitation presentation. No network or secret persistence. */
export function escapeEmailHtml(text: string): string {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export function renderInvitationEmail(input: {
  displayName: string; appName: string; siteUrl: string; logoPath: string;
  actionLink: string; expiresAt: string; supportEmail?: string | null;
}) {
  const origin = new URL(input.siteUrl);
  if (origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)))) throw new Error("Invalid email origin");
  const action = new URL(input.actionLink);
  const logo = new URL(input.logoPath, origin);
  if (action.origin !== origin.origin || action.pathname !== "/auth/verify" || action.username || action.password || action.hash ||
    !/^[A-Za-z0-9_-]{43}$/.test(action.searchParams.get("invitation") ?? "") || [...action.searchParams.keys()].length !== 1 ||
    logo.origin !== origin.origin || logo.username || logo.password || logo.hash || logo.pathname !== "/api/branding/public/app_logo") throw new Error("Invalid invitation email link");
  const expiry = new Date(input.expiresAt);
  if (!Number.isFinite(expiry.getTime())) throw new Error("Missing invitation expiry");
  const expires = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Dubai" }).format(expiry) + " (Dubai time)";
  const name = input.displayName.trim() || "there";
  const app = input.appName.trim() || "ALGT ERP";
  const support = input.supportEmail?.trim();
  const safeSupport = support && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(support) ? support : null;
  const h = escapeEmailHtml;
  const subject = `Your invitation to ${app}`.replace(/[\r\n]/g, " ");
  const textBody = `Hello ${name},\n\nWelcome to ${app}. Your administrator has invited you to your company's ERP workspace.\n\nSet up your password: ${action.href}\n\nThis one-time invitation is valid for 24 hours from issue, until ${expires}. A newer invitation replaces this one. After verification, complete password setup within 15 minutes.\n\nNo existing password is needed. Your administrator controls which parts of the ERP you can access.\n\nIf you did not expect this invitation, do not activate it. Never forward the link or share your password.\n\nNeed help? ${safeSupport ?? "Contact your ERP administrator."}\n${origin.host}`;
  const htmlBody = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${h(subject)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:16px 8px!important}.content{padding:28px 22px!important}.title{font-size:30px!important;line-height:36px!important}.brand{padding:26px 22px!important}}</style></head>
<body style="margin:0;padding:0;background:#edf1f6;color:#20324d;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Your ALGT workspace is ready. Create your password within 24 hours.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edf1f6;"><tr><td class="outer" align="center" style="padding:40px 16px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #dce3ec;">
<tr><td class="brand" style="padding:30px 36px;background:#20324d;border-bottom:5px solid #ffc400;">
<img src="${h(logo.href)}" width="92" alt="ALGT logo" style="display:block;width:92px;max-width:100%;height:auto;border:0;">
<p style="margin:18px 0 0;color:#ffffff;font-size:14px;font-weight:bold;letter-spacing:2px;">${h(app)}</p></td></tr>
<tr><td class="content" style="padding:36px;">
<p style="margin:0 0 14px;color:#64748b;font-size:12px;font-weight:bold;letter-spacing:2px;">YOUR INVITATION</p>
<h1 class="title" style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:38px;line-height:44px;font-weight:normal;color:#20324d;">A warm welcome.<br>Your workspace awaits.</h1>
<p style="margin:0 0 14px;font-size:16px;line-height:26px;">Hello ${h(name)},</p>
<p style="margin:0 0 26px;font-size:16px;line-height:26px;color:#475569;">You’ve been invited to <strong>${h(app)}</strong>. Start by creating your own password. No existing password is needed.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#ffc400" style="border-radius:6px;background:#ffc400;"><a href="${h(action.href)}" style="display:inline-block;padding:16px 26px;border:1px solid #ffc400;border-radius:6px;color:#172940;font-size:16px;line-height:22px;font-weight:bold;text-decoration:none;mso-padding-alt:0;text-underline-color:#ffc400;"><!--[if mso]><i style="mso-font-width:130%;mso-text-raise:24pt;" hidden>&emsp;</i><![endif]-->Set up your password<!--[if mso]><i style="mso-font-width:130%;" hidden>&emsp;&#8203;</i><![endif]--></a></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td style="padding:18px 20px;background:#f4f7fb;border-left:3px solid #ffc400;">
<p style="margin:0 0 6px;font-size:14px;font-weight:bold;line-height:22px;">Valid for 24 hours from issue</p>
<p style="margin:0;font-size:14px;line-height:22px;color:#475569;">Activate by ${h(expires)}.<br>A newer invitation replaces this one.</p></td></tr></table>
<p style="margin:22px 0 0;font-size:14px;line-height:23px;color:#475569;">After verification, you have 15 minutes to finish password setup. Your administrator controls which parts of the ERP you can access.</p>
<p style="margin:18px 0 0;font-size:13px;line-height:22px;color:#64748b;">If the button does not open, <a href="${h(action.href)}" style="color:#20324d;text-decoration:underline;">open your secure invitation</a>. Do not forward this email or share your password.</p>
</td></tr>
<tr><td class="content" style="padding:24px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;">
<p style="margin:0 0 8px;font-size:13px;line-height:21px;color:#475569;">Need help? ${safeSupport ? `<a href="mailto:${h(safeSupport)}" style="color:#20324d;text-decoration:underline;">Contact your ERP administrator</a>.` : "Contact your ERP administrator."}</p>
<p style="margin:0;font-size:12px;line-height:20px;color:#64748b;">If you weren’t expecting this invitation, do not activate it.<br>${h(app)} &nbsp;·&nbsp; ${h(origin.host)}</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, textBody, htmlBody };
}
