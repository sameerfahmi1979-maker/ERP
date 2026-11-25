import "server-only";
import {z} from "zod";
import type {createClient} from "@/lib/supabase/server";

const id = z.number().int().positive().safe();
const tagDetails = z.object({
  tag_id: id,
  tag: z.object({tag_name: z.string(), color_hex: z.string().nullable()}).nullable(),
});
const tagGroups = z.array(z.object({document_id: id, tags: z.array(tagDetails).nonempty()}));

export async function readDmsPageTags(db: Awaited<ReturnType<typeof createClient>>, documentIds: number[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const tags = new Map<number, Array<{tag_id: number; tag?: {tag_name: string; color_hex: string | null}}>>();
  if (!documentIds.length) return tags;
  const requested = new Set(documentIds);
  if (requested.size > 100 || !z.array(id).safeParse(documentIds).success) {
    throw Error("Invalid document tag page");
  }
  const query = db.rpc("dms_tag_details_for_documents", {document_ids: [...requested]},
    {get: true, count: "exact"}).order("document_id").range(0, requested.size - 1);
  const result = await (signal ? query.abortSignal(signal) : query);
  signal?.throwIfAborted();
  const parsed = tagGroups.safeParse(result.data);
  if (result.error || !parsed.success || result.count !== parsed.data.length) {
    throw Error("Document tag page unavailable");
  }
  for (const group of parsed.data) {
    if (!requested.has(group.document_id) || tags.has(group.document_id) ||
      new Set(group.tags.map(tag => tag.tag_id)).size !== group.tags.length) {
      throw Error("Document tag page could not be verified");
    }
    tags.set(group.document_id, group.tags.map(({tag_id, tag}) => ({tag_id, tag: tag ?? undefined})));
  }
  return tags;
}
