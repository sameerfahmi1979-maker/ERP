// Offline-testable safety boundaries for the root-only DMS local harness.
// These helpers do not connect to Auth, the database, or the fixture ledger.
export function planDmsFixturePermission(existing: unknown, ledgerRows: object[]) {
  if (!Array.isArray(existing) || existing.length > 1) {
    throw new Error('Expected at most one exact permission definition');
  }
  if (!existing.length) return { kind: 'create' as const };
  const row = existing[0] as { id?: unknown; active?: unknown } | null;
  if (!row || !Number.isSafeInteger(row.id) || Number(row.id) <= 0 || typeof row.active !== 'boolean') {
    throw new Error('Invalid exact permission definition');
  }
  const id = Number(row.id);
  if (row.active) return { kind: 'retain' as const, id };
  const owned = ledgerRows.some(value => {
    const entry = value as { table?: unknown; id?: unknown } | null;
    return entry?.table === 'permissions' && entry.id === id;
  });
  if (!owned) throw new Error('Inactive permission is not an exact ledger-owned fixture; refusing activation');
  return { kind: 'borrow' as const, id, originalActive: false as const };
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Decode only the trusted sign-in response for cleanup bookkeeping. This is
// neither token verification nor an authorization decision. Never retain JWTs.
export function dmsFixtureSessionIdentity(accessToken: unknown, authUserId: unknown) {
  try {
    if (typeof accessToken !== 'string' || accessToken.split('.').length !== 3 || typeof authUserId !== 'string' || !uuid.test(authUserId)) throw new Error();
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    if (typeof claims.session_id !== 'string' || !uuid.test(claims.session_id) || claims.sub !== authUserId) throw new Error();
    return { sessionId: claims.session_id as string, authUserId };
  } catch {
    throw new Error('Sign-in response lacked an exact matching cleanup session identity');
  }
}

export type DmsFixtureAuthSession = {
  actor: string;
  profileId: number;
  sessionId: string;
  authUserId: string;
};
type LocalSignOutClient = { auth: { signOut(options: { scope: 'local' }): Promise<{ error: unknown }> } };

export async function cleanDmsFixtureSessions(
  clients: Record<string, LocalSignOutClient>,
  sessions: DmsFixtureAuthSession[],
  readRemaining: (exactSessionIds: string[]) => string[],
) {
  const failures: string[] = [];
  const signOut: { actor: string; sessionId: string | null; succeeded: boolean; threw: boolean }[] = [];
  for (const [actor, client] of Object.entries(clients)) {
    const result = { actor, sessionId: sessions.find(session => session.actor === actor)?.sessionId ?? null, succeeded: false, threw: false };
    try {
      result.succeeded = (await client.auth.signOut({ scope: 'local' })).error == null;
    } catch {
      result.threw = true;
    }
    if (!result.succeeded) failures.push(`Local sign-out failed for fixture actor ${actor}`);
    signOut.push(result);
  }
  const exactSessionIds = [...new Set(sessions.map(session => session.sessionId))];
  let remainingSessionIds: string[] = [];
  let verified = false;
  try {
    if (exactSessionIds.some(id => !uuid.test(id))) throw new Error();
    const remaining = exactSessionIds.length ? readRemaining(exactSessionIds) : [];
    if (!Array.isArray(remaining) || remaining.some(id => !exactSessionIds.includes(id))) throw new Error();
    remainingSessionIds = remaining;
    verified = true;
    if (remaining.length) failures.push('Exact fixture Auth sessions remain after local sign-out');
  } catch {
    failures.push('Could not verify exact fixture Auth session cleanup');
  }
  return { signOut, remainingSessionIds, verified, failures };
}
