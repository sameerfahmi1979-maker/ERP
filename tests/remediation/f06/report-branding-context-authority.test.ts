// Controlled database/storage ports around the real resolver and authority helpers.
// These regressions do not claim actual RLS, object-store or business-data acceptance.
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/rbac/check';
import type { ReportRegistryEntry } from '@/lib/report-center/types';

const m = vi.hoisted(() => ({
  client: vi.fn(), admin: vi.fn(), assets: vi.fn(), calls: [] as Array<{ table: string; selection: string }>,
  tables: {} as Record<string, Array<Record<string, unknown>>>, errorTable: '', throwTable: '',
  current: null as AuthContext | null, refresh: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: m.client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: m.admin }));
vi.mock('@/lib/rbac/check', () => ({ getAuthContextForProfileId: m.refresh }));
vi.mock('@/lib/branding/resolve-report-branding-assets', () => ({ resolveReportBrandingProfileAssets: async (id: number, ctx: AuthContext, revision: string) => ({urls: await m.assets(id, ctx, revision), assets: []}) }));
import { resolveReportBranding as resolveCurrent, buildFallbackResolvedTemplate as fallbackCurrent } from '@/lib/report-center/branding-resolver';
import { brandingPermission } from '@/lib/branding/asset-permissions';

const actor = (company: number | null = 1, permissions = ['reports.view'], branch: number | null = null) => ({
  isAccountActive: true, profile: { id: 11, must_change_password: false }, roleCodes: ['synthetic'],
  permissionCodes: [...permissions], globalPermissionCodes: company === null && branch === null ? [...permissions] : [],
  roleAssignments: [{ roleCode: 'synthetic', ownerCompanyId: company, branchId: branch, permissionCodes: [...permissions] }],
}) as unknown as AuthContext;
const registry = (strategy = 'auto_by_owner_company', template: number | null = null) => ({
  branding_strategy: strategy, default_template_id: template,
}) as ReportRegistryEntry;
const input = (patch: Record<string, unknown> = {}) => ({ ownerCompanyIds: [1], registryEntry: registry(), ...patch });
// Existing cases set a controlled live principal. Explicit stale-claim cases use
// resolveCurrent directly to distinguish passed identity from refreshed authority.
const resolveReportBranding: typeof resolveCurrent = (value, ctx) => { m.current = ctx; return resolveCurrent(value, ctx); };
const buildFallbackResolvedTemplate: typeof fallbackCurrent = ctx => { m.current = ctx; return fallbackCurrent(ctx); };

function client() {
  return { from(table: string) {
    const call = { table, selection: '' }; m.calls.push(call);
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const q = {
      select(selection: string) { call.selection = selection; return q; },
      eq(key: string, value: unknown) { filters.push(row => key === 'workspace_revision' ? String(row[key]) === String(value) : row[key] === value); return q; },
      is(key: string, value: unknown) { filters.push(row => row[key] === value); return q; },
      async maybeSingle() {
        if (m.throwTable === table) throw Error('PRIVATE TRANSPORT DETAIL');
        if (m.errorTable === table) return { data: null, error: { message: 'PRIVATE SQL DETAIL' } };
        const found = (m.tables[table] ?? []).filter(row => filters.every(matches => matches(row)));
        if (found.length > 1) return { data: null, error: { message: 'PRIVATE DUPLICATE DETAIL' } };
        const row = found[0];
        if (!row) return { data: null, error: null };
        return { data: structuredClone(call.selection === '*' ? row : Object.fromEntries(call.selection.split(',').map(key => [key, row[key]]))), error: null };
      },
    };
    return q;
  } };
}

