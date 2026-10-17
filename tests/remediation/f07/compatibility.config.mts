import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fluentTestAliases,fluentTestServer} from '../fluent-test-config.mts';
export default defineConfig({resolve:{alias:{...fluentTestAliases,'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},
 oxc:{jsx:{runtime:'automatic'}},test:{server:fluentTestServer,environment:'node',fileParallelism:false,
 setupFiles:['tests/remediation/f01/offline-setup.ts','tests/remediation/f04/browser-storage.setup.ts'],
 include:[
  'tests/remediation/f07/*.test.{ts,tsx}',
  'tests/remediation/f05/embedded-lists.test.tsx','tests/remediation/f05/ui02-approval.test.tsx',
  'tests/remediation/f06/dms-batch-admission.test.ts','tests/remediation/f06/dms-numbered-upload-create.test.ts',
  'tests/remediation/f06/dms-numbered-ai-approval.test.ts','tests/remediation/f06/dms-numbered-batch-draft.test.ts',
  'tests/remediation/f06/dms-numbered-ai-approval-caller.test.tsx',
  'tests/remediation/f06/dms-numbered-create.test.ts','tests/remediation/f06/dms-numbered-create-form.test.tsx','tests/remediation/f06/dms-creation-session.test.tsx',
  'tests/remediation/f06/party-correction-contract.test.ts','tests/remediation/f06/party-correction-ui.test.tsx',
  'tests/remediation/f06/correction-history-read.test.ts','tests/remediation/f06/correction-history-ui.test.tsx',
  'src/lib/dms/apply-to-erp/__tests__/*.test.ts','src/lib/dms/apply-correction/__tests__/*.test.ts',
  'src/server/actions/dms/__tests__/ocr-saving.test.ts','src/server/actions/dms/__tests__/ocr-status-projection.test.ts',
  'src/lib/dms/ocr/__tests__/*.test.ts','src/lib/dms/ai/__tests__/openai-ocr.test.ts','src/lib/dms/ai/__tests__/ocr-selection.test.ts',
  'src/features/dms/documents/sections/__tests__/recent-ocr-jobs-list.test.ts','src/features/dms/documents/sections/__tests__/ocr-read-state.test.ts',
  'tests/performance/p04-dms-collections.test.ts','tests/performance/p04-dms-section-consumers.test.tsx',
  'tests/remediation/f03/dms-load-error.test.tsx','tests/remediation/f04/upload-dialog-acceptance.test.tsx',
  'tests/remediation/f05/ui02-completion.test.tsx','tests/remediation/f06/party-dms-ui.test.tsx',
  'tests/performance/p04-dms-history.test.ts','tests/performance/hr-document-browser-dms-invalidation.test.tsx',
 ],exclude:['**/*.live.test.ts','**/*.local.test.ts']}});
