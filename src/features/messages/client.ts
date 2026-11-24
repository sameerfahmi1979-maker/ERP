import { root, limitBytes, type Args, type Page } from "./model";
import { communicationSignal, messagingSessionTag } from "./offline-session";

export function chatFetch(url: string, init: RequestInit) {
  const headers = new Headers(init.headers);
  const tag = messagingSessionTag();
  if (tag) headers.set("X-ERP-Communication-Session", tag);
  const signal = communicationSignal(init.signal ?? undefined);
  signal.throwIfAborted();
  return fetch(url, { ...init, headers, signal });
}

export class ChatError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function check(response: Response) {
  if (!response.ok) {
    const envelope = await response.json().catch(() => null);
    throw new ChatError(
      response.status,
      envelope?.error?.message || "The ERP could not complete this request.",
    );
  }
  return response;
}
export async function command<T>(op: string, args: Args = {}, signal?: AbortSignal): Promise<T> {
  const response = await check(
    await chatFetch(root, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, args }),
      signal,
    }),
  );
  const envelope = await response.json();
  if (envelope.success !== true) throw new Error("The ERP did not confirm this operation.");
  return envelope.data;
}
const uncertain = new Map<string, ReturnType<typeof crypto.randomUUID>>();
export async function mutate<T>(
  op: string,
  args: Args,
  key?: ReturnType<typeof crypto.randomUUID>,
  signal?: AbortSignal,
) {
  signal = communicationSignal(signal);
  if (key) return command<T>(op, { ...args, clientMutationId: key }, signal);
  const bytes = new TextEncoder().encode(JSON.stringify([messagingSessionTag(), op, args]));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
  const id = uncertain.get(digest) ?? crypto.randomUUID();
  uncertain.set(digest, id);
  try {
    const result = await command<T>(op, { ...args, clientMutationId: id }, signal);
    uncertain.delete(digest);
    return result;
  } catch (error) {
    if (error instanceof ChatError && error.status < 500) uncertain.delete(digest);
    throw error;
  }
}
export async function pages<T>(op: string, args: Args, signal?: AbortSignal) {
  const items: T[] = [];
  let cursor: string | null = null;
  const cursors = new Set<string>();
  do {
    const page: Page<T> = await command(op, { ...args, limit: 100, ...(cursor && { cursor }) }, signal);
    items.push(...page.items);
    cursor = page.nextCursor;
    if (cursor && cursors.has(cursor)) throw Error("Pagination did not advance. Refresh and try again.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return items;
}
export async function upload(
  conversationId: string,
  file: File,
  voice: boolean,
  key: ReturnType<typeof crypto.randomUUID>,
  signal?: AbortSignal,
) {
  if (!file.size || file.size > limitBytes)
    throw Error("Each file must contain data and be 50 MiB or smaller.");
  const mime = (file.type || "application/octet-stream").split(";")[0];
  const { uploadId } = await mutate<{ uploadId: string }>(
    "chat.uploadBegin",
    {
      conversationId,
      filename: file.name,
      mime,
      byteLength: file.size,
      ...(voice && { kind: "voice" }),
    },
    key,
    signal,
  );
  const status = await command<{ state: string }>("chat.uploadStatus", { uploadId }, signal);
  if (!["verified", "attached"].includes(status.state)) {
    const response = await check(
      await chatFetch(root + "/uploads/" + encodeURIComponent(uploadId), {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": mime },
        body: file,
        signal,
      }),
    );
    const envelope = await response.json();
    if (!envelope.success || !["verified", "attached"].includes(envelope.data?.state))
      throw Error("File verification is incomplete.");
  }
  return uploadId;
}
export async function exportChat(args: Args, signal?: AbortSignal) {
  const lifecycle = communicationSignal(signal);
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: { description: string; accept: Record<string, string[]> }[];
      }) => Promise<FileSystemFileHandle>;
    }
  ).showSaveFilePicker;
  const file = picker
    ? await picker.call(window, {
        suggestedName: "chat-transcript.zip",
        types: [{ description: "Chat transcript and attachments", accept: { "application/zip": [".zip"] } }],
      })
    : null;
  lifecycle.throwIfAborted();
  const response = await check(
    await chatFetch(root + "/export", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal,
    }),
  );
  if (!response.headers.get("content-type")?.includes("application/zip"))
    throw Error("The ERP did not return an export.");
  if (file && response.body) {
    await response.body.pipeTo(await file.createWritable(), { signal: lifecycle });
  } else {
    const blob = await response.blob();
    lifecycle.throwIfAborted();
    download(blob, "chat-transcript.zip");
  }
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "The request failed.";
}
