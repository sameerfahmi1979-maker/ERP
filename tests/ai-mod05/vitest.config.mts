import {defineConfig,mergeConfig} from 'vitest/config';
import previous from '../ai-mod04/vitest.config.mts';
export default mergeConfig(previous,defineConfig({test:{include:['tests/ai-mod05/*.test.ts','tests/ai-mod05/*.test.tsx']}}));
