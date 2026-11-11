import { afterEach, expect, it, vi } from 'vitest';
import { reminderMatchesExpiryCycle } from '../../../supabase/functions/dms-expiry-scheduler/cycle';

const { tables } = vi.hoisted(() => ({ tables: vi.fn() }));
vi.mock('https://esm.sh/@supabase/supabase-js@2.106.2', () => ({ createClient: () => ({ from: tables }) }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); vi.clearAllMocks(); });

it.each([
  ['2028-02-28', 2, '2028-03-01', true],
  ['2027-12-31', 1, '2028-01-01', true],
  ['2028-02-29', 0, '2028-02-29', true],
  ['2027-02-29', 1, '2027-03-02', false],
  ['2028-02-28', 2, '2028-03-02', false],
  ['2028-02-28', 2.5, '2028-03-01', false],
  ['2028-02-28', 2, null, false],
])('validates expiry cycle %s + %s against %s', (date, days, expiry, expected) => {
  expect(reminderMatchesExpiryCycle(date, days, expiry)).toBe(expected);
});

it('the durable scheduler queues only the current cycle and never enters its legacy email path', async () => {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }) });
  const reminder = { id: 4, document_id: 7, reminder_days_before: 30, reminder_date: '2027-12-01', document: {
    id: 7, document_no: 'SYN-7', title: 'Synthetic', status: 'active', expiry_date: '2027-12-31', owner_user_id: 21,
  } };
  tables.mockImplementation((name: string) => {
    if (name === 'dms_notification_settings') return { select: () => ({ eq: () => ({ single: async () => ({ data: { is_enabled: true, in_app_enabled: true, include_document_owner: true } }) }) }) };
    if (name === 'dms_expiry_reminders') return { update, select: () => ({ lte: () => ({ eq: () => ({ neq: () => ({ limit: async () => ({ data: [{ ...reminder, id: 3, reminder_date: '2027-11-01' }, reminder] }) }) }) }) }) };
    if (name === 'dms_notification_queue') return { insert };
    throw Error(`Unexpected table ${name}`);
  });
  const key = 'synthetic-only-'.padEnd(64, 'x');
  const environment: Record<string, string> = { DMS_SCHEDULER_SECRET: key, SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic', INTERNAL_API_SECRET: 'synthetic', F10_DURABLE_NOTIFICATIONS: 'true' };
  let serve: (req: Request) => Promise<Response> = async () => { throw Error('No handler'); };
  vi.stubGlobal('Deno', { env: { get: (name: string) => environment[name] }, serve: (fn: typeof serve) => { serve = fn; } });
  await import('../../../supabase/functions/dms-expiry-scheduler/index');
  const response = await serve(new Request('https://synthetic.invalid/', { method: 'POST', headers: { 'x-dms-scheduler-secret': key } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ steps: { step1_generate: { created: 1, skipped: 1, staleCycle: 1 }, durableAdmission: { deliveryConfirmed: false } } });
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ reminder_id: 4, recipient_user_id: 21 }));
  expect(update).toHaveBeenCalledTimes(1);
  expect(tables.mock.calls.map(([table]) => table)).not.toContain('erp_email_queue');
});
