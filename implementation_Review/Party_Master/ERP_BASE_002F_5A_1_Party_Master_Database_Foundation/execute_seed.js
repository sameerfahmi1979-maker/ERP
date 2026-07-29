const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Read the CSV data we generated
const csvData = fs.readFileSync('implementation_Review/ABU_DHABI_GOVERNMENT_ENTITIES_PARTY_MASTER_SEED_DATA.csv', 'utf8');

const lines = csvData.split('\n').filter(line => line.trim() !== '');
const headers = lines[0].split(',');

// Start from line 1
const recordsToInsert = [];

for (let i = 1; i < lines.length; i++) {
  // Simple CSV parser assuming no commas inside the quotes for our specific generated format
  // We used template strings like: `"name","legal","short",...`
  // Let's parse it safely:
  const rowString = lines[i];
  const regex = /(?:^|,)(?:"([^"]*)"|([^,]*))/g;
  let matches;
  const row = [];
  while ((matches = regex.exec(rowString)) !== null) {
      row.push(matches[1] !== undefined ? matches[1] : matches[2]);
  }
  
  const statusIndex = 11; // seed_status is the 12th column (0-indexed 11)
  const seedStatus = row[statusIndex];

  if (seedStatus === 'READY_TO_SEED') {
    recordsToInsert.push({
      display_name: row[0],
      legal_name_en: row[1],
      short_name: row[2],
      party_nature_code: row[3],
      party_status_code: row[4],
      country_code: row[5],
      emirate_name: row[6]
    });
  }
}

console.log(`Found ${recordsToInsert.length} records ready to seed.`);

async function seedRecords() {
  if (recordsToInsert.length === 0) {
    console.log("No new records to insert. All are duplicates or skipped.");
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  };

  try {
    // 1. Fetch lookup IDs
    const naturesRes = await fetch(`${supabaseUrl}/rest/v1/party_natures?party_nature_code=eq.GOVERNMENT_ENTITY`, { headers });
    const natures = await naturesRes.json();
    const party_nature_id = natures[0]?.id || 30;

    const statusesRes = await fetch(`${supabaseUrl}/rest/v1/party_statuses?party_status_code=eq.ACTIVE`, { headers });
    const statuses = await statusesRes.json();
    const party_status_id = statuses[0]?.id || 14;

    const countriesRes = await fetch(`${supabaseUrl}/rest/v1/countries?country_code_iso2=eq.AE`, { headers });
    const countries = await countriesRes.json();
    const country_id = countries[0]?.id || 1;

    const emiratesRes = await fetch(`${supabaseUrl}/rest/v1/emirates?emirate_name_en=eq.Abu%20Dhabi`, { headers });
    let emirates = await emiratesRes.json();
    if (!emirates || emirates.length === 0) {
        const emiratesRes2 = await fetch(`${supabaseUrl}/rest/v1/emirates?emirate_name=eq.Abu%20Dhabi`, { headers });
        emirates = await emiratesRes2.json();
    }
    const emirate_id = emirates[0]?.id || 1;

    // 2. Fetch Max Party Code
    const maxCodeRes = await fetch(`${supabaseUrl}/rest/v1/parties?select=party_code&order=party_code.desc&limit=1`, { headers });
    const maxCodeData = await maxCodeRes.json();
    let currentMaxNumber = 0;
    if (maxCodeData && maxCodeData.length > 0 && maxCodeData[0].party_code) {
        const codeStr = maxCodeData[0].party_code.replace('PTY-', '');
        currentMaxNumber = parseInt(codeStr, 10);
    }

    console.log(`Resolved IDs: Nature=${party_nature_id}, Status=${party_status_id}, Country=${country_id}, Emirate=${emirate_id}`);
    console.log(`Starting Party Code generation from PTY-${String(currentMaxNumber + 1).padStart(6, '0')}`);

    // Map records to correct columns
    const finalRecords = recordsToInsert.map((r, index) => {
      const nextCode = `PTY-${String(currentMaxNumber + index + 1).padStart(6, '0')}`;
      return {
        party_code: nextCode,
        display_name: r.display_name,
        legal_name_en: r.legal_name_en,
        short_name: r.short_name,
        party_nature_id: party_nature_id,
        party_status_id: party_status_id,
        country_id: country_id,
        emirate_id: emirate_id,
        is_active: true
      };
    });

    const response = await fetch(`${supabaseUrl}/rest/v1/parties`, {
      method: 'POST',
      headers: {
        ...headers,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(finalRecords)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to seed records:', response.status, response.statusText, errorText);
    } else {
      const data = await response.json();
      console.log(`Successfully seeded ${data.length} records into the parties table.`);
    }
  } catch (error) {
    console.error('Error seeding records:', error);
  }
}

seedRecords();
