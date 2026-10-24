import {mergeConfig} from 'vitest/config';import baseline from './compensation-acceptance.config.mts';
// Non-browser final F12 + search and changed shared section/draft compatibility.
export default mergeConfig(baseline,{test:{include:['tests/performance/hr-search*.test.{ts,tsx}','tests/performance/p04-hr-search-schema.test.ts','tests/remediation/f04/controlled-draft.test.tsx','tests/remediation/f04/save-session.test.tsx']}});
