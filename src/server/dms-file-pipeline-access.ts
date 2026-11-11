import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getAuthContext } from '@/lib/rbac/check';
import { canRunDmsFilePipeline } from '@/lib/dms/file-pipeline-access';

export async function requireDmsFilePipelineAccess(documentId: number): Promise<string | null> {
  try {
    const ctx = await getAuthContext();
    if (!Number.isSafeInteger(documentId) || documentId < 1 || !canRunDmsFilePipeline(ctx))
      return 'Only a DMS manager or administrator with access to this document can run the AI pipeline.';
    const { data, error } = await (await createClient()).rpc('dms_can_run_file_pipeline', { p_document: documentId });
    if (error) return 'AI pipeline access could not be verified. No new request was started.';
    return data === true ? null : 'Only a DMS manager or administrator within this document’s scope can run the AI pipeline.';
  } catch { return 'AI pipeline access could not be verified. No new request was started.'; }
}
