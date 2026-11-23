export type Mode = "participant" | "review";
export type Args = Record<string, unknown>;
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export interface WorkIdentity {
  profileId: string;
  name: string;
  photoRef?: string;
  jobTitle?: string;
  companyName?: string;
  branchName?: string;
}
export interface Member extends WorkIdentity {
  role: "owner" | "admin" | "member";
  joinedAt: string;
}
export interface Conversation {
  id: string;
  kind: "direct" | "group";
  title: string;
  peerProfileId?: string;
  ownerProfileId?: string;
  revision: string;
  changeSeq: string;
  latestSeq: string;
  unreadCount: number;
  muted: boolean;
  archived: boolean;
  canManageMembers: boolean;
  canManageAdmins: boolean;
  canPin: boolean;
}
export interface Attachment {
  id: string;
  messageId: string;
  conversationId: string;
  kind: string;
  filename: string;
  mime: string;
  byteLength: number;
}
export interface Message {
  id: string;
  conversationId: string;
  seq: string;
  revision: string;
  senderProfileId?: string;
  senderName?: string;
  sentAt: string;
  editedAt?: string;
  kind: string;
  deleted: boolean;
  forwarded: boolean;
  body?: string;
  attachments: Attachment[];
  reply?: { id: string; deleted: boolean; body?: string };
  mentions: string[];
  reactions: { emoji: string; profileId: string }[];
  starred: boolean;
  pinned: boolean;
  dmsRef?: { shareId: string; token: string };
}
export interface Profile {
  profileId: string;
  canCreateGroup: boolean;
  canReviewHistory: boolean;
  isGlobalSystemAdmin: boolean;
  chat: { eligible: boolean; configured: boolean; availability: string; reason: string };
}
export interface Policy {
  accepted: boolean;
  currentVersion: string | null;
  termsText: string | null;
  privacyPath: string;
  canModerate: boolean;
}
export interface SearchHit {
  kind: string;
  id: string;
  conversationId?: string;
  messageId?: string;
  label: string;
  snippet?: string;
}
export const limitBytes = 52_428_800;
export const root = "/api/mobile/communications/v1";
export function documentToken(link: string, origin: string) {
  const url = new URL(link, origin);
  if (
    url.origin !== origin ||
    url.pathname !== "/api/mobile/dms/shared" ||
    url.search ||
    !/^#[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(url.hash)
  )
    throw Error("Paste a controlled ERP document share link.");
  return url.hash.slice(1);
}
export function dateInterval(from: string, through: string) {
  if (from && through && from > through) throw Error("The end date must follow the start date.");
  function midnight(value: string, offset: number) {
    const parts = value.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2] + offset).toISOString();
  }
  return { ...(from && { from: midnight(from, 0) }), ...(through && { until: midnight(through, 1) }) };
}
export function canChange(m: Message, c: Conversation, profileId: string, now: number) {
  const own = m.senderProfileId === profileId;
  const within = own && now < Date.parse(m.sentAt) + 15 * 60_000;
  const ordinary = !m.deleted && Boolean(m.senderProfileId) && m.kind !== "notice" && m.kind !== "system";
  return { edit: ordinary && within, remove: ordinary && (within || (!own && c.canManageMembers)) };
}
export function usdMicros(input: string) {
  if (!/^\d+(?:\.\d{1,6})?$/.test(input))
    throw Error("Enter a positive USD amount with up to six decimal places.");
  const [usd, fraction = ""] = input.split(".");
  const value = BigInt(usd) * BigInt(1000000) + BigInt(fraction.padEnd(6, "0"));
  if (value <= BigInt(0)) throw Error("The maximum must be positive.");
  return String(value);
}
