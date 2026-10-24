import {mergeConfig} from 'vitest/config';
import foundations from './time-workforce-acceptance.config.mts';
import compensation from './compensation.config.mts';
// One discovery/run for current F12-04 plus prior HR/workforce/notification
// contracts after the Zod security update. Local/native operator tests excluded.
export default mergeConfig(foundations,compensation);
