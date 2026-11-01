import {defineConfig}from 'vitest/config';
import previous from './vitest.final.config.mts';
export default defineConfig({...previous,test:{...previous.test,include:[
 'tests/performance/dms-rpc-null-args.test.ts','tests/ai-mod02/document-service.test.ts','tests/ai-mod02/api-contract.test.ts',
 'tests/performance/dms-browser-read.test.ts','tests/performance/hr-document-browser-read.test.ts','tests/performance/hr-search-read.test.ts',
]}});
