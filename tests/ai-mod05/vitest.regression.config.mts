import {defineConfig,mergeConfig}from 'vitest/config';
import previous from '../ai-mod04/vitest.regression.config.mts';
import path from 'node:path';
const config=mergeConfig(previous,defineConfig({test:{include:['tests/ai-mod05/*.test.ts','tests/ai-mod05/*.test.tsx','src/lib/ai/observability/__tests__/*.test.ts']}}));
// Resolve setup files before Windows/JSDOM module URLs are normalized. Retain
// the actual offline network guard and storage setup in every environment.
config.test!.setupFiles=['tests/remediation/f01/offline-setup.ts','tests/remediation/f04/browser-storage.setup.ts'].map(p=>path.resolve(p));
export default config;
