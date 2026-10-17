// Real resolver, read-authority, asset-permission, storage-identity and strict
// asset-resolution code. Only Auth reload/DB/Storage ports are controlled.
// Signing-delay races are synthetic, not claims about live Storage acceptance.
import {beforeEach, expect, it, vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import type {ReportRegistryEntry} from '@/lib/report-center/types';
const m = vi.hoisted(() => ({admin: vi.fn(), sign: vi.fn(), principal: vi.fn(), cookie: vi.fn(),
  tables: {} as Record<string, Array<Record<string, unknown>>>, afterTemplateDetail: null as (() => void) | null,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({createClient: m.cookie}));
vi.mock('@/lib/supabase/admin', () => ({createAdminClient: m.admin}));
vi.mock('@/lib/rbac/check', () => ({getAuthContextForProfileId: m.principal}));
import {resolveReportBranding} from '@/lib/report-center/branding-resolver';

const actor = () => ({profile: {id: 11, must_change_password: false}, isAccountActive: true,
  roleCodes: ['synthetic'], permissionCodes: ['reports.view', 'reports.sign'], globalPermissionCodes: ['reports.view', 'reports.sign'],
  roleAssignments: [{roleCode: 'synthetic', ownerCompanyId: null, branchId: null, permissionCodes: ['reports.view', 'reports.sign']}],
}) as unknown as AuthContext;
const resolve = () => resolveReportBranding({templateId: 21, ownerCompanyIds: [1], registryEntry: {branding_strategy: 'auto_by_owner_company'} as ReportRegistryEntry}, actor());
function database() {
  return {storage: {from: () => ({createSignedUrl: m.sign})}, from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = []; let selection = '';
    const rows = () => (m.tables[table] ?? []).filter(row => filters.every(test => test(row))).map(row => structuredClone(selection === '*' ? row : Object.fromEntries(selection.split(',').map(key => [key, row[key]]))));
    const builder = {
      select(value: string) { selection = value; return builder; },
      eq(key: string, value: unknown) { filters.push(row => key === 'workspace_revision' ? String(row[key]) === String(value) : row[key] === value); return builder; },
      is(key: string, value: unknown) { filters.push(row => row[key] === value); return builder; },
      async maybeSingle() {
        const result = rows();
        if (table === 'erp_report_templates' && selection.includes('body_html_en')) m.afterTemplateDetail?.();
        return {data: result[0] ?? null, error: result.length > 1 ? {message: 'Duplicate'} : null};
      },
      then(fulfilled: (value: unknown) => unknown, rejected?: (reason: unknown) => unknown) { return Promise.resolve({data: rows(), error: null}).then(fulfilled, rejected); },
    };
    return builder;
  }};
}
beforeEach(() => {
  vi.clearAllMocks(); m.afterTemplateDetail = null; m.principal.mockResolvedValue(actor());
  m.cookie.mockRejectedValue(Error('No cookie store'));
  m.tables = {
    erp_report_templates: [{id: 21, workspace_revision: 1, branding_profile_id: 7, template_code: 'SYNTHETIC', is_active: true, deleted_at: null, show_stamp: true, show_signatory: true}],
    erp_report_branding_profiles: [{id: 7, workspace_revision: 1, owner_company_id: 1, is_active: true, deleted_at: null, profile_code: 'SYNTHETIC', signatory_name: 'Synthetic Signer'}],
    erp_branding_assets: [{id: 31, workspace_revision: 1, asset_scope: 'report', asset_type: 'signature', branding_profile_id: 7, owner_company_id: 1, app_settings_id: null,
      version_no: 1, mime_type: 'image/png', storage_bucket: 'erp-branding-assets', storage_path: 'report/company-1/profile-7/signature/v1.png', is_active: true, deleted_at: null}],
  };
  m.admin.mockImplementation(database); m.sign.mockResolvedValue({data: {signedUrl: 'https://synthetic.invalid/signed'}, error: null});
});
it('unchanged metadata resolves through the actual strict asset helper without cookies', async () => {
  const result = await resolve(); expect(result.resolvedBrandingProfile?.signature_url).toBe('https://synthetic.invalid/signed');
  expect(result.resolvedTemplate?.workspace_revision).toBe(1); expect(m.cookie).not.toHaveBeenCalled();
  expect(m.sign).toHaveBeenCalledWith('report/company-1/profile-7/signature/v1.png', 3600);
});
it.each([
  ['profile revision replacement', 'erp_report_branding_profiles', {workspace_revision: 2}],
  ['profile inactive', 'erp_report_branding_profiles', {is_active: false}],
  ['profile retirement', 'erp_report_branding_profiles', {deleted_at: '2026-10-05'}],
  ['profile owner transfer', 'erp_report_branding_profiles', {owner_company_id: 2}],
  ['template revision replacement', 'erp_report_templates', {workspace_revision: 2}],
  ['template inactive', 'erp_report_templates', {is_active: false}],
  ['template retirement', 'erp_report_templates', {deleted_at: '2026-10-05'}],
  ['template profile repoint', 'erp_report_templates', {branding_profile_id: 8}],
] as const)('rejects %s while the actual asset helper awaits signing', async (_name, table, patch) => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(done => { entered = done; });
  const gate = new Promise<void>(done => { release = done; });
  m.sign.mockImplementation(async () => { entered(); await gate; return {data: {signedUrl: 'https://synthetic.invalid/signed'}, error: null}; });
  const pending = resolve();
  // Attach a rejection handler before releasing the signing promise.
  const denied = expect(pending).rejects.toThrow('Report branding is unavailable or not authorized. Reload and try again.');
  await started; Object.assign(m.tables[table][0], patch); release(); await denied;
});
it.each([undefined, null, 0, -1, 1.5, '0', 'malformed', '9223372036854775808'])('rejects malformed or missing profile revision %j before signing', async revision => {
  m.tables.erp_report_branding_profiles[0].workspace_revision = revision;
  await expect(resolve()).rejects.toThrow(/unavailable/i); expect(m.sign).not.toHaveBeenCalled();
});
it.each([undefined, null, 0, -1, 1.5, '0', 'malformed', '9223372036854775808'])('rejects malformed or missing template revision %j before signing', async revision => {
  m.tables.erp_report_templates[0].workspace_revision = revision;
  await expect(resolve()).rejects.toThrow(/unavailable/i); expect(m.sign).not.toHaveBeenCalled();
});
it('missing asset revision fails before the actual helper signs a capability', async () => {
  delete m.tables.erp_branding_assets[0].workspace_revision;
  await expect(resolve()).rejects.toThrow(/unavailable/i); expect(m.sign).not.toHaveBeenCalled();
});
it.each([{workspace_revision: 2}, {is_active: false}, {deleted_at: '2026-10-05'}, {branding_profile_id: 7}])('null-profile template is also rechecked after selection: %j', async patch => {
  m.tables.erp_report_templates[0].branding_profile_id = null;
  m.afterTemplateDetail = () => Object.assign(m.tables.erp_report_templates[0], patch);
  await expect(resolve()).rejects.toThrow(/unavailable/i); expect(m.sign).not.toHaveBeenCalled();
});
