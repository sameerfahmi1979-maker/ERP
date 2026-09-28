import { vi } from 'vitest';
// Unit tests run in Node, not a browser bundle. Next enforces this boundary in builds.
vi.mock('server-only', () => ({}));
