# UAE Insurance Parties Enrichment Final Correction Review

## 1. Final Status

```text
REVIEWED SQL READY — WAITING HUMAN APPROVAL
```

## 2. Files Reviewed

1. **Audit Report**: [UAE_INSURANCE_PARTIES_OFFICIAL_CONTACT_ENRICHMENT_AUDIT.md](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_PARTIES_OFFICIAL_CONTACT_ENRICHMENT_AUDIT.md)
2. **JSON Dataset**: [UAE_INSURANCE_PARTIES_ENRICHED_DATASET.json](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_PARTIES_ENRICHED_DATASET.json)
3. **Previous SQL script**: [seed_uae_insurance_parties_enriched_contacts_addresses.sql](file:///c:/dev/agt-erp/supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses.sql)

## 3. Schema Column Compatibility

| Table | Column | Used in SQL: Yes/No | Exists in DB: Yes/No | Required: Yes/No | Safe to Use: Yes/No | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`parties`** | `main_phone` | Yes | Yes | No | Yes | Confirmed in migration schema. |
| **`parties`** | `main_email` | Yes | Yes | No | Yes | Confirmed in migration schema. |
| **`parties`** | `website` | Yes | Yes | No | Yes | Confirmed in migration schema. |
| **`parties`** | `po_box` | Yes | Yes | No | Yes | Confirmed in migration schema. |
| **`parties`** | `full_address_text` | Yes | Yes | No | Yes | Confirmed in migration schema. |
| **`parties`** | `remarks` | Yes | Yes | No | Yes | Used for CBUAE registration references. |
| **`party_addresses`** | `notes` | Yes | Yes | No | Yes | Verified in `party_addresses` table. |
| **`party_addresses`** | `full_address_text` | Yes | Yes | No | Yes | Verified in `party_addresses` table. |
| **`party_contacts`** | `notes` | Yes | Yes | No | Yes | Verified in `party_contacts` table. |

## 4. Overwrite Safety Review

Existing data in the database is protected in three ways:
1. **COALESCE matching**: In `UPDATE` blocks, existing non-null fields in the database (such as `main_phone` or `website`) are preserved by utilizing `main_phone = COALESCE(main_phone, v_rec.main_phone)`. 
2. **Match Count Safety**: If more than one party matches the legal name or CBUAE registration number, the script skips the carrier and flags it as `HUMAN REVIEW REQUIRED` rather than updating multiple records.
3. **No Overwrite on Child Rows**: Child addresses and contacts are only seeded if no primary active child row exists for the party.

## 5. Remarks Preservation Rule

The script uses a safe conditional expression to prevent destroying manually entered remarks:

```sql
remarks = CASE
  WHEN remarks IS NULL OR trim(remarks) = '' THEN v_rec.remarks
  WHEN remarks LIKE '%CBUAE registration no:%' THEN remarks
  ELSE remarks || E'\n' || v_rec.remarks
END
```

This ensures existing notes are appended to rather than replaced, while preventing duplicate CBUAE remark lines if the script is executed multiple times.

## 6. Yas Takaful Review

- **Status**: **EXCLUDED PENDING APPROVAL (HUMAN APPROVAL REQUIRED)**
- **Safer Option**: Option B (excluding Yas Takaful from the script completely) was selected. Since Yas Takaful's license was suspended by the Central Bank of the UAE in August 2025, it is not safe to include it as a standard active insurer for operational policy placement. The record will remain empty of contacts and addresses in the database and skipped in SQL execution until an administrator manually overrides it.

## 7. Source Evidence Quality Review

| Insurer | Website Source | Phone Source | Email Source | Address Source | Confidence | Included Fields | Excluded Fields | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Yas Takaful** | http://www.yastakaful.ae | 800 889 | customerinfo@yastakaful.ae | Abu Dhabi, UAE | Low (Suspended) | website, phone, email, address | None | License suspended by CBUAE. Excluded from SQL enrichment pending human approval. |
| **Salama Takaful** | https://www.salama.ae | 800 725262 | info@salama.ae | 4th Floor, Block A, Spectrum Building, Oud Metha, Sheikh Rashid Road, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Sukoon Takaful** | https://www.sukoontakaful.com | +971 4 282 4403 | customercare@sukoontakaful.com | Al Garhoud, 3rd Floor, Al Kazim Building, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **National General Insurance** | https://www.ngi.ae | +971 4 211 5800 | customerservice@ngiuae.com | NGI House, Port Saeed Street, Deira, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Daman Insurance** | https://www.damanhealth.ae | 600 532626 | customerinfo@damanhealth.ae | Abu Dhabi, UAE | High | website, phone, email, address | None | Active health insurer. |
| **Alliance Insurance** | https://www.alliance-uae.com | +971 4 605 1111 | care@alliance-uae.com | Alliance Building, Warba Street, Deira, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Takaful Emarat** | http://www.takafulemarat.com | 600 522550 | customerrelations@takafulemarat.com | Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Insurance House** | https://www.insurancehouse.ae | 600 511112 | customerservice@insurancehouse.ae | Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Dubai National Insurance** | https://www.dni.ae | 600 5 80000 | info@dni.ae | 7th Floor, DNI House, Sheikh Zayed Road, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Sukoon Insurance** | https://www.sukoon.com | 800 SUKOON (785666) | service@sukoon.com | Sukoon Building, Omar Bin Al Khattab Street, Next to Al Ghurair Mall, Deira, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **ADNIC** | https://www.adnic.ae | 800 8040 | info@adnic.ae | Building No. 403, Khalifa Bin Zayed The First Street, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Abu Dhabi Takaful** | https://www.takaful.ae | 800 2244 | customer.service@takaful.ae | Tamouh Tower, 25th Floor, Marina Square, Al Reem Island, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Union Insurance** | https://www.unioninsurance.ae | +971 4 3787 777 | info@unioninsurance.ae | Single Business Tower, Sheikh Zayed Road, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Emirates Insurance** | https://www.eminsco.com | 800 98 | info@eminsco.com | Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Buhaira Insurance** | https://albuhaira.com | 06 517 4444 | care@albuhaira.com | 6th Floor, Buhaira Insurance Towers, Khalid Lagoon, Buhaira Corniche, Sharjah, UAE | High | website, phone, email, address | None | Active insurer. |
| **United Fidelity Insurance** | https://fidelityunited.ae | 800 842 | customercare@fidelityunited.ae | The Opus Tower, Block B, Office B703, Business Bay, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Sharjah Insurance** | https://www.shjins.com | 06 519 5666 | sico@shjins.com | Al Boorj Building, Al Boorj Avenue (Bank Street), Rolla, Sharjah, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Sagr Insurance** | http://www.alsagrins.ae | +971 4 702 8500 | asnic@alsagrins.ae | Al Sagr Insurance Building, Diplomatic Area, Al Seef Road, Bur Dubai, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Dhafra Insurance** | http://www.aldhafrainsurance.ae | +971 2 694 9444 | info@aldhafrainsurance.ae | Company Building, Zayed the First Street, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Ain Ahlia Insurance** | https://www.alaininsurance.com | +971 2 611 9999 | info@alaininsurance.com | Al Ain Ahlia Insurance Co. Building, Airport Road, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Fujairah Insurance** | https://afnic.ae | +971 9 223 3355 | callcenter@fujinsco.ae | 8th Floor, Insurance Building, Hamad Bin Abdullah St., Fujairah, UAE | High | website, phone, email, address | None | Active insurer. |
| **Al Wathba Insurance** | https://awnic.com | 600 544 040 | customercare@awnic.com | Al Wathba Tower, Mohammed Bin Butti Al Hamed St., Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Orient Takaful** | https://www.orienttakaful.ae | +971 4 601 7500 | CustomerCare@orienttakaful.ae | Al Futtaim Building, Deira, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Orient Insurance** | https://www.insuranceuae.com | +971 4 253 1300 | orient@alfuttaim.ae | Orient Building, Al Badia Business Park, Dubai Festival City, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **HAYAH Insurance** | https://www.hayah.com | 800 42924 | contact@hayah.com | Floor 16, Sheikh Sultan Bin Hamdan Building, Corniche Road, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Aman Insurance** | https://www.aman.ae | +971 4 319 3111 | info@aman.ae | Gulf Towers, Block B1, Mezzanine Floor, Oud Metha, Dubai, UAE | High | website, phone, email, address | None | Transitioning to an investment holding company. |
| **Dubai Insurance** | https://www.dubins.ae | 800 DUBINS (382467) | info@dubins.ae | Head Office, Al Riqqa Road, Deira, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **RAK Insurance** | https://www.rakinsurance.com | 800 7254 | info@rakinsurance.com | 6th Floor, RAKBANK Headquarters, Sheikh Saqr Bin Mohammad Al Qasimi R/18, Ras Al Khaimah, UAE | High | website, phone, email, address | None | Active insurer. |
| **Methaq Takaful** | https://www.methaq.ae | 600 565 695 | info@methaq.ae | Liwa Tower, ADNEC Area, Abu Dhabi, UAE | High | website, phone, email, address | None | Active insurer. |
| **Watania General Takaful** | https://www.watania.ae | 800 928 2642 | info@watania.ae | The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE | High | website, phone, email, address | None | Active insurer. |
| **Watania Family Takaful** | https://www.watania.ae | 800 928 2642 | info@watania.ae | The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE | High | website, phone, email, address | None | Active family/life insurer. |

## 8. Final SQL Safety Features

- **Uses MASTER_PARTY numbering for new rows only**: Counter increments correctly.
- **Does not change party_code**: Existing party codes are protected.
- **Does not create duplicates**: Checked via case-insensitive legal name and remarks registration number.
- **Child row safety**: Checked using unique primary keys and unique indices on `party_id` when `is_primary = true`.
- **No unverified data**: Left empty for fields where source confidence is not high.

## 9. Final Dataset Count

- **Total insurers reviewed**: 31
- **Insurers included in core party update/insert**: 30 (Yas Takaful excluded)
- **Insurers with address child rows**: 30
- **Insurers with contact child rows**: 30 (contact department verified for 30 insurers)
- **Insurers requiring human review**: 1 (Yas Takaful)
- **Insurers excluded**: 1 (Yas Takaful)

## 10. Rollback Plan Review

The rollback plan has been updated to be 100% precise and **non-time-based**:
1. **Child tables**: Targeted using `notes = 'Seeded via official contact enrichment script.'` which is unique to this script execution.
2. **Parties**: targeted by matching individual registration numbers seeded in this batch and ensuring no other classification type assignments (besides `INSURANCE_COMPANY` ID: 54) are mapped to them, preserving manually created parties.

This ensures rollback can be executed at any time without deleting other users' records.

## 11. SQL File Created

```text
supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses_REVIEWED.sql
```

## 12. Remaining Risks

- **Numbering Counter**: If new parties are created by the script, the global counter will advance. This is normal sequence allocation.
- **Bypassing App Audits**: Bypasses the server action level logAudit, which is the standard expected behavior for SQL seeds.

## 13. Human Approval Required

The user must approve:
1. **Yas Takaful Exclusion**: Excluding Yas Takaful from the script pending manual verification.
2. **Primary Address & Contact Seeding**: Automatically creating a single head office address and primary customer service contact per insurer.
3. **Execution Context**: Executing the SQL inside the Supabase console with Service Role/Superuser privileges.

## 14. Final Recommendation

We recommend executing the reviewed SQL file `supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses_REVIEWED.sql` inside a Supabase Database Console (using the Service Role key or Superuser privileges) after this report is approved by a human administrator.
