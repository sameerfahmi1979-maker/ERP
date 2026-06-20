import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDataQualityFinding } from './finding-builder';

const BATCH_LIMIT = 200;

export async function scanDmsRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // Documents with no content record (missing extraction)
  const { data: docsWithoutContent } = await supabase
    .from('dms_documents')
    .select('id, title, status')
    .eq('status', 'active')
    .not('id', 'in', `(SELECT document_id FROM dms_document_content)`)
    .limit(BATCH_LIMIT);

  for (const doc of docsWithoutContent ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'DMS_DOCUMENT_MISSING_CONTENT',
        entity_type: 'dms_document',
        entity_id: doc.id,
        source_table: 'dms_documents',
        title: 'DMS Document Missing Extracted Content',
        description: `Document (ID: ${doc.id}) has no extracted content record.`,
        evidence: { source: 'dms_documents', issue: 'no_content_record', document_status: doc.status },
      })
    );
  }

  // Expired documents
  const { data: expiredDocs } = await supabase
    .from('dms_documents')
    .select('id, title, expiry_date, status')
    .eq('status', 'active')
    .lt('expiry_date', now.toISOString())
    .not('expiry_date', 'is', null)
    .limit(BATCH_LIMIT);

  for (const doc of expiredDocs ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'DMS_DOCUMENT_EXPIRED',
        entity_type: 'dms_document',
        entity_id: doc.id,
        source_table: 'dms_documents',
        source_field: 'expiry_date',
        title: 'DMS Document Expired',
        description: `Document (ID: ${doc.id}) has passed its expiry date.`,
        evidence: { source: 'dms_documents', issue: 'expired' },
      })
    );
  }

  // Expiring within 30 days
  const { data: expiringDocs } = await supabase
    .from('dms_documents')
    .select('id, title, expiry_date, status')
    .eq('status', 'active')
    .gte('expiry_date', now.toISOString())
    .lte('expiry_date', thirtyDaysOut)
    .not('expiry_date', 'is', null)
    .limit(BATCH_LIMIT);

  for (const doc of expiringDocs ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'DMS_DOCUMENT_EXPIRING_SOON',
        entity_type: 'dms_document',
        entity_id: doc.id,
        source_table: 'dms_documents',
        source_field: 'expiry_date',
        title: 'DMS Document Expiring Soon',
        description: `Document (ID: ${doc.id}) expires within 30 days.`,
        evidence: { source: 'dms_documents', issue: 'expiring_soon' },
      })
    );
  }

  // Orphaned document links — links whose entity_id is null/zero
  const { data: orphanedLinks } = await supabase
    .from('dms_document_links')
    .select('id, document_id, entity_type, entity_id')
    .is('entity_id', null)
    .limit(BATCH_LIMIT);

  for (const link of orphanedLinks ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'DMS_ORPHANED_DOCUMENT_LINK',
        entity_type: 'dms_document',
        entity_id: link.document_id,
        source_table: 'dms_document_links',
        title: 'DMS Document Link — Unknown Entity',
        description: `Document (ID: ${link.document_id}) has a link with no valid entity_id.`,
        evidence: {
          source: 'dms_document_links',
          link_id: link.id,
          entity_type: link.entity_type,
          issue: 'null_entity_id',
        },
      })
    );
  }

  return findings;
}
