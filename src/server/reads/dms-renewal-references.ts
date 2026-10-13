import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { renewalRowsSchema } from "./dms-renewal-contract";

export const renewalBaseRowsSchema = z.array(renewalRowsSchema.element.omit({ document: true, requester: true, assignee: true }));
export const renewalBaseSelect = `id, document_id, renewal_no, status, priority, requested_by, assigned_to,
  requested_at, target_renewal_date, old_expiry_date, new_expiry_date, replacement_document_id,
  replacement_version_id, notes, completed_at, cancelled_at, created_by, created_at, updated_at`;
const documentsSchema = z.array(renewalRowsSchema.element.shape.document.unwrap());
const peopleSchema = z.array(z.object({ id: z.number().int().positive(), full_name: z.string().nullable() }));

/** Bounded ordinary-caller hydration avoids a protected-document evaluation for
 * every embedded renewal. Missing RLS-hidden references remain null; failed or
 * truncated reference reads must never masquerade as hidden references. */
export async function hydrateRenewalReferences(db: Awaited<ReturnType<typeof createClient>>, rows: z.infer<typeof renewalBaseRowsSchema>) {
  const result: z.infer<typeof renewalRowsSchema> = [];
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const documentIds = [...new Set(batch.map(row => row.document_id))];
    const profileIds = [...new Set(batch.flatMap(row => [row.requested_by, row.assigned_to]).filter((id): id is number => id !== null))];
    const [documents, profiles] = await Promise.all([
      db.from("dms_documents").select("id, document_no, title, expiry_date, document_type_id", { count: "exact" }).in("id", documentIds).order("id").range(0, documentIds.length - 1),
      profileIds.length ? db.from("user_profiles").select("id, full_name", { count: "exact" }).in("id", profileIds).order("id").range(0, profileIds.length - 1) : Promise.resolve({ data: [], count: 0, error: null }),
    ]);
    const docs = documentsSchema.parse(documents.data), people = peopleSchema.parse(profiles.data);
    for (const [response, values, requested] of [[documents, docs, documentIds], [profiles, people, profileIds]] as const) {
      if (response.error || response.count !== values.length || new Set(values.map(row => row.id)).size !== values.length || values.some(row => !requested.includes(row.id))) {
        throw new Error("Renewal references could not be verified. Please retry.");
      }
    }
    const docMap = new Map(docs.map(row => [row.id, row]));
    const personMap = new Map(people.map(row => [row.id, { full_name: row.full_name }]));
    result.push(...batch.map(row => ({ ...row, document: docMap.get(row.document_id) ?? null, requester: row.requested_by === null ? null : personMap.get(row.requested_by) ?? null, assignee: row.assigned_to === null ? null : personMap.get(row.assigned_to) ?? null })));
  }
  return result;
}
