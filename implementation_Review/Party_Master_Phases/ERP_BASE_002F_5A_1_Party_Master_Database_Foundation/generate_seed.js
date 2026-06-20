const fs = require('fs');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

// Supabase details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Base data set to research/seed
const entities = [
  // Core Government
  {
    group: "Core Government / Executive",
    display_name: "Abu Dhabi Executive Council",
    legal_name_en: "Abu Dhabi Executive Council",
    short_name: "ADEC",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://ecouncil.ae"
  },
  {
    group: "Core Government / Executive",
    display_name: "Abu Dhabi Executive Office",
    legal_name_en: "Abu Dhabi Executive Office",
    short_name: "ADEO",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://adeo.ae"
  },
  {
    group: "Core Government / Executive",
    display_name: "Department of Government Enablement",
    legal_name_en: "Department of Government Enablement",
    short_name: "DGE",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://dge.gov.ae"
  },
  {
    group: "Core Government / Executive",
    display_name: "Department of Finance - Abu Dhabi",
    legal_name_en: "Department of Finance",
    short_name: "DoF",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://dof.abudhabi.ae"
  },
  {
    group: "Core Government / Executive",
    display_name: "Statistics Centre - Abu Dhabi",
    legal_name_en: "Statistics Centre - Abu Dhabi",
    short_name: "SCAD",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://scad.gov.ae"
  },
  {
    group: "Core Government / Executive",
    display_name: "Abu Dhabi Accountability Authority",
    legal_name_en: "Abu Dhabi Accountability Authority",
    short_name: "ADAA",
    authority_type_code: "REGULATORY_AUTHORITY",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://adaa.gov.ae"
  },
  
  // Economic Development
  {
    group: "Economic Development / Licensing",
    display_name: "Abu Dhabi Department of Economic Development",
    legal_name_en: "Abu Dhabi Department of Economic Development",
    short_name: "ADDED",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://added.gov.ae"
  },
  {
    group: "Economic Development / Licensing",
    display_name: "Industrial Development Bureau",
    legal_name_en: "Industrial Development Bureau",
    short_name: "IDB",
    authority_type_code: "LICENSE_DEPARTMENT",
    service_category_code: "INDUSTRIAL_LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://idb.added.gov.ae"
  },
  {
    group: "Economic Development / Licensing",
    display_name: "Abu Dhabi Investment Office",
    legal_name_en: "Abu Dhabi Investment Office",
    short_name: "ADIO",
    authority_type_code: "INVESTMENT_AUTHORITY",
    service_category_code: "REGISTRATION",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://investinabudhabi.gov.ae"
  },
  {
    group: "Economic Development / Licensing",
    display_name: "Abu Dhabi Chamber of Commerce and Industry",
    legal_name_en: "Abu Dhabi Chamber of Commerce and Industry",
    short_name: "ADCCI",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "CERTIFICATION",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://abudhabichamber.ae"
  },

  // Municipality / Infrastructure / Transport
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Department of Municipalities and Transport",
    legal_name_en: "Department of Municipalities and Transport",
    short_name: "DMT",
    authority_type_code: "GOVERNMENT_DEPARTMENT",
    service_category_code: "MUNICIPAL_SERVICES",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://dmt.gov.ae"
  },
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Abu Dhabi City Municipality",
    legal_name_en: "Abu Dhabi City Municipality",
    short_name: "ADM",
    authority_type_code: "MUNICIPALITY",
    service_category_code: "MUNICIPAL_SERVICES",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://dmt.gov.ae/adm"
  },
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Al Ain City Municipality",
    legal_name_en: "Al Ain City Municipality",
    short_name: "AAM",
    authority_type_code: "MUNICIPALITY",
    service_category_code: "MUNICIPAL_SERVICES",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://dmt.gov.ae/aam"
  },
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Al Dhafra Region Municipality",
    legal_name_en: "Al Dhafra Region Municipality",
    short_name: "DRM",
    authority_type_code: "MUNICIPALITY",
    service_category_code: "MUNICIPAL_SERVICES",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://dmt.gov.ae/drm"
  },
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Integrated Transport Centre",
    legal_name_en: "Integrated Transport Centre",
    short_name: "ITC",
    authority_type_code: "TRANSPORT_AUTHORITY",
    service_category_code: "TRANSPORT_PERMITS",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://itc.gov.ae"
  },
  {
    group: "Municipality / Infrastructure / Transport",
    display_name: "Abu Dhabi Housing Authority",
    legal_name_en: "Abu Dhabi Housing Authority",
    short_name: "ADHA",
    authority_type_code: "COMMUNITY_AUTHORITY",
    service_category_code: "APPROVALS",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://adha.gov.ae"
  },

  // Environment / Energy / Waste
  {
    group: "Environment / Energy / Waste",
    display_name: "Environment Agency Abu Dhabi",
    legal_name_en: "Environment Agency Abu Dhabi",
    short_name: "EAD",
    authority_type_code: "ENVIRONMENT_AUTHORITY",
    service_category_code: "ENVIRONMENTAL_APPROVALS",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://ead.gov.ae"
  },
  {
    group: "Environment / Energy / Waste",
    display_name: "Department of Energy - Abu Dhabi",
    legal_name_en: "Department of Energy",
    short_name: "DoE",
    authority_type_code: "ENERGY_AUTHORITY",
    service_category_code: "ENERGY_LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://doe.gov.ae"
  },
  {
    group: "Environment / Energy / Waste",
    display_name: "Abu Dhabi Agriculture and Food Safety Authority",
    legal_name_en: "Abu Dhabi Agriculture and Food Safety Authority",
    short_name: "ADAFSA",
    authority_type_code: "FOOD_SAFETY_AUTHORITY",
    service_category_code: "LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://adafsa.gov.ae"
  },
  {
    group: "Environment / Energy / Waste",
    display_name: "Tadweer Group",
    legal_name_en: "Tadweer Group",
    short_name: "Tadweer",
    authority_type_code: "ENVIRONMENT_AUTHORITY",
    service_category_code: "WASTE_MANAGEMENT",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://tadweer.ae"
  },
  {
    group: "Environment / Energy / Waste",
    display_name: "Abu Dhabi Quality and Conformity Council",
    legal_name_en: "Abu Dhabi Quality and Conformity Council",
    short_name: "QCC",
    authority_type_code: "QUALITY_CONFORMITY_AUTHORITY",
    service_category_code: "CERTIFICATION",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://qcc.gov.ae"
  },

  // Safety / Security / Customs
  {
    group: "Safety / Security / Customs",
    display_name: "Abu Dhabi Police",
    legal_name_en: "Abu Dhabi Police",
    short_name: "ADP",
    authority_type_code: "POLICE_AUTHORITY",
    service_category_code: "NOC",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://adpolice.gov.ae"
  },
  {
    group: "Safety / Security / Customs",
    display_name: "Abu Dhabi Civil Defence",
    legal_name_en: "Abu Dhabi Civil Defence",
    short_name: "ADCD",
    authority_type_code: "CIVIL_DEFENSE",
    service_category_code: "CIVIL_DEFENSE_APPROVALS",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://adcda.gov.ae"
  },
  {
    group: "Safety / Security / Customs",
    display_name: "Abu Dhabi Customs",
    legal_name_en: "General Administration of Customs - Abu Dhabi",
    short_name: "AD Customs",
    authority_type_code: "CUSTOMS_AUTHORITY",
    service_category_code: "CUSTOMS",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://adcustoms.gov.ae"
  },
  {
    group: "Safety / Security / Customs",
    display_name: "Abu Dhabi Judicial Department",
    legal_name_en: "Abu Dhabi Judicial Department",
    short_name: "ADJD",
    authority_type_code: "JUDICIAL_AUTHORITY",
    service_category_code: "",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://adjd.gov.ae"
  },
  
  // Health / Education / Community
  {
    group: "Health / Education / Community",
    display_name: "Department of Health - Abu Dhabi",
    legal_name_en: "Department of Health",
    short_name: "DoH",
    authority_type_code: "HEALTH_AUTHORITY",
    service_category_code: "HEALTH_LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://doh.gov.ae"
  },
  {
    group: "Health / Education / Community",
    display_name: "Abu Dhabi Public Health Centre",
    legal_name_en: "Abu Dhabi Public Health Centre",
    short_name: "ADPHC",
    authority_type_code: "HEALTH_AUTHORITY",
    service_category_code: "APPROVALS",
    party_type_codes: "GOVERNMENT_AUTHORITY",
    url: "https://adphc.gov.ae"
  },
  {
    group: "Health / Education / Community",
    display_name: "Department of Education and Knowledge",
    legal_name_en: "Department of Education and Knowledge",
    short_name: "ADEK",
    authority_type_code: "EDUCATION_AUTHORITY",
    service_category_code: "EDUCATION_LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://adek.gov.ae"
  },
  {
    group: "Health / Education / Community",
    display_name: "Department of Community Development",
    legal_name_en: "Department of Community Development",
    short_name: "DCD",
    authority_type_code: "COMMUNITY_AUTHORITY",
    service_category_code: "LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://addcd.gov.ae"
  },
  
  // Culture / Tourism / Media
  {
    group: "Culture / Tourism / Media",
    display_name: "Department of Culture and Tourism - Abu Dhabi",
    legal_name_en: "Department of Culture and Tourism",
    short_name: "DCT",
    authority_type_code: "TOURISM_AUTHORITY",
    service_category_code: "TOURISM_LICENSING",
    party_type_codes: "GOVERNMENT_AUTHORITY|LICENSE_ISSUER",
    url: "https://dctabudhabi.ae"
  },
  
  // Free Zones
  {
    group: "Free Zones / Special Zones",
    display_name: "Abu Dhabi Global Market Registration Authority",
    legal_name_en: "Abu Dhabi Global Market Registration Authority",
    short_name: "ADGM RA",
    authority_type_code: "FREE_ZONE_AUTHORITY",
    service_category_code: "FREE_ZONE_LICENSING",
    party_type_codes: "FREE_ZONE_AUTHORITY|LICENSE_ISSUER",
    url: "https://adgm.com"
  },
  {
    group: "Free Zones / Special Zones",
    display_name: "Khalifa Economic Zones Abu Dhabi",
    legal_name_en: "Khalifa Economic Zones Abu Dhabi",
    short_name: "KEZAD",
    authority_type_code: "FREE_ZONE_AUTHORITY",
    service_category_code: "FREE_ZONE_LICENSING",
    party_type_codes: "FREE_ZONE_AUTHORITY|LICENSE_ISSUER",
    url: "https://kezadgroup.com"
  },
  {
    group: "Free Zones / Special Zones",
    display_name: "Abu Dhabi Airports Free Zone",
    legal_name_en: "Abu Dhabi Airports Free Zone",
    short_name: "ADAFZ",
    authority_type_code: "FREE_ZONE_AUTHORITY",
    service_category_code: "FREE_ZONE_LICENSING",
    party_type_codes: "FREE_ZONE_AUTHORITY|LICENSE_ISSUER",
    url: "https://adafz.ae"
  },
  {
    group: "Free Zones / Special Zones",
    display_name: "Masdar City Free Zone",
    legal_name_en: "Masdar City Free Zone",
    short_name: "Masdar FZ",
    authority_type_code: "FREE_ZONE_AUTHORITY",
    service_category_code: "FREE_ZONE_LICENSING",
    party_type_codes: "FREE_ZONE_AUTHORITY|LICENSE_ISSUER",
    url: "https://masdarcityfreezone.com"
  },
  {
    group: "Free Zones / Special Zones",
    display_name: "twofour54",
    legal_name_en: "twofour54",
    short_name: "twofour54",
    authority_type_code: "FREE_ZONE_AUTHORITY",
    service_category_code: "FREE_ZONE_LICENSING",
    party_type_codes: "FREE_ZONE_AUTHORITY|LICENSE_ISSUER",
    url: "https://twofour54.com"
  }
];

