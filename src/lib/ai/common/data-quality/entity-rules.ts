import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDataQualityFinding, buildFindingKey, type FindingInput } from './finding-builder';

const BATCH_LIMIT = 200;

export async function scanOrganizationRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];

  const { data: orgs } = await supabase
    .from('owner_companies')
    .select('id, legal_name_en, status, company_code')
    .limit(BATCH_LIMIT);

  if (!orgs) return findings;

  for (const org of orgs) {
    if (!org.legal_name_en || org.legal_name_en.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'ORG_MISSING_LEGAL_NAME',
          entity_type: 'organization',
          entity_id: org.id,
          source_table: 'owner_companies',
          source_field: 'legal_name_en',
          title: 'Organization Missing Legal Name',
          description: `Organization (ID: ${org.id}) has no legal name set.`,
          evidence: { field: 'legal_name_en', issue: 'missing', source: 'owner_companies' },
        })
      );
    }

    if (!org.status || org.status.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'ORG_MISSING_STATUS',
          entity_type: 'organization',
          entity_id: org.id,
          source_table: 'owner_companies',
          source_field: 'status',
          title: 'Organization Missing Status',
          description: `Organization (ID: ${org.id}) has no status value.`,
          evidence: { field: 'status', issue: 'missing', source: 'owner_companies' },
        })
      );
    }

    if (!org.company_code || org.company_code.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'ORG_MISSING_COMPANY_CODE',
          entity_type: 'organization',
          entity_id: org.id,
          source_table: 'owner_companies',
          source_field: 'company_code',
          title: 'Organization Missing Company Code',
          description: `Organization (ID: ${org.id}) has no company code assigned.`,
          evidence: { field: 'company_code', issue: 'missing', source: 'owner_companies' },
        })
      );
    }
  }

  // High-risk organizations not reviewed
  const { data: highRiskOrgs } = await supabase
    .from('erp_ai_risk_scores')
    .select('entity_id, risk_level, reviewed_at')
    .eq('entity_type', 'owner_company')
    .in('risk_level', ['high', 'critical'])
    .is('reviewed_at', null)
    .limit(BATCH_LIMIT);

  for (const rs of highRiskOrgs ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'ORG_HIGH_RISK_NOT_REVIEWED',
        entity_type: 'organization',
        entity_id: rs.entity_id,
        source_table: 'erp_ai_risk_scores',
        title: 'Organization High Risk Score — Not Reviewed',
        description: `Organization (ID: ${rs.entity_id}) has a ${rs.risk_level} risk score with no review.`,
        evidence: { risk_level: rs.risk_level, reviewed: false },
      })
    );
  }

  return findings;
}

export async function scanBranchRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];

  const { data: branches } = await supabase
    .from('branches')
    .select('id, branch_name_en, owner_company_id, status, emirate')
    .limit(BATCH_LIMIT);

  if (!branches) return findings;

  for (const branch of branches) {
    if (!branch.branch_name_en || branch.branch_name_en.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'BRANCH_MISSING_NAME',
          entity_type: 'branch',
          entity_id: branch.id,
          source_table: 'branches',
          source_field: 'branch_name_en',
          title: 'Branch Missing Name',
          description: `Branch (ID: ${branch.id}) has no name set.`,
          evidence: { field: 'branch_name_en', issue: 'missing', source: 'branches' },
        })
      );
    }

    if (!branch.owner_company_id) {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'BRANCH_MISSING_OWNER_COMPANY',
          entity_type: 'branch',
          entity_id: branch.id,
          source_table: 'branches',
          source_field: 'owner_company_id',
          title: 'Branch Missing Owner Company',
          description: `Branch (ID: ${branch.id}) is not linked to any owner company.`,
          evidence: { field: 'owner_company_id', issue: 'missing', source: 'branches' },
        })
      );
    }

    if (!branch.emirate || branch.emirate.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'BRANCH_MISSING_EMIRATE',
          entity_type: 'branch',
          entity_id: branch.id,
          source_table: 'branches',
          source_field: 'emirate',
          title: 'Branch Missing Emirate/Location',
          description: `Branch (ID: ${branch.id}) has no emirate or location data.`,
          evidence: { field: 'emirate', issue: 'missing', source: 'branches' },
        })
      );
    }
  }

  return findings;
}

