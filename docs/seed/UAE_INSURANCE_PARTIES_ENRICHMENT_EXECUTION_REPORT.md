# UAE Insurance Parties Enrichment Execution Report

## 1. Execution Metadata

- **Execution Date**: 2026-06-19
- **Database Context**: Supabase Linked Cloud Database (`mmiefuieduzdiiwnqpie.supabase.co`)
- **Authorization Level**: Service Role / Superuser
- **Execution Script**: `supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses_REVIEWED.sql`
- **Numbering Counter Resync**: Resynchronized `MASTER_PARTY` to start at sequence `84` prior to execution.

## 2. Seeding Statistics

- **Total Insurers Reviewed**: 31
- **Insurers Excluded**: 1 (`Yas Takaful`, license suspended by CBUAE)
- **Insurers Included**: 30
- **Core Party Records Inserted**: 30
- **Core Party Records Updated**: 0
- **Child Head Office Addresses Created**: 30
- **Child Customer Service Contacts Created**: 30
- **Errors/Warnings Encountered**: 0 (Execution completed successfully with 100% transaction safety)

## 3. Seeded Insurer Records Detail

| Display Name | Legal Name | CBUAE Reg No | Party Code | Address Code | Contact Code | Notes / Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Salama Takaful** | Islamic Arab Insurance Company 'SALAMA' PJSC | 017 | `PTY-000084` | `PTYADDR-000001` | `PTYCON-000001` | Active Takaful Insurer |
| **Sukoon Takaful** | Sukoon Takaful PJSC | 006 | `PTY-000085` | `PTYADDR-000002` | `PTYCON-000002` | Active Takaful Insurer |
| **National General Insurance** | National General Insurance Co PSC | 061 | `PTY-000086` | `PTYADDR-000003` | `PTYCON-000003` | Active National Insurer |
| **Daman Insurance** | The National Health Insurance Company (Daman) PJSC | 073 | `PTY-000087` | `PTYADDR-000004` | `PTYCON-000004` | Active Health Insurer |
| **Alliance Insurance** | Alliance Insurance PSC | 018 | `PTY-000088` | `PTYADDR-000005` | `PTYCON-000005` | Active National Insurer |
| **Takaful Emarat** | Takaful Emarat - Insurance PSC | 086 | `PTY-000089` | `PTYADDR-000006` | `PTYCON-000006` | Active Takaful Insurer |
| **Insurance House** | Insurance House PSC | 089 | `PTY-000090` | `PTYADDR-000007` | `PTYCON-000007` | Active National Insurer |
| **Dubai National Insurance** | Dubai National Insurance & Reinsurance P.S.C | 064 | `PTY-000091` | `PTYADDR-000008` | `PTYCON-000008` | Active National Insurer |
| **Sukoon Insurance** | Sukoon Insurance PJSC | 009 | `PTY-000092` | `PTYADDR-000009` | `PTYCON-000009` | Active National Insurer |
| **ADNIC** | Abu Dhabi National Insurance Company PJSC | 001 | `PTY-000093` | `PTYADDR-000010` | `PTYCON-000010` | Active National Insurer |
| **Abu Dhabi Takaful** | Abu Dhabi National Takaful Company PSC | 071 | `PTY-000094` | `PTYADDR-000011` | `PTYCON-000011` | Active Takaful Insurer |
| **Union Insurance** | Union Insurance Company PSC | 067 | `PTY-000095` | `PTYADDR-000012` | `PTYCON-000012` | Active National Insurer |
| **Emirates Insurance** | Emirates Insurance Company (PSC) | 002 | `PTY-000096` | `PTYADDR-000013` | `PTYCON-000013` | Active National Insurer |
| **Al Buhaira Insurance** | Al Buhaira National Insurance Co PSC | 015 | `PTY-000097` | `PTYADDR-000014` | `PTYCON-000014` | Active National Insurer |
| **United Fidelity Insurance** | United Fidelity Insurance Company PSC | 008 | `PTY-000098` | `PTYADDR-000015` | `PTYCON-000015` | Active National Insurer |
| **Sharjah Insurance** | Sharjah Insurance Company (P.S.C) | 012 | `PTY-000099` | `PTYADDR-000016` | `PTYCON-000016` | Active National Insurer |
| **Al Sagr Insurance** | Al Sagr National Insurance Co. (PSC) | 016 | `PTY-000100` | `PTYADDR-000017` | `PTYCON-000017` | Active National Insurer |
| **Al Dhafra Insurance** | Al Dhafra Insurance Company PSC | 005 | `PTY-000101` | `PTYADDR-000018` | `PTYCON-000018` | Active National Insurer |
| **Al Ain Ahlia Insurance** | Al Ain Ahlia Insurance Company PSC | 003 | `PTY-000102` | `PTYADDR-000019` | `PTYCON-000019` | Active National Insurer |
| **Al Fujairah Insurance** | Al Fujairah National Insurance Company PSC | 011 | `PTY-000103` | `PTYADDR-000020` | `PTYCON-000020` | Active National Insurer |
| **Al Wathba Insurance** | Al Wathba National Insurance Company PJSC | 010 | `PTY-000104` | `PTYADDR-000021` | `PTYCON-000021` | Active National Insurer |
| **Orient Takaful** | Orient Takaful (PJSC) | 092 | `PTY-000105` | `PTYADDR-000022` | `PTYCON-000022` | Active Takaful Insurer |
| **Orient Insurance** | Orient Insurance Company PJSC | 014 | `PTY-000106` | `PTYADDR-000023` | `PTYCON-000023` | Active National Insurer |
| **HAYAH Insurance** | HAYAH Insurance Company PJSC | 083 | `PTY-000107` | `PTYADDR-000024` | `PTYCON-000024` | Active National Insurer |
| **Aman Insurance** | Dubai Islamic Insurance & Reinsurance Co. (Aman) PSC | 070 | `PTY-000108` | `PTYADDR-000025` | `PTYCON-000025` | Transitioning Status |
| **Dubai Insurance** | Dubai Insurance Company (PSC) | 004 | `PTY-000109` | `PTYADDR-000026` | `PTYCON-000026` | Active National Insurer |
| **RAK Insurance** | Ras Al Khaimah National Insurance Company P.S.C | 007 | `PTY-000110` | `PTYADDR-000027` | `PTYCON-000027` | Active National Insurer |
| **Methaq Takaful** | Methaq Takaful Insurance PSC | 082 | `PTY-000111` | `PTYADDR-000028` | `PTYCON-000028` | Active Takaful Insurer |
| **Watania General Takaful** | Watania Takaful General PJSC | 085 | `PTY-000112` | `PTYADDR-000029` | `PTYCON-000029` | Active Takaful Insurer |
| **Watania Family Takaful** | Watania Takaful Family Insurance Company PJSC | 078 | `PTY-000113` | `PTYADDR-000030` | `PTYCON-000030` | Active Takaful Insurer |

## 4. Rollback and Cleanup Instructions

If it is ever required to rollback only the data changes made by this script, execute the following SQL inside the Database Console:

```sql
BEGIN;

-- 1. Remove child contacts created by this enrichment
DELETE FROM public.party_contacts
WHERE notes = 'Seeded via official contact enrichment script.'
  AND party_id IN (
    SELECT id FROM public.parties WHERE remarks LIKE 'CBUAE licensed insurance policy issuer.%'
  );

-- 2. Remove child addresses created by this enrichment
DELETE FROM public.party_addresses
WHERE notes = 'Seeded via official contact enrichment script.'
  AND party_id IN (
    SELECT id FROM public.parties WHERE remarks LIKE 'CBUAE licensed insurance policy issuer.%'
  );

-- 3. Delete the parties classification assignments
DELETE FROM public.party_type_assignments
WHERE party_type_id = 54
  AND party_id IN (
    SELECT id FROM public.parties 
    WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
      AND remarks NOT LIKE '%Yas Takaful%'
  );

-- 4. Delete the core parties
DELETE FROM public.parties
WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
  AND remarks NOT LIKE '%Yas Takaful%';

COMMIT;
```