async function run() {
  console.log('Fetching existing parties from Supabase...');
  
  const response = await fetch(`${supabaseUrl}/rest/v1/parties?select=id,display_name,legal_name_en,short_name`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  const existingParties = await response.json();
  
  const existingNames = new Set(existingParties.map(p => (p.legal_name_en || '').toLowerCase()));
  const existingDisplayNames = new Set(existingParties.map(p => (p.display_name || '').toLowerCase()));
  const existingShortNames = new Set(existingParties.map(p => (p.short_name || '').toLowerCase()));

  let csvContent = `display_name,legal_name_en,short_name,party_nature_code,party_status_code,country_code,emirate_name,party_type_codes,authority_type_code,service_category_code,source_url,seed_status,data_gaps\n`;
  let sqlContent = `-- REVIEW ONLY
-- DO NOT APPLY WITHOUT SAMEER APPROVAL
-- Abu Dhabi Government Entities Party Master seed draft\n\n`;
  
  let stats = {
    total: entities.length,
    ready: 0,
    duplicate: 0
  };

  entities.forEach(ent => {
    let isDuplicate = false;
    if (
      existingNames.has((ent.legal_name_en || '').toLowerCase()) ||
      existingDisplayNames.has((ent.display_name || '').toLowerCase()) ||
      existingShortNames.has((ent.short_name || '').toLowerCase())
    ) {
      isDuplicate = true;
    }

    const seedStatus = isDuplicate ? 'DUPLICATE_CHECK_REQUIRED' : 'READY_TO_SEED';
    if (isDuplicate) stats.duplicate++;
    else stats.ready++;

    // CSV line
    csvContent += `"${ent.display_name}","${ent.legal_name_en}","${ent.short_name}","GOVERNMENT_ENTITY","ACTIVE","AE","Abu Dhabi","${ent.party_type_codes}","${ent.authority_type_code}","${ent.service_category_code}","${ent.url}","${seedStatus}",""\n`;

    // SQL statement
    if (!isDuplicate) {
      sqlContent += `
-- ${ent.display_name}
INSERT INTO parties (display_name, legal_name_en, short_name, party_nature_code, party_status_code, country_code, emirate_name)
VALUES ('${ent.display_name}', '${ent.legal_name_en}', '${ent.short_name}', 'GOVERNMENT_ENTITY', 'ACTIVE', 'AE', 'Abu Dhabi')
ON CONFLICT DO NOTHING;

-- Note: In final implementation, party_type_assignments and profile rows will be inserted here.
`;
    } else {
      sqlContent += `
-- SKIPPED (Duplicate): ${ent.display_name}
`;
    }
  });

  const reviewMd = `# Abu Dhabi Government Entities - Seed Data Review

## Executive Summary
- **Total entities researched**: ${stats.total}
- **Total READY_TO_SEED**: ${stats.ready}
- **Total REVIEW_REQUIRED**: 0
- **Total DUPLICATE_CHECK_REQUIRED**: ${stats.duplicate}
- **Total DO_NOT_SEED**: 0

## Notes
Entities marked as DUPLICATE_CHECK_REQUIRED were found in the existing Supabase \`parties\` table by matching their name or short name. The SQL draft currently skips these entities.
`;

  const missingLookupMd = `# Missing Lookup Codes Review

All used authority_type_code and service_category_code values are recommended standard values from the prompt.
If they do not exist in the database, they will need to be created during the seed implementation phase.
`;

  const sourcesMd = `# Source Links

${entities.map(e => `- **${e.display_name}**: ${e.url}`).join('\n')}
`;

  fs.writeFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_PARTY_MASTER_SEED_REVIEW.md', reviewMd);
  fs.writeFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_PARTY_MASTER_SEED_DATA.csv', csvContent);
  fs.writeFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_PARTY_MASTER_SEED_DRAFT.sql', sqlContent);
  fs.writeFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_MISSING_LOOKUP_CODES_REVIEW.md', missingLookupMd);
  fs.writeFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_PARTY_MASTER_SOURCE_LINKS.md', sourcesMd);

  console.log('Successfully generated 5 review files in implementation_Review directory.');
}

run().catch(console.error);
