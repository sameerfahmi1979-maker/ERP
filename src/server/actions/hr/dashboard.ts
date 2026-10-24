"use server";

import {readHrDashboard} from '@/server/reads/hr-dashboard';
import type {HrDashboard, HrDashboardMetric, HrDashboardAttentionItem, HrDashboardCriteria} from '@/lib/reads/hr-dashboard-schema';

/** Compatibility actions share the guarded, complete, dated current read.
 * No current screen calls these adapters. Preserve callable imports without a
 * second capped data pipeline or flattening failed/restricted counts to zero. */
export type DashboardFilters = HrDashboardCriteria;
export type AttentionItem = HrDashboardAttentionItem;
type Numbers<T extends Record<string, HrDashboardMetric>> = {[K in keyof T]: number};
export type EmployeeOverview = Numbers<HrDashboard['employee']>;
export type ComplianceOverview = Omit<Numbers<HrDashboard['compliance']>, 'medical_expired'> & {medical_expired: number | null};
export type TimeOverview = Numbers<HrDashboard['time']> & {absent_today: null};
export type PayrollOverview = Numbers<HrDashboard['payroll']> | null;
export type OperationsOverview = Numbers<HrDashboard['operations']>;
export type ActionsOverview = Numbers<HrDashboard['actions']>;
export type RecruitmentOverview = Numbers<HrDashboard['recruitment']> | null;
export type DashboardSummary = Omit<Numbers<HrDashboard['summary']>, 'wps_ready_pct' | 'recruitment_active'> & {wps_ready_pct: number | null; recruitment_active: number | null};
export type HeadcountByCategoryItem = {categoryId: number | null; categoryName: string; count: number};

async function dashboard(filters: DashboardFilters) {
  const result = await readHrDashboard(filters);
  if (!result.success || !result.data) throw Error('Dashboard sources unavailable or restricted');
  return result.data;
}
function numeric<T extends Record<string, HrDashboardMetric>>(metrics: T): Numbers<T> {
  const entries = Object.entries(metrics).map(([key, metric]) => {
    if (metric.status !== 'ready') throw Error('Dashboard sources unavailable or restricted');
    return [key, metric.value];
  });
  return Object.fromEntries(entries) as Numbers<T>;
}
function nullable(metric: HrDashboardMetric) {
  if (metric.status === 'ready') return metric.value;
  if (metric.status === 'failed') throw Error('Dashboard sources unavailable or restricted');
  return null;
}
export async function getHrDashboardEmployeeOverview(filters: DashboardFilters = {}): Promise<EmployeeOverview> {
  return numeric((await dashboard(filters)).employee);
}
export async function getHrDashboardComplianceOverview(filters: DashboardFilters = {}): Promise<ComplianceOverview> {
  const {medical_expired, ...counts} = (await dashboard(filters)).compliance;
  return {...numeric(counts), medical_expired: nullable(medical_expired)};
}
export async function getHrDashboardTimeOverview(filters: DashboardFilters = {}): Promise<TimeOverview> {
  // No approved absence denominator/calendar exists. Never invent zero absence.
  return {...numeric((await dashboard(filters)).time), absent_today: null};
}
export async function getHrDashboardPayrollOverview(filters: DashboardFilters = {}): Promise<PayrollOverview> {
  const values = (await dashboard(filters)).payroll;
  if (Object.values(values).some(m => m.status === 'failed')) throw Error('Dashboard sources unavailable or restricted');
  if (Object.values(values).some(m => m.status === 'restricted' || m.status === 'unavailable')) return null;
  return numeric(values);
}
export async function getHrDashboardOperationsOverview(filters: DashboardFilters = {}): Promise<OperationsOverview> {
  return numeric((await dashboard(filters)).operations);
}
export async function getHrDashboardActionsOverview(filters: DashboardFilters = {}): Promise<ActionsOverview> {
  return numeric((await dashboard(filters)).actions);
}
export async function getHrDashboardRecruitmentOverview(filters: DashboardFilters = {}): Promise<RecruitmentOverview> {
  const values = (await dashboard(filters)).recruitment;
  if (Object.values(values).some(m => m.status === 'failed')) throw Error('Dashboard sources unavailable or restricted');
  if (Object.values(values).some(m => m.status === 'restricted')) return null;
  return numeric(values);
}
export async function getHrDashboardAttentionItems(filters: DashboardFilters = {}): Promise<AttentionItem[]> {
  const result = (await dashboard(filters)).attention;
  if (result.failedSources.length || result.availableSources === 0) throw Error('Dashboard sources unavailable or restricted');
  return result.items;
}
export async function getHrDashboardSummary(filters: DashboardFilters = {}): Promise<DashboardSummary> {
  const {wps_ready_pct, recruitment_active, ...values} = (await dashboard(filters)).summary;
  return {...numeric(values), wps_ready_pct: nullable(wps_ready_pct), recruitment_active: nullable(recruitment_active)};
}
export async function getHeadcountByCategory(): Promise<{success: boolean; data?: HeadcountByCategoryItem[]; error?: string}> {
  try {
    const result = (await dashboard({})).headcount;
    return result.status === 'ready' ? {success: true, data: result.items} : {success: false, error: 'Headcount unavailable or restricted'};
  } catch {return {success: false, error: 'Headcount unavailable or restricted'};}
}