beforeEach(() => {
  vi.clearAllMocks(); m.calls = []; m.errorTable = ''; m.throwTable = '';
  const profile = (id: number, company: number | null, code: string) => ({
    id, owner_company_id: company, profile_code: code, profile_name: `Profile ${id}`, is_active: true,
    is_default_for_company: company !== null, deleted_at: null, workspace_revision: 1,
    logo_url: 'https://legacy.invalid/logo', small_logo_url: 'https://legacy.invalid/small',
    watermark_url: 'https://legacy.invalid/watermark', stamp_url: 'https://legacy.invalid/STAMP', signature_url: 'https://legacy.invalid/SIGNATURE',
    signatory_name: 'Private Signer', signatory_title_en: 'Private Title', signatory_title_ar: 'Private Arabic Title',
  });
  const profiles = [profile(7, 1, 'COMPANY_1_DEFAULT'), profile(8, 2, 'COMPANY_2_DEFAULT'), profile(9, null, 'NEUTRAL_DEFAULT'), profile(10, null, 'GROUP_DEFAULT')];
  const template = (id: number, profileId: number | null, code: string) => ({
    id, branding_profile_id: profileId, template_code: code, template_name: `Template ${id}`, template_type: 'report',
    is_active: true, deleted_at: null, workspace_revision: 1, show_stamp: true, show_signatory: true,
  });
  m.tables = {
    erp_report_branding_profiles: profiles,
    erp_report_branding_profiles_safe: profiles,
    erp_report_templates: [template(21, 7, 'COMPANY_1_REPORT_TEMPLATE'), template(22, 8, 'COMPANY_2_REPORT_TEMPLATE'),
      template(23, 9, 'DEFAULT_REPORT_TEMPLATE'), template(24, 10, 'GROUP_REPORT_TEMPLATE'), template(25, null, 'NO_PROFILE')],
    owner_companies: [{ id: 1, deleted_at: null, default_report_template_id: 21, default_letter_template_id: 21 }],
  };
  m.client.mockResolvedValue(client()); m.admin.mockImplementation(client);
  m.current = actor(); m.refresh.mockImplementation(async () => m.current);
  m.assets.mockImplementation(async (id: number, ctx: AuthContext) => {
    const profile = profiles.find(row => row.id === id)!;
    return { report_logo: 'https://signed.invalid/logo', ...(brandingPermission(ctx, 'reports.sign', profile.owner_company_id) ? { stamp: 'https://signed.invalid/stamp', signature: 'https://signed.invalid/signature' } : {}) };
  });
});

