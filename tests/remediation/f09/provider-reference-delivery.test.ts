import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { prepareQueuedDelivery, processQueuedEmail } from '@/lib/email/queue/service';
import type { DeliveryClaim } from '@/lib/email/queue/source';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), source: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/email/queue/source', () => ({ prepareQueueMessage: mocks.source }));

const claim = { id: 1, provider_config_id: 41, lease_owner: 'owner', lease_token: 'token', attempt_count: 1, max_attempts: 3 } as DeliveryClaim;
const credential = 'fixture-not-a-live-secret';
const credentialId = '00000000-0000-4000-8000-000000000041';
const sink: string[] = [];
let provider: Record<string, unknown>;
let rpc: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sink.length = 0;
  vi.stubEnv('F09_EMAIL_WORKER_ENABLED', 'true');
  vi.stubEnv('MICROSOFT_GRAPH_CLIENT_SECRET', credential);
  vi.stubEnv('ERP_EMAIL_PROVIDER_41_SECRET', credential);
  vi.stubEnv('ERP_EMAIL_PROVIDER_42_SECRET', 'fixture-another-provider');
  provider = { id: 41, provider_type: 'microsoft_graph', auth_mode: 'client_credentials', send_mode: 'graph_send_mail',
    tenant_id: credentialId, client_id: 'fixture-client', sender_email: 'sender@example.invalid', secret_ref: 'ERP_EMAIL_PROVIDER_41_SECRET' };
  const query = { select: () => query, is: () => query, limit: async () => ({ data: [provider], error: null }),
    eq: (key: string, value: unknown) => { if (key === 'id') expect(value).toBe(41); return query; } };
  rpc = vi.fn(async (name: string) => ({ error: null, data: name === 'erp_vault_get_secret' ? credential :
    name === 'f09_claim_email' ? [claim] : name === 'f09_admit_email_dispatch' ? 'allowed' : true }));
  mocks.admin.mockReturnValue({ from: () => query, rpc });
  mocks.source.mockResolvedValue({ to: ['scoped@example.invalid'], subject: 'Synthetic report', textBody: 'For the authorized recipient' });
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.origin === 'https://login.microsoftonline.com') {
      expect(new URLSearchParams(String(init?.body)).get('client_secret')).toBe(credential);
      return Response.json({ access_token: 'fixture-token' });
    }
    if (url.origin !== 'https://graph.microsoft.com' || !url.pathname.endsWith('/sendMail')) throw new Error('Unexpected provider call');
    sink.push(String(init?.body));
    return new Response(null, { status: 202 });
  }));
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it.each(['ERP_EMAIL_PROVIDER_41_SECRET','MICROSOFT_GRAPH_CLIENT_SECRET',`vault:${credentialId}`])('uses the real resolver and sends once to the scoped in-process mail sink for %s', async ref => {
  provider.secret_ref = ref;
  expect(await processQueuedEmail({ id: claim.id })).toBe('accepted');
  expect(sink).toHaveLength(1);
  expect(JSON.parse(sink[0]).message.toRecipients).toEqual([{ emailAddress: { address: 'scoped@example.invalid' } }]);
  if (ref.startsWith('vault:')) expect(rpc).toHaveBeenCalledWith('erp_vault_get_secret', { p_id: credentialId });
  expect(rpc).toHaveBeenLastCalledWith('f09_finish_provider_email', expect.objectContaining({ p_outcome: 'accepted' }));
});

it('rejects another provider’s environment reference before token or mail transport', async () => {
  provider.secret_ref = 'ERP_EMAIL_PROVIDER_42_SECRET';
  expect(await prepareQueuedDelivery(claim, new AbortController().signal)).toEqual({ ready: false, outcome: { kind: 'permanent' } });
  expect(fetch).not.toHaveBeenCalled();
  expect(sink).toEqual([]);
});