export async function scanPartyRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];
  const now = new Date();
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const { data: parties } = await supabase
    .from('parties')
    .select('id, display_name, primary_party_type_id')
    .limit(BATCH_LIMIT);

  if (!parties) return findings;

  for (const party of parties) {
    if (!party.display_name || party.display_name.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'PARTY_MISSING_DISPLAY_NAME',
          entity_type: 'party',
          entity_id: party.id,
          source_table: 'parties',
          source_field: 'display_name',
          title: 'Party Missing Display Name',
          description: `Party (ID: ${party.id}) has no display name set.`,
          evidence: { field: 'display_name', issue: 'missing', source: 'parties' },
        })
      );
    }

    if (!party.primary_party_type_id) {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'PARTY_MISSING_TYPE_ASSIGNMENT',
          entity_type: 'party',
          entity_id: party.id,
          source_table: 'parties',
          source_field: 'primary_party_type_id',
          title: 'Party Missing Type Assignment',
          description: `Party (ID: ${party.id}) has no primary party type assigned.`,
          evidence: { field: 'primary_party_type_id', issue: 'missing', source: 'parties' },
        })
      );
    }
  }

  // Expired licenses
  const { data: expiredLicenses } = await supabase
    .from('party_licenses')
    .select('id, party_id, expiry_date')
    .eq('is_active', true)
    .lt('expiry_date', now.toISOString())
    .limit(BATCH_LIMIT);

  for (const lic of expiredLicenses ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'PARTY_LICENSE_EXPIRED_WITH_ACTIVE_PARTY',
        entity_type: 'party',
        entity_id: lic.party_id,
        source_table: 'party_licenses',
        source_field: 'expiry_date',
        title: 'Party License Expired',
        description: `Party (ID: ${lic.party_id}) has an active license that expired.`,
        evidence: { source: 'party_licenses', license_id: lic.id, issue: 'expired' },
      })
    );
  }

  // Expiring soon (within 30 days)
  const { data: expiringLicenses } = await supabase
    .from('party_licenses')
    .select('id, party_id, expiry_date')
    .eq('is_active', true)
    .gte('expiry_date', now.toISOString())
    .lte('expiry_date', thirtyDaysOut)
    .limit(BATCH_LIMIT);

  for (const lic of expiringLicenses ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'PARTY_LICENSE_EXPIRING_SOON',
        entity_type: 'party',
        entity_id: lic.party_id,
        source_table: 'party_licenses',
        source_field: 'expiry_date',
        title: 'Party License Expiring Soon',
        description: `Party (ID: ${lic.party_id}) has a license expiring within 30 days.`,
        evidence: { source: 'party_licenses', license_id: lic.id, issue: 'expiring_soon' },
      })
    );
  }

  // Open duplicate candidates
  const { data: openDuplicates } = await supabase
    .from('erp_ai_duplicate_candidates')
    .select('entity_id_a, entity_type_a')
    .eq('status', 'open')
    .eq('entity_type_a', 'party')
    .limit(BATCH_LIMIT);

  const seenPartyDupes = new Set<number>();
  for (const dc of openDuplicates ?? []) {
    if (!seenPartyDupes.has(dc.entity_id_a)) {
      seenPartyDupes.add(dc.entity_id_a);
      findings.push(
        buildDataQualityFinding({
          rule_code: 'PARTY_OPEN_DUPLICATE_CANDIDATES',
          entity_type: 'party',
          entity_id: dc.entity_id_a,
          source_table: 'erp_ai_duplicate_candidates',
          title: 'Party Has Open Duplicate Candidates',
          description: `Party (ID: ${dc.entity_id_a}) has unresolved duplicate/conflict candidates.`,
          evidence: { source: 'erp_ai_duplicate_candidates', issue: 'open_duplicates' },
        })
      );
    }
  }

  // High-risk parties not reviewed
  const { data: highRiskParties } = await supabase
    .from('erp_ai_risk_scores')
    .select('entity_id, risk_level')
    .eq('entity_type', 'party')
    .in('risk_level', ['high', 'critical'])
    .is('reviewed_at', null)
    .limit(BATCH_LIMIT);

  for (const rs of highRiskParties ?? []) {
    findings.push(
      buildDataQualityFinding({
        rule_code: 'PARTY_HIGH_RISK_NOT_REVIEWED',
        entity_type: 'party',
        entity_id: rs.entity_id,
        source_table: 'erp_ai_risk_scores',
        title: 'Party High Risk Score — Not Reviewed',
        description: `Party (ID: ${rs.entity_id}) has a ${rs.risk_level} risk score with no review.`,
        evidence: { risk_level: rs.risk_level, reviewed: false },
      })
    );
  }

  // Stale field suggestions
  const { data: staleParties } = await supabase
    .from('erp_ai_field_suggestions')
    .select('entity_id, entity_type')
    .eq('entity_type', 'party')
    .eq('status', 'pending')
    .lt('created_at', fourteenDaysAgo)
    .limit(BATCH_LIMIT);

  const seenPartySuggestions = new Set<number>();
  for (const s of staleParties ?? []) {
    if (!seenPartySuggestions.has(s.entity_id)) {
      seenPartySuggestions.add(s.entity_id);
      findings.push(
        buildDataQualityFinding({
          rule_code: 'PARTY_PENDING_FIELD_SUGGESTIONS_TOO_OLD',
          entity_type: 'party',
          entity_id: s.entity_id,
          source_table: 'erp_ai_field_suggestions',
          title: 'Party Field Suggestions Pending Too Long',
          description: `Party (ID: ${s.entity_id}) has AI field suggestions pending for over 14 days.`,
          evidence: { source: 'erp_ai_field_suggestions', issue: 'stale_pending' },
        })
      );
    }
  }

  return findings;
}

export async function scanWorkSiteRules(
  supabase: SupabaseClient
): Promise<ReturnType<typeof buildDataQualityFinding>[]> {
  const findings: ReturnType<typeof buildDataQualityFinding>[] = [];

  const { data: sites } = await supabase
    .from('work_sites')
    .select('id, site_name, branch_id')
    .limit(BATCH_LIMIT);

  if (!sites) return findings;

  for (const site of sites) {
    if (!site.site_name || site.site_name.trim() === '') {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'SITE_MISSING_NAME',
          entity_type: 'work_site',
          entity_id: site.id,
          source_table: 'work_sites',
          source_field: 'site_name',
          title: 'Work Site Missing Name',
          description: `Work site (ID: ${site.id}) has no name set.`,
          evidence: { field: 'site_name', issue: 'missing', source: 'work_sites' },
        })
      );
    }

    if (!site.branch_id) {
      findings.push(
        buildDataQualityFinding({
          rule_code: 'SITE_MISSING_BRANCH',
          entity_type: 'work_site',
          entity_id: site.id,
          source_table: 'work_sites',
          source_field: 'branch_id',
          title: 'Work Site Not Linked to Branch',
          description: `Work site (ID: ${site.id}) is not linked to any branch.`,
          evidence: { field: 'branch_id', issue: 'missing', source: 'work_sites' },
        })
      );
    }
  }

  return findings;
}
