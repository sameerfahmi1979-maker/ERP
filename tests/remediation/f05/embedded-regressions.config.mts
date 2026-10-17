import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fluentTestAliases,fluentTestServer} from '../fluent-test-config.mts';

// Entire F04/F05 suites plus affected OCR, paging and save/recovery components.
// In-process tests only. Excludes every opt-in native/live/local test harness.
export default defineConfig({
  resolve:{alias:{...fluentTestAliases,'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},
  oxc:{jsx:{runtime:'automatic'}},
  test:{server:fluentTestServer,environment:'node',fileParallelism:false,
    setupFiles:['tests/remediation/f01/offline-setup.ts','tests/remediation/f04/browser-storage.setup.ts'],
    exclude:['**/*.live.test.ts','**/*.local.test.ts'],
    include:[
      'tests/remediation/f04/*.test.{ts,tsx}','tests/remediation/f05/*.test.{ts,tsx}',
      'src/features/dms/documents/sections/__tests__/*.test.ts',
      'tests/performance/p04-dms-section-consumers.test.tsx',
      'tests/performance/hr-document-browser-*.test.{ts,tsx}',
      'tests/performance/p04-hr-employee-*.test.{ts,tsx}',
      'tests/remediation/f06/party-child-save-session.test.tsx',
      'tests/remediation/f06/party-service-assignment-ui.test.tsx',
      'tests/remediation/f06/party-finance-read-recovery.test.tsx',
      'tests/remediation/f06/party-revision-recovery.test.tsx',
      'tests/remediation/f06/numbered-recruitment-mounted.test.tsx',
    ],
  },
});
