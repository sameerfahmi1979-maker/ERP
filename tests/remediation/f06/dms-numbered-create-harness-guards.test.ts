import { describe, expect, it, vi } from 'vitest';
import { cleanDmsFixtureSessions, dmsFixtureSessionIdentity, planDmsFixturePermission } from './dms-numbered-create-harness-guards';

const sessionId = 'f35f0874-62a9-4fb5-a111-860587c67f00';
const otherSessionId = 'f35f0874-62a9-4fb5-a111-860587c67f01';
const authUserId = 'c2fe6019-e915-4310-bc5d-1d60265d2e13';
const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const sessions = [{ actor: 'reader', profileId: 3, sessionId, authUserId }, { actor: 'companyA', profileId: 4, sessionId: otherSessionId, authUserId }];

describe('exact fixture permission ownership', () => {
  it('creates absent definitions and leaves active existing definitions unchanged', () => {
    expect(planDmsFixturePermission([], [])).toEqual({ kind: 'create' });
    expect(planDmsFixturePermission([{ id: 110, active: true }], [])).toEqual({ kind: 'retain', id: 110 });
  });
  it('borrows only the exact numeric permission ID already recorded in the ledger', () => {
    expect(planDmsFixturePermission([{ id: 753, active: false }], [{ table: 'permissions', id: 753 }])).toEqual({ kind: 'borrow', id: 753, originalActive: false });
  });
  it.each([[], [{ table: 'permissions', id: 754 }], [{ table: 'roles', id: 753 }], [{ table: 'permissions', id: '753' }], [{ table: 'permissions', permission_code: 'dms.documents.view' }]].map(ledger => ({ ledger })))('refuses unowned or inferred ownership: %j', ({ ledger }) => {
    expect(() => planDmsFixturePermission([{ id: 753, active: false }], ledger)).toThrow('not an exact ledger-owned fixture');
  });
  it.each([null, [{ id: 1, active: false }, { id: 2, active: false }], [{ id: '753', active: false }], [{ id: -1, active: false }], [{ id: 753, active: null }]].map(rows => ({ rows })))('refuses ambiguous or invalid database results: %j', ({ rows }) => {
    expect(() => planDmsFixturePermission(rows, [{ table: 'permissions', id: 753 }])).toThrow();
  });
});

describe('exact Auth session cleanup bookkeeping', () => {
  it('retains only the exact session and Auth user IDs, never the token', () => {
    const accessToken = token({ session_id: sessionId, sub: authUserId, privateValue: 'never retained' });
    expect(dmsFixtureSessionIdentity(accessToken, authUserId)).toEqual({ sessionId, authUserId });
    expect(JSON.stringify(dmsFixtureSessionIdentity(accessToken, authUserId))).not.toContain(accessToken);
  });
  it.each([undefined, 'PRIVATE_JWT_MUST_NOT_LEAK', token({ session_id: 'invalid', sub: authUserId }), token({ session_id: sessionId, sub: 'another user' })])('rejects invalid identity with a fixed non-secret error: %j', accessToken => {
    expect(() => dmsFixtureSessionIdentity(accessToken, authUserId)).toThrow('Sign-in response lacked an exact matching cleanup session identity');
  });
  it('signs out every client locally and verifies only recorded exact session IDs', async () => {
    const first = vi.fn().mockResolvedValue({ error: null });
    const second = vi.fn().mockResolvedValue({ error: null });
    const read = vi.fn().mockReturnValue([]);
    const result = await cleanDmsFixtureSessions({ reader: { auth: { signOut: first } }, companyA: { auth: { signOut: second } } }, sessions, read);
    expect(first).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(second).toHaveBeenCalledExactlyOnceWith({ scope: 'local' });
    expect(read).toHaveBeenCalledExactlyOnceWith([sessionId, otherSessionId]);
    expect(result).toMatchObject({ verified: true, remainingSessionIds: [], failures: [] });
  });
  it('continues after returned and thrown sign-out errors, still verifies, and excludes private error contents', async () => {
    const read = vi.fn().mockReturnValue([sessionId]);
    const result = await cleanDmsFixtureSessions({ reader: { auth: { signOut: vi.fn().mockResolvedValue({ error: { message: 'PRIVATE_TOKEN' } }) } }, companyA: { auth: { signOut: vi.fn().mockRejectedValue(Error('PRIVATE_TOKEN')) } }, anonymous: { auth: { signOut: vi.fn().mockResolvedValue({ error: null }) } } }, sessions, read);
    expect(result.signOut).toHaveLength(3);
    expect(result.signOut[2].succeeded).toBe(true);
    expect(result.failures).toHaveLength(3);
    expect(result.remainingSessionIds).toEqual([sessionId]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_TOKEN');
  });
  it('fails closed when cleanup verification cannot run', async () => {
    const result = await cleanDmsFixtureSessions({}, sessions, () => { throw Error('PRIVATE_DATABASE_ERROR'); });
    expect(result.verified).toBe(false);
    expect(result.failures).toEqual(['Could not verify exact fixture Auth session cleanup']);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_DATABASE_ERROR');
  });
  it('refuses a verification result outside the exact recorded session set', async () => {
    const result = await cleanDmsFixtureSessions({}, sessions, () => [authUserId]);
    expect(result.verified).toBe(false);
    expect(result.failures).toHaveLength(1);
  });
});
