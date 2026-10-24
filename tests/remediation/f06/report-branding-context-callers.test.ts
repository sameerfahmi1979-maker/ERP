// Real action/runner entry points, controlled registry/branding/data ports; no live services.
import { beforeEach, expect, it, vi } from 'vitest';
import type { AuthContext } from '@/lib/rbac/check';
const m = vi.hoisted(() => ({
  ctx: null as AuthContext | null, resolve: vi.fn(), fetch: vi.fn(), audit: vi.fn(), scoped: vi.fn(),
  tables: [] as string[], registryError: null as unknown, missing: false, transportError: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/rbac/check', async () => ({
  ...await vi.importActual('@/lib/rbac/scope'), getAuthContext: async () => m.ctx,
  assertAccountActive: (ctx: AuthContext) => { if (!ctx.isAccountActive) throw Error('Inactive'); },
}));
vi.mock('@/lib/report-center/branding-resolver', () => ({ resolveReportBranding: m.resolve }));
vi.mock('@/lib/report-center/report-fetchers', () => ({ REPORT_FETCHERS: { F06_SYNTHETIC: { fetch: m.fetch } } }));
vi.mock('@/lib/report-center/scoped-read-client', () => ({ createScopedReportReadClient: m.scoped,revalidateScopedReportReadClient:vi.fn() }));
vi.mock('@/server/actions/audit', () => ({ logAudit: m.audit }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from(table: string) {
  m.tables.push(table);
  const q = { select: () => q, eq: () => q, is: () => q, async maybeSingle() {
    if (m.transportError) throw Error('PRIVATE REGISTRY TRANSPORT');
    return { error: m.registryError, data: m.missing ? null : { id: 1, report_code: 'F06_SYNTHETIC', required_permissions: [], is_letter_type: false, branding_strategy: 'auto_by_owner_company' } };
  } }; return q;
} }) }));
import { runReport } from '@/lib/report-center/report-runner';
import { resolveReportTemplateForContextAction } from '@/server/actions/reports/runner';

beforeEach(() => {
  vi.clearAllMocks(); m.tables = []; m.registryError = null; m.missing = false; m.transportError = false;
  m.ctx = { isAccountActive: true, profile: { id: 11 }, roleCodes: ['synthetic'], permissionCodes: ['reports.view'],
    globalPermissionCodes: [], roleAssignments: [{ roleCode: 'synthetic', ownerCompanyId: 1, branchId: null, permissionCodes: ['reports.view'] }],
  } as unknown as AuthContext;
  m.resolve.mockResolvedValue({ resolvedTemplate: { id: 21 }, resolvedBrandingProfile: { id: 7 }, requiresManualTemplateSelection: true, isFallback: false });
});

it('resolution action passes only its trusted authenticated actor to branding', async () => {
  const result = await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC', templateId: 21, ownerCompanyIds: [2] });
  expect(result.success).toBe(true);
  expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ templateId: 21, ownerCompanyIds: [2] }), m.ctx);
  expect(m.fetch).not.toHaveBeenCalled(); expect(m.scoped).not.toHaveBeenCalled();
});
it('report runner passes its trusted actor and stops for manual branding selection', async () => {
  const result = await runReport({ reportCode: 'F06_SYNTHETIC', outputFormat: 'screen', requestedByUserId: 11, ownerCompanyIds: [1, 2] }, m.ctx!);
  expect(result.requiresManualTemplateSelection).toBe(true);
  expect(m.resolve).toHaveBeenCalledWith(expect.objectContaining({ ownerCompanyIds: [1, 2] }), m.ctx);
  expect(m.fetch).not.toHaveBeenCalled(); expect(m.tables).toEqual(['erp_report_registry']);
});
it('branding denial returns a safe runner failure before logging or business data', async () => {
  m.resolve.mockRejectedValue(Error('PRIVATE BRANDING ERROR'));
  const result = await runReport({ reportCode: 'F06_SYNTHETIC', outputFormat: 'screen', requestedByUserId: 11 }, m.ctx!);
  expect(result).toEqual({ success: false, error: expect.stringMatching(/branding.*unavailable/i) });
  expect(result.error).not.toContain('PRIVATE'); expect(m.fetch).not.toHaveBeenCalled();
  expect(m.scoped).not.toHaveBeenCalled(); expect(m.tables).toEqual(['erp_report_registry']);
});
it('resolution action reports branding failure without private details or false success', async () => {
  m.resolve.mockRejectedValue(Error('PRIVATE BRANDING ERROR'));
  const result = await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC', templateId: 22 });
  expect(result.success).toBe(false); expect(result.error).not.toContain('PRIVATE'); expect(result.data).toBeUndefined();
});
it('registry errors do not look like missing metadata or reach branding', async () => {
  m.registryError = { message: 'PRIVATE SQL ERROR' };
  const result = await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC' });
  expect(result).toEqual({ success: false, error: expect.stringMatching(/could not be loaded/i) });
  expect(m.resolve).not.toHaveBeenCalled();
});
it('unexpected resolution-action transport errors are safe', async () => {
  m.transportError = true;
  const result = await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC' });
  expect(result.success).toBe(false); expect(result.error).not.toContain('PRIVATE'); expect(m.resolve).not.toHaveBeenCalled();
});
it('management capability can reach the governed resolver without granting business access', async () => {
  m.ctx!.permissionCodes = ['reports.manage']; m.ctx!.roleAssignments![0].permissionCodes = ['reports.manage'];
  expect((await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC' })).success).toBe(true);
  expect(m.resolve).toHaveBeenCalledWith(expect.anything(), m.ctx); expect(m.fetch).not.toHaveBeenCalled();
});
it('no-role action does not read registry or resolve a caller-selected template', async () => {
  m.ctx!.permissionCodes = []; m.ctx!.roleAssignments = [];
  expect((await resolveReportTemplateForContextAction({ reportCode: 'F06_SYNTHETIC', templateId: 21 })).success).toBe(false);
  expect(m.tables).toEqual([]); expect(m.resolve).not.toHaveBeenCalled();
});