it('authorized company resolution uses protected projections and governed assets only', async () => {
  const ctx = actor(); const result = await resolveReportBranding(input({ templateId: 21 }), ctx);
  expect(result.resolvedTemplate?.id).toBe(21);
  expect(result.resolvedBrandingProfile?.logo_url).toBe('https://signed.invalid/logo');
  expect(result.resolvedBrandingProfile?.stamp_url).toBeNull();
  expect(result.resolvedBrandingProfile?.signature_url).toBeNull();
  expect(result.resolvedBrandingProfile?.signatory_name).toBeNull();
  expect(m.assets).toHaveBeenCalledWith(7, ctx, '1');
  expect(m.client).not.toHaveBeenCalled();
  expect(m.calls.every(call => call.selection !== '*' && !call.selection.includes('_url'))).toBe(true);
  expect(JSON.stringify(result)).not.toContain('legacy.invalid');
});
it('a same-company manager can resolve its branding without business-data grants', async () => {
  const result = await resolveReportBranding(input({ templateId: 21 }), actor(1, ['reports.manage']));
  expect(result.resolvedTemplate?.id).toBe(21);
  expect(m.calls.every(call => ['erp_report_templates', 'erp_report_branding_profiles'].includes(call.table))).toBe(true);
});
it.each([
  ['foreign company', actor(2)], ['branch-only', actor(1, ['reports.view'], 3)], ['no role', actor(1, [])],
  ['inactive account', { ...actor(), isAccountActive: false }], ['password change', { ...actor(), profile: { id: 11, must_change_password: true } }],
  ['missing actor', null],
])('rejects %s on explicit template resolution before asset signing', async (_label, ctx) => {
  await expect(resolveReportBranding(input({ templateId: 21 }), ctx as AuthContext)).rejects.toThrow(/unavailable|authorized|authority/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('rejects an explicit foreign template even when the supplied data company is authorized', async () => {
  await expect(resolveReportBranding(input({ templateId: 22 }), actor())).rejects.toThrow(/unavailable|authorized/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('authorized letterhead selection does not grant or require the independently chosen data company', async () => {
  const result = await resolveReportBranding(input({ templateId: 21, ownerCompanyIds: [2] }), actor());
  expect(result.resolvedTemplate?.id).toBe(21);
  expect(m.calls.some(call => call.table === 'owner_companies')).toBe(false);
});
it.each(['group_default', 'auto_by_owner_company'])('company-only authority cannot receive global %s branding', async strategy => {
  await expect(resolveReportBranding(input({ ownerCompanyIds: [], registryEntry: registry(strategy) }), actor())).rejects.toThrow(/unavailable|authorized/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('global viewer can resolve neutral branding without receiving signing metadata', async () => {
  const result = await resolveReportBranding(input({ ownerCompanyIds: [] }), actor(null));
  expect(result.resolvedTemplate?.id).toBe(23); expect(result.resolvedBrandingProfile?.stamp_url).toBeNull();
});
it('an unowned template requires global report authority', async () => {
  await expect(resolveReportBranding(input({ templateId: 25 }), actor())).rejects.toThrow(/authorized/i);
  expect((await resolveReportBranding(input({ templateId: 25 }), actor(null))).resolvedTemplate?.id).toBe(25);
});
it('fixed registry templates must pass stored company authorization', async () => {
  await expect(resolveReportBranding(input({ registryEntry: registry('template_fixed', 22) }), actor())).rejects.toThrow(/unavailable|authorized/i);
});
it.each(['template', 'profile'])('inactive %s is unavailable for new resolution', async kind => {
  m.tables[kind === 'template' ? 'erp_report_templates' : 'erp_report_branding_profiles'][0].is_active = false;
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.toThrow(/unavailable|authorized/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('missing profile cannot become successful unbranded resolution', async () => {
  m.tables.erp_report_branding_profiles = [];
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.toThrow(/unavailable|authorized/i);
});
it.each(['erp_report_templates', 'erp_report_branding_profiles'])('a %s failure is safe and does not become fallback success', async table => {
  m.errorTable = table;
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.toThrow(/unavailable|authorized|loaded/i);
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.not.toThrow(/PRIVATE/);
});
it('transport and storage exceptions are not returned as private error details', async () => {
  m.throwTable = 'erp_report_templates';
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.not.toThrow(/PRIVATE/);
  m.throwTable = ''; m.assets.mockRejectedValue(Error('PRIVATE STORAGE DETAIL'));
  await expect(resolveReportBranding(input({ templateId: 21 }), actor())).rejects.not.toThrow(/PRIVATE/);
});
it('same-company signing returns governed URLs while a foreign signing role cannot be borrowed', async () => {
  const ctx = actor();
  ctx.roleAssignments!.push({ ...ctx.roleAssignments![0], ownerCompanyId: 2, permissionCodes: ['reports.sign'] });
  ctx.permissionCodes.push('reports.sign');
  expect((await resolveReportBranding(input({ templateId: 21 }), ctx)).resolvedBrandingProfile?.signature_url).toBeNull();
  const signed = await resolveReportBranding(input({ templateId: 21 }), actor(1, ['reports.view', 'reports.sign']));
  expect(signed.resolvedBrandingProfile?.signature_url).toBe('https://signed.invalid/signature');
  expect(signed.resolvedBrandingProfile?.signatory_name).toBe('Private Signer');
});
it('automatic company lookup cannot use a wrongly owned canonical template', async () => {
  m.tables.erp_report_templates[0].branding_profile_id = 8;
  await expect(resolveReportBranding(input(), actor(null))).rejects.toThrow(/unavailable|authorized/i);
});
it('automatic company resolution is still available to its scoped reader', async () => {
  expect((await resolveReportBranding(input(), actor())).resolvedTemplate?.id).toBe(21);
});
it('multiple companies require manual choice without reading their business records', async () => {
  const result = await resolveReportBranding(input({ ownerCompanyIds: [1, 2] }), actor());
  expect(result.requiresManualTemplateSelection).toBe(true); expect(m.calls).toEqual([]);
});
it('standalone fallback cannot bypass the principal requirement', async () => {
  await expect(buildFallbackResolvedTemplate(actor())).rejects.toThrow(/unavailable|authorized/i);
  expect((await buildFallbackResolvedTemplate(actor(null)))?.id).toBe(23);
});
it.each([{ templateId: -1 }, { ownerCompanyIds: [0] }, { templateId: 1.2 }])('invalid selector is rejected before a data read: %j', async patch => {
  await expect(resolveReportBranding(input(patch), actor())).rejects.toThrow(/invalid|unavailable/i);
  expect(m.calls).toEqual([]);
});

it('cookie-free scheduled owner resolves current own-company branding', async () => {
  m.client.mockRejectedValue(Error('No request cookie store'));
  const result = await resolveCurrent(input({ templateId: 21 }), actor());
  expect(result.resolvedTemplate?.id).toBe(21);
  expect(m.refresh).toHaveBeenCalledWith(11); expect(m.client).not.toHaveBeenCalled();
});
it('an incidental foreign cookie cannot replace or narrow the trusted schedule owner', async () => {
  m.client.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: { id: 'foreign-cookie' } } }) }, from: () => { throw Error('Foreign cookie used'); } });
  expect((await resolveCurrent(input({ templateId: 21 }), actor())).resolvedTemplate?.id).toBe(21);
  expect(m.client).not.toHaveBeenCalled();
});
it('forged and stale permission claims are ignored in favor of current assignments', async () => {
  m.current = actor(2);
  await expect(resolveCurrent(input({ templateId: 21 }), actor(null, ['reports.view', 'reports.sign']))).rejects.toThrow(/authorized/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('current permission revocation overrides an earlier authorized principal', async () => {
  m.current = actor(1, []);
  await expect(resolveCurrent(input({ templateId: 21 }), actor())).rejects.toThrow(/authorized/i);
  expect(m.calls).toEqual([]);
});
it('current principal reload failure does not expose stored metadata', async () => {
  m.refresh.mockRejectedValue(Error('PRIVATE PRINCIPAL DATABASE ERROR'));
  await expect(resolveCurrent(input({ templateId: 21 }), actor())).rejects.not.toThrow(/PRIVATE/);
  expect(m.calls).toEqual([]);
});
it('foreign metadata is never selected beyond the ownership preflight', async () => {
  await expect(resolveReportBranding(input({ templateId: 22 }), actor())).rejects.toThrow(/authorized/i);
  expect(m.calls.every(call => !call.selection.includes('body_html') && !call.selection.includes('legal_name') && !call.selection.includes('signatory'))).toBe(true);
});
it('authority revoked after metadata reads fails before signing', async () => {
  m.refresh.mockResolvedValueOnce(actor()).mockResolvedValue(actor(1, []));
  await expect(resolveCurrent(input({ templateId: 21 }), actor())).rejects.toThrow(/authorized/i);
  expect(m.assets).not.toHaveBeenCalled();
});
it('late report revocation during asset I/O fails closed', async () => {
  m.assets.mockImplementation(async () => { m.current = actor(1, []); return { report_logo: 'https://signed.invalid/logo' }; });
  await expect(resolveCurrent(input({ templateId: 21 }), actor())).rejects.toThrow(/authorized/i);
});
it('late signing revocation redacts governed URLs, text and display flags', async () => {
  m.current = actor(1, ['reports.view', 'reports.sign']);
  m.assets.mockImplementation(async () => { m.current = actor(); return { stamp: 'https://signed.invalid/stamp', signature: 'https://signed.invalid/signature' }; });
  const result = await resolveCurrent(input({ templateId: 21 }), actor(1, ['reports.view', 'reports.sign']));
  expect(result.resolvedBrandingProfile).toMatchObject({ stamp_url: null, signature_url: null, signatory_name: null });
  expect(result.resolvedTemplate).toMatchObject({ show_stamp: false, show_signatory: false });
  expect(JSON.stringify(result)).not.toContain('signed.invalid');
});
it('company pointer fallback reads only the exact rendering pointer', async () => {
  m.tables.erp_report_templates[0].template_code = 'NON_CANONICAL';
  expect((await resolveCurrent(input(), actor())).resolvedTemplate?.id).toBe(21);
  expect(m.calls.filter(call => call.table === 'owner_companies')).toEqual([{ table: 'owner_companies', selection: 'default_report_template_id' }]);
});
it.each([['group_default', 10, 24], ['auto_by_owner_company', 9, 23]] as const)('misowned global %s profile is not silently treated as missing', async (strategy, profileId, templateId) => {
  m.tables.erp_report_templates = m.tables.erp_report_templates.filter(row => row.id !== templateId);
  m.tables.erp_report_branding_profiles.find(row => row.id === profileId)!.owner_company_id = 1;
  await expect(resolveReportBranding(input({ ownerCompanyIds: [], registryEntry: registry(strategy) }), actor(null))).rejects.toThrow(/authorized/i);
  expect(m.calls.every(call => !call.selection.includes('legal_name'))).toBe(true);
  expect(m.assets).not.toHaveBeenCalled();
});
