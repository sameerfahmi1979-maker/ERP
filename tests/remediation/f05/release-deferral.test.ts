import {readFileSync,readdirSync} from 'node:fs';
import {expect,it} from 'vitest';
// Intentionally supersedes the F05-only deferral. No global auth/UI rollback.
const read=(path:string)=>readFileSync(path,'utf8');
it('F09 integrates after F08 with the server font adapter and shared fenced sender',()=>{
 expect(read('src/lib/report-center/schedule-execution.ts')).toContain('generateServerAttachmentByType');
 expect(read('src/lib/report-center/schedule-worker.ts')).toContain('processQueuedBatch');
 expect(read('src/app/api/internal/process-email-queue/route.ts')).not.toContain('new MicrosoftGraphEmailProvider');
 expect(read('src/lib/email/queue/service.ts')).toContain('F09_EMAIL_WORKER_ENABLED === "true"');
 expect(readdirSync('supabase/migrations').filter(p=>/_f09_/.test(p))).toEqual(['20261018090904_f09_integrated_delivery_foundation.sql','20261018093032_f09_schedule_recovery_and_review.sql','20261018100339_f09_dms_delivery_projection.sql','20261018102324_f09_dms_reminder_intent_fence.sql']);
});
it('keeps the later F05 authentication transport and independently owned DMS migrations',()=>{
 expect(read('src/app/api/auth/login/route.ts')).toContain('POST');
 expect(read('src/app/api/auth/logout/route.ts')).toContain('POST');
 expect(readdirSync('supabase/migrations').filter(p=>/_f05_/.test(p))).toEqual(['20260930164345_f05_dms_workflow_atomic_configuration.sql','20260930175323_f05_dms_atomic_approval_steps.sql']);
});
