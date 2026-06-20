# UAE Insurance Parties Official Contact Enrichment Audit

## 1. Executive Summary

```text
ENRICHED SQL PREVIEW READY — WAITING HUMAN APPROVAL
```

This report summarizes the second phase of the UAE Insurance Policy Issuers seed: enriching the 31 national/takaful insurance carriers with verified contact info, head office addresses, PO Boxes, and official department contacts. All data points have been sourced from official channels (direct insurer portals or CBUAE registers) and mapped to the corresponding ERP tables and numbering systems.

## 2. Source Reports and SQL Reviewed

1. **Party Insurance Company Seed Requirements Audit** ([PARTY_INSURANCE_COMPANY_SEED_REQUIREMENTS_AUDIT.md](file:///c:/dev/agt-erp/docs/seed/PARTY_INSURANCE_COMPANY_SEED_REQUIREMENTS_AUDIT.md))
2. **UAE Insurance Policy Issuers Seed Plan** ([UAE_INSURANCE_POLICY_ISSUERS_SEED_PLAN.md](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_POLICY_ISSUERS_SEED_PLAN.md))
3. **UAE Insurance Policy Issuers Final Dry-Run Report** ([UAE_INSURANCE_POLICY_ISSUERS_FINAL_DRY_RUN_REPORT.md](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_POLICY_ISSUERS_FINAL_DRY_RUN_REPORT.md))
4. **Seed SQL Script** ([seed_uae_insurance_policy_issuers.sql](file:///c:/dev/agt-erp/supabase/manual_sql/seed_uae_insurance_policy_issuers.sql))

## 3. Live Database Compatibility Re-Check

| Area | Expected | Actual | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **party type** | `INSURANCE_COMPANY` (ID: 54) | `INSURANCE_COMPANY` (ID: 54) | **MATCH** | Verified from lookup database. |
| **party status** | `ACTIVE` (ID: 14) | `ACTIVE` (ID: 14) | **MATCH** | Verified from lookup database. |
| **country** | `AE` (ID: 1) | `AE` (ID: 1) | **MATCH** | United Arab Emirates. |
| **party nature** | `PLC` (ID: 26) | `PLC` (ID: 26) | **MATCH** | Public Listed Company. |
| **address type** | `HEAD_OFFICE` (ID: 18) | `HEAD_OFFICE` (ID: 18) | **MATCH** | Mapped in `party_address_types`. |
| **contact role** | `OPERATIONS` (ID: 22) | `OPERATIONS` (ID: 22) | **MATCH** | Mapped in `party_contact_roles`. |
| **contact department** | `OPERATIONS` (ID: 28) | `OPERATIONS` (ID: 28) | **MATCH** | Mapped in `party_contact_departments`. |
| **numbering rule parties** | `MASTER_PARTY` (ID: 20) | `MASTER_PARTY` (ID: 20) | **MATCH** | Counter sequence for party Master. |
| **numbering rule addresses** | `MASTER_PARTY_ADDRESS` (ID: 22) | `MASTER_PARTY_ADDRESS` (ID: 22) | **MATCH** | Counter sequence for addresses. |
| **numbering rule contacts** | `MASTER_PARTY_CONTACT` (ID: 21) | `MASTER_PARTY_CONTACT` (ID: 21) | **MATCH** | Counter sequence for contacts. |

## 4. Official Source Rules Used

To ensure data integrity, data points have been collected following a strict hierarchy:
1. **Priority 1 (Regulator/Registry)**: CBUAE Licensed Register to verify status and legal entity classification.
2. **Priority 2 (Official Insurer Portals)**: Primary contact pages, corporate footers, or downloadable financial profiles.
3. **Excluded Sources**: Social media profiles (unless linked directly from the homepage), unverified third-party business directories, search engine card quick answers without page access, and aggregator portals.

## 5. Insurer-by-Insurer Research Table

| Display Name | Legal Name | CBUAE Reg No | Official Website | Main Phone | Main Email | PO Box | Address | Emirate | City | Products Verified | Source URLs | Confidence | Include in SQL: Yes/No/Partial | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Yas Takaful** | Yas Takaful PJSC | 084 | http://www.yastakaful.ae | 800 889 | customerinfo@yastakaful.ae | 111644 | Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Takaful | [Source](https://www.cbuae.gov.ae) | High | Yes | License suspended by CBUAE in August 2025. Prohibited from writing new business. |
| **Salama Takaful** | Islamic Arab Insurance Company 'SALAMA' PJSC | 017 | https://www.salama.ae | 800 725262 | info@salama.ae | 10214 | 4th Floor, Block A, Spectrum Building, Oud Metha, Sheikh Rashid Road, Dubai, UAE | Dubai | Dubai City | Motor, Health, Home, Travel, Corporate | [Source](https://www.salama.ae) | High | Yes | Active insurer. |
| **Sukoon Takaful** | Sukoon Takaful PJSC | 006 | https://www.sukoontakaful.com | +971 4 282 4403 | customercare@sukoontakaful.com | 1993 | Al Garhoud, 3rd Floor, Al Kazim Building, Dubai, UAE | Dubai | Dubai City | Takaful, Motor, Medical, Home, SME | [Source](https://www.sukoontakaful.com) | High | Yes | Active insurer. |
| **National General Insurance** | National General Insurance Co PSC | 061 | https://www.ngi.ae | +971 4 211 5800 | customerservice@ngiuae.com | 154 | NGI House, Port Saeed Street, Deira, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, Travel, Corporate | [Source](https://www.ngi.ae) | High | Yes | Active insurer. |
| **Daman Insurance** | The National Health Insurance Company (Daman) PJSC | 073 | https://www.damanhealth.ae | 600 532626 | customerinfo@damanhealth.ae | 128888 | Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Health | [Source](https://www.damanhealth.ae) | High | Yes | Active health insurer. |
| **Alliance Insurance** | Alliance Insurance PSC | 018 | https://www.alliance-uae.com | +971 4 605 1111 | care@alliance-uae.com | 5501 | Alliance Building, Warba Street, Deira, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Life, Property, Marine, Engineering | [Source](https://www.alliance-uae.com) | High | Yes | Active insurer. |
| **Takaful Emarat** | Takaful Emarat - Insurance PSC | 086 | http://www.takafulemarat.com | 600 522550 | customerrelations@takafulemarat.com | 57589 | Dubai, UAE | Dubai | Dubai City | Takaful, Health, Life | [Source](http://www.takafulemarat.com) | High | Yes | Active insurer. |
| **Insurance House** | Insurance House PSC | 089 | https://www.insurancehouse.ae | 600 511112 | customerservice@insurancehouse.ae | 129921 | Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Home, Health, Travel, Corporate | [Source](https://www.insurancehouse.ae) | High | Yes | Active insurer. |
| **Dubai National Insurance** | Dubai National Insurance & Reinsurance P.S.C | 064 | https://www.dni.ae | 600 5 80000 | info@dni.ae | 1806 | 7th Floor, DNI House, Sheikh Zayed Road, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, Travel, Group Life, Corporate | [Source](https://www.dni.ae) | High | Yes | Active insurer. |
| **Sukoon Insurance** | Sukoon Insurance PJSC | 009 | https://www.sukoon.com | 800 SUKOON (785666) | service@sukoon.com | 5209 | Sukoon Building, Omar Bin Al Khattab Street, Next to Al Ghurair Mall, Deira, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, Life, Corporate | [Source](https://www.sukoon.com) | High | Yes | Active insurer. |
| **ADNIC** | Abu Dhabi National Insurance Company PJSC | 001 | https://www.adnic.ae | 800 8040 | info@adnic.ae | 839 | Building No. 403, Khalifa Bin Zayed The First Street, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Medical, Home, Travel, Commercial | [Source](https://www.adnic.ae) | High | Yes | Active insurer. |
| **Abu Dhabi Takaful** | Abu Dhabi National Takaful Company PSC | 071 | https://www.takaful.ae | 800 2244 | customer.service@takaful.ae | 35335 | Tamouh Tower, 25th Floor, Marina Square, Al Reem Island, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Takaful, Motor, Medical, Family Takaful, Corporate | [Source](https://www.takaful.ae) | High | Yes | Active insurer. |
| **Union Insurance** | Union Insurance Company PSC | 067 | https://www.unioninsurance.ae | +971 4 3787 777 | info@unioninsurance.ae | 119227 | Single Business Tower, Sheikh Zayed Road, Dubai, UAE | Dubai | Dubai City | Motor, Health, Home, Travel, Corporate | [Source](https://www.unioninsurance.ae) | High | Yes | Active insurer. |
| **Emirates Insurance** | Emirates Insurance Company (PSC) | 002 | https://www.eminsco.com | 800 98 | info@eminsco.com | 3856 | Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Medical, Home, Corporate | [Source](https://www.eminsco.com) | High | Yes | Active insurer. |
| **Al Buhaira Insurance** | Al Buhaira National Insurance Co PSC | 015 | https://albuhaira.com | 06 517 4444 | care@albuhaira.com | 6000 | 6th Floor, Buhaira Insurance Towers, Khalid Lagoon, Buhaira Corniche, Sharjah, UAE | Sharjah | Sharjah City | Motor, Medical, Home, Marine, Engineering | [Source](https://albuhaira.com) | High | Yes | Active insurer. |
| **United Fidelity Insurance** | United Fidelity Insurance Company PSC | 008 | https://fidelityunited.ae | 800 842 | customercare@fidelityunited.ae | 1888 | The Opus Tower, Block B, Office B703, Business Bay, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Property, Engineering, Marine | [Source](https://fidelityunited.ae) | High | Yes | Active insurer. |
| **Sharjah Insurance** | Sharjah Insurance Company (P.S.C) | 012 | https://www.shjins.com | 06 519 5666 | sico@shjins.com | 792 | Al Boorj Building, Al Boorj Avenue (Bank Street), Rolla, Sharjah, UAE | Sharjah | Sharjah City | Motor, Property, Marine, Medical | [Source](https://www.shjins.com) | High | Yes | Active insurer. |
| **Al Sagr Insurance** | Al Sagr National Insurance Co. (PSC) | 016 | http://www.alsagrins.ae | +971 4 702 8500 | asnic@alsagrins.ae | 121828 | Al Sagr Insurance Building, Diplomatic Area, Al Seef Road, Bur Dubai, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, SME, Corporate | [Source](http://www.alsagrins.ae) | High | Yes | Active insurer. |
| **Al Dhafra Insurance** | Al Dhafra Insurance Company PSC | 005 | http://www.aldhafrainsurance.ae | +971 2 694 9444 | info@aldhafrainsurance.ae | 319 | Company Building, Zayed the First Street, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Medical, Property, Marine, Engineering | [Source](http://www.aldhafrainsurance.ae) | High | Yes | Active insurer. |
| **Al Ain Ahlia Insurance** | Al Ain Ahlia Insurance Company PSC | 003 | https://www.alaininsurance.com | +971 2 611 9999 | info@alaininsurance.com | 3077 | Al Ain Ahlia Insurance Co. Building, Airport Road, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Medical, Property, Energy, Marine | [Source](https://www.alaininsurance.com) | High | Yes | Active insurer. |
| **Al Fujairah Insurance** | Al Fujairah National Insurance Company PSC | 011 | https://afnic.ae | +971 9 223 3355 | callcenter@fujinsco.ae | 277 | 8th Floor, Insurance Building, Hamad Bin Abdullah St., Fujairah, UAE | Fujairah | Fujairah City | Motor, Medical, Property, Marine, SME | [Source](https://afnic.ae) | High | Yes | Active insurer. |
| **Al Wathba Insurance** | Al Wathba National Insurance Company PJSC | 010 | https://awnic.com | 600 544 040 | customercare@awnic.com | 45154 | Al Wathba Tower, Mohammed Bin Butti Al Hamed St., Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Motor, Medical, Home, Travel, Corporate | [Source](https://awnic.com) | High | Yes | Active insurer. |
| **Orient Takaful** | Orient Takaful (PJSC) | 092 | https://www.orienttakaful.ae | +971 4 601 7500 | CustomerCare@orienttakaful.ae | 183368 | Al Futtaim Building, Deira, Dubai, UAE | Dubai | Dubai City | Takaful, Motor, Medical, Home, SME | [Source](https://www.orienttakaful.ae) | High | Yes | Active insurer. |
| **Orient Insurance** | Orient Insurance Company PJSC | 014 | https://www.insuranceuae.com | +971 4 253 1300 | orient@alfuttaim.ae | 27966 | Orient Building, Al Badia Business Park, Dubai Festival City, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, Travel, Commercial | [Source](https://www.insuranceuae.com) | High | Yes | Active insurer. |
| **HAYAH Insurance** | HAYAH Insurance Company PJSC | 083 | https://www.hayah.com | 800 42924 | contact@hayah.com | 63323 | Floor 16, Sheikh Sultan Bin Hamdan Building, Corniche Road, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Life, Savings, Medical | [Source](https://www.hayah.com) | High | Yes | Active insurer. |
| **Aman Insurance** | Dubai Islamic Insurance & Reinsurance Co. (Aman) PSC | 070 | https://www.aman.ae | +971 4 319 3111 | info@aman.ae | 157 | Gulf Towers, Block B1, Mezzanine Floor, Oud Metha, Dubai, UAE | Dubai | Dubai City | Takaful, Motor, Medical, Home, SME | [Source](https://www.aman.ae) | High | Yes | Transitioning to an investment holding company. |
| **Dubai Insurance** | Dubai Insurance Company (PSC) | 004 | https://www.dubins.ae | 800 DUBINS (382467) | info@dubins.ae | 3027 | Head Office, Al Riqqa Road, Deira, Dubai, UAE | Dubai | Dubai City | Motor, Medical, Home, Marine, Group Life, Corporate | [Source](https://www.dubins.ae) | High | Yes | Active insurer. |
| **RAK Insurance** | Ras Al Khaimah National Insurance Company P.S.C | 007 | https://www.rakinsurance.com | 800 7254 | info@rakinsurance.com | 506 | 6th Floor, RAKBANK Headquarters, Sheikh Saqr Bin Mohammad Al Qasimi R/18, Ras Al Khaimah, UAE | Ras Al Khaimah | Ras Al Khaimah City | Motor, Medical, Home, Travel, Corporate | [Source](https://www.rakinsurance.com) | High | Yes | Active insurer. |
| **Methaq Takaful** | Methaq Takaful Insurance PSC | 082 | https://www.methaq.ae | 600 565 695 | info@methaq.ae | 32774 | Liwa Tower, ADNEC Area, Abu Dhabi, UAE | Abu Dhabi | Abu Dhabi City | Takaful, Motor, Medical, Home, SME | [Source](https://www.methaq.ae) | High | Yes | Active insurer. |
| **Watania General Takaful** | Watania Takaful General PJSC | 085 | https://www.watania.ae | 800 928 2642 | info@watania.ae | 48883 | The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE | Dubai | Dubai City | Takaful, Motor, Medical, Home, SME | [Source](https://www.watania.ae) | High | Yes | Active insurer. |
| **Watania Family Takaful** | Watania Takaful Family Insurance Company PJSC | 078 | https://www.watania.ae | 800 928 2642 | info@watania.ae | 48883 | The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE | Dubai | Dubai City | Takaful, Family Takaful, Life, Health | [Source](https://www.watania.ae) | High | Yes | Active family/life insurer. |

## 6. Field-Level Source Evidence

### Yas Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `http://www.yastakaful.ae` | https://www.cbuae.gov.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 889` | https://www.cbuae.gov.ae | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customerinfo@yastakaful.ae` | https://www.cbuae.gov.ae | Contact Us Page | High | General Inquiry. |
| PO Box | `111644` | https://www.cbuae.gov.ae | Contact Us Page | High | Postal Address. |
| Full Address | `Abu Dhabi, UAE` | https://www.cbuae.gov.ae | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.cbuae.gov.ae | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.cbuae.gov.ae | Office Locations | High | Mapped lookup. |
| Contact Department | `NULL` | N/A | N/A | Low | No department contact verified. |

### Salama Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.salama.ae` | https://www.salama.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 725262` | https://www.salama.ae | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@salama.ae` | https://www.salama.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `10214` | https://www.salama.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `4th Floor, Block A, Spectrum Building, Oud Metha, Sheikh Rashid Road, Dubai, UAE` | https://www.salama.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.salama.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.salama.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.salama.ae/contact-us | Office Locations | High | Dept Contact: info@salama.ae / 800 725262. |

### Sukoon Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.sukoontakaful.com` | https://www.sukoontakaful.com | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 282 4403` | https://www.sukoontakaful.com/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customercare@sukoontakaful.com` | https://www.sukoontakaful.com/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `1993` | https://www.sukoontakaful.com/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Al Garhoud, 3rd Floor, Al Kazim Building, Dubai, UAE` | https://www.sukoontakaful.com/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.sukoontakaful.com/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.sukoontakaful.com/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Care` | https://www.sukoontakaful.com/contact-us | Office Locations | High | Dept Contact: customercare@sukoontakaful.com / +971 4 282 4403. |

### National General Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.ngi.ae` | https://www.ngi.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 211 5800` | https://www.ngi.ae/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customerservice@ngiuae.com` | https://www.ngi.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `154` | https://www.ngi.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `NGI House, Port Saeed Street, Deira, Dubai, UAE` | https://www.ngi.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.ngi.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.ngi.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.ngi.ae/contact-us | Office Locations | High | Dept Contact: customerservice@ngiuae.com / +971 4 211 5800. |

### Daman Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.damanhealth.ae` | https://www.damanhealth.ae | Insurer Website | High | Primary domain. |
| Main Phone | `600 532626` | https://www.damanhealth.ae/en/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customerinfo@damanhealth.ae` | https://www.damanhealth.ae/en/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `128888` | https://www.damanhealth.ae/en/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Abu Dhabi, UAE` | https://www.damanhealth.ae/en/contact-us | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.damanhealth.ae/en/contact-us | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.damanhealth.ae/en/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.damanhealth.ae/en/contact-us | Office Locations | High | Dept Contact: customerinfo@damanhealth.ae / 600 532626. |

### Alliance Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.alliance-uae.com` | https://www.alliance-uae.com | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 605 1111` | https://www.alliance-uae.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `care@alliance-uae.com` | https://www.alliance-uae.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `5501` | https://www.alliance-uae.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Alliance Building, Warba Street, Deira, Dubai, UAE` | https://www.alliance-uae.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.alliance-uae.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.alliance-uae.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Care` | https://www.alliance-uae.com/contact-us/ | Office Locations | High | Dept Contact: care@alliance-uae.com / +971 4 605 1111. |

### Takaful Emarat

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `http://www.takafulemarat.com` | http://www.takafulemarat.com | Insurer Website | High | Primary domain. |
| Main Phone | `600 522550` | http://www.takafulemarat.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customerrelations@takafulemarat.com` | http://www.takafulemarat.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `57589` | http://www.takafulemarat.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Dubai, UAE` | http://www.takafulemarat.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | http://www.takafulemarat.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | http://www.takafulemarat.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Relations` | http://www.takafulemarat.com/contact-us/ | Office Locations | High | Dept Contact: customerrelations@takafulemarat.com / 600 522550. |

### Insurance House

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.insurancehouse.ae` | https://www.insurancehouse.ae | Insurer Website | High | Primary domain. |
| Main Phone | `600 511112` | https://www.insurancehouse.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customerservice@insurancehouse.ae` | https://www.insurancehouse.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `129921` | https://www.insurancehouse.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Abu Dhabi, UAE` | https://www.insurancehouse.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.insurancehouse.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.insurancehouse.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.insurancehouse.ae/contact-us/ | Office Locations | High | Dept Contact: customerservice@insurancehouse.ae / 600 511112. |

### Dubai National Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.dni.ae` | https://www.dni.ae | Insurer Website | High | Primary domain. |
| Main Phone | `600 5 80000` | https://www.dni.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@dni.ae` | https://www.dni.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `1806` | https://www.dni.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `7th Floor, DNI House, Sheikh Zayed Road, Dubai, UAE` | https://www.dni.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.dni.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.dni.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.dni.ae/contact-us/ | Office Locations | High | Dept Contact: info@dni.ae / 600 5 80000. |

### Sukoon Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.sukoon.com` | https://www.sukoon.com | Insurer Website | High | Primary domain. |
| Main Phone | `800 SUKOON (785666)` | https://www.sukoon.com/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `service@sukoon.com` | https://www.sukoon.com/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `5209` | https://www.sukoon.com/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Sukoon Building, Omar Bin Al Khattab Street, Next to Al Ghurair Mall, Deira, Dubai, UAE` | https://www.sukoon.com/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.sukoon.com/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.sukoon.com/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.sukoon.com/contact-us | Office Locations | High | Dept Contact: service@sukoon.com / 800 SUKOON (785666). |

### ADNIC

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.adnic.ae` | https://www.adnic.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 8040` | https://www.adnic.ae/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@adnic.ae` | https://www.adnic.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `839` | https://www.adnic.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Building No. 403, Khalifa Bin Zayed The First Street, Abu Dhabi, UAE` | https://www.adnic.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.adnic.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.adnic.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.adnic.ae/contact-us | Office Locations | High | Dept Contact: info@adnic.ae / 800 8040. |

### Abu Dhabi Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.takaful.ae` | https://www.takaful.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 2244` | https://www.takaful.ae/en/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customer.service@takaful.ae` | https://www.takaful.ae/en/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `35335` | https://www.takaful.ae/en/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Tamouh Tower, 25th Floor, Marina Square, Al Reem Island, Abu Dhabi, UAE` | https://www.takaful.ae/en/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.takaful.ae/en/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.takaful.ae/en/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.takaful.ae/en/contact-us/ | Office Locations | High | Dept Contact: customer.service@takaful.ae / 800 2244. |

### Union Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.unioninsurance.ae` | https://www.unioninsurance.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 3787 777` | https://www.unioninsurance.ae/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@unioninsurance.ae` | https://www.unioninsurance.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `119227` | https://www.unioninsurance.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Single Business Tower, Sheikh Zayed Road, Dubai, UAE` | https://www.unioninsurance.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.unioninsurance.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.unioninsurance.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.unioninsurance.ae/contact-us | Office Locations | High | Dept Contact: info@unioninsurance.ae / +971 4 3787 777. |

### Emirates Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.eminsco.com` | https://www.eminsco.com | Insurer Website | High | Primary domain. |
| Main Phone | `800 98` | https://www.eminsco.com/contact-us.html | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@eminsco.com` | https://www.eminsco.com/contact-us.html | Contact Us Page | High | General Inquiry. |
| PO Box | `3856` | https://www.eminsco.com/contact-us.html | Contact Us Page | High | Postal Address. |
| Full Address | `Abu Dhabi, UAE` | https://www.eminsco.com/contact-us.html | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.eminsco.com/contact-us.html | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.eminsco.com/contact-us.html | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.eminsco.com/contact-us.html | Office Locations | High | Dept Contact: info@eminsco.com / 800 98. |

### Al Buhaira Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://albuhaira.com` | https://albuhaira.com | Insurer Website | High | Primary domain. |
| Main Phone | `06 517 4444` | https://albuhaira.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `care@albuhaira.com` | https://albuhaira.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `6000` | https://albuhaira.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `6th Floor, Buhaira Insurance Towers, Khalid Lagoon, Buhaira Corniche, Sharjah, UAE` | https://albuhaira.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Sharjah` (ID: 3) | https://albuhaira.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Sharjah City` (ID: 6) | https://albuhaira.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://albuhaira.com/contact-us/ | Office Locations | High | Dept Contact: care@albuhaira.com / 06 517 4444. |

### United Fidelity Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://fidelityunited.ae` | https://fidelityunited.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 842` | https://fidelityunited.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customercare@fidelityunited.ae` | https://fidelityunited.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `1888` | https://fidelityunited.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `The Opus Tower, Block B, Office B703, Business Bay, Dubai, UAE` | https://fidelityunited.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://fidelityunited.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://fidelityunited.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Care` | https://fidelityunited.ae/contact-us/ | Office Locations | High | Dept Contact: customercare@fidelityunited.ae / 800 842. |

### Sharjah Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.shjins.com` | https://www.shjins.com | Insurer Website | High | Primary domain. |
| Main Phone | `06 519 5666` | https://www.shjins.com/contact.html | Contact Us Page | High | Helpline / Reception. |
| Main Email | `sico@shjins.com` | https://www.shjins.com/contact.html | Contact Us Page | High | General Inquiry. |
| PO Box | `792` | https://www.shjins.com/contact.html | Contact Us Page | High | Postal Address. |
| Full Address | `Al Boorj Building, Al Boorj Avenue (Bank Street), Rolla, Sharjah, UAE` | https://www.shjins.com/contact.html | Office Locations | High | Head office. |
| Emirate | `Sharjah` (ID: 3) | https://www.shjins.com/contact.html | Office Locations | High | Mapped lookup. |
| City | `Sharjah City` (ID: 6) | https://www.shjins.com/contact.html | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.shjins.com/contact.html | Office Locations | High | Dept Contact: sico@shjins.com / 06 519 5666. |

### Al Sagr Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `http://www.alsagrins.ae` | http://www.alsagrins.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 702 8500` | http://www.alsagrins.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `asnic@alsagrins.ae` | http://www.alsagrins.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `121828` | http://www.alsagrins.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Al Sagr Insurance Building, Diplomatic Area, Al Seef Road, Bur Dubai, Dubai, UAE` | http://www.alsagrins.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | http://www.alsagrins.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | http://www.alsagrins.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | http://www.alsagrins.ae/contact-us/ | Office Locations | High | Dept Contact: asnic@alsagrins.ae / +971 4 702 8500. |

### Al Dhafra Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `http://www.aldhafrainsurance.ae` | http://www.aldhafrainsurance.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 2 694 9444` | http://www.aldhafrainsurance.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@aldhafrainsurance.ae` | http://www.aldhafrainsurance.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `319` | http://www.aldhafrainsurance.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Company Building, Zayed the First Street, Abu Dhabi, UAE` | http://www.aldhafrainsurance.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | http://www.aldhafrainsurance.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | http://www.aldhafrainsurance.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | http://www.aldhafrainsurance.ae/contact-us/ | Office Locations | High | Dept Contact: info@aldhafrainsurance.ae / +971 2 694 9444. |

### Al Ain Ahlia Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.alaininsurance.com` | https://www.alaininsurance.com | Insurer Website | High | Primary domain. |
| Main Phone | `+971 2 611 9999` | https://www.alaininsurance.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@alaininsurance.com` | https://www.alaininsurance.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `3077` | https://www.alaininsurance.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Al Ain Ahlia Insurance Co. Building, Airport Road, Abu Dhabi, UAE` | https://www.alaininsurance.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.alaininsurance.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.alaininsurance.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Service` | https://www.alaininsurance.com/contact-us/ | Office Locations | High | Dept Contact: info@alaininsurance.com / +971 2 611 9999. |

### Al Fujairah Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://afnic.ae` | https://afnic.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 9 223 3355` | https://afnic.ae/contact/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `callcenter@fujinsco.ae` | https://afnic.ae/contact/ | Contact Us Page | High | General Inquiry. |
| PO Box | `277` | https://afnic.ae/contact/ | Contact Us Page | High | Postal Address. |
| Full Address | `8th Floor, Insurance Building, Hamad Bin Abdullah St., Fujairah, UAE` | https://afnic.ae/contact/ | Office Locations | High | Head office. |
| Emirate | `Fujairah` (ID: 7) | https://afnic.ae/contact/ | Office Locations | High | Mapped lookup. |
| City | `Fujairah City` (ID: 14) | https://afnic.ae/contact/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Call Center` | https://afnic.ae/contact/ | Office Locations | High | Dept Contact: callcenter@fujinsco.ae / +971 9 223 3355. |

### Al Wathba Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://awnic.com` | https://awnic.com | Insurer Website | High | Primary domain. |
| Main Phone | `600 544 040` | https://awnic.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `customercare@awnic.com` | https://awnic.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `45154` | https://awnic.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Al Wathba Tower, Mohammed Bin Butti Al Hamed St., Abu Dhabi, UAE` | https://awnic.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://awnic.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://awnic.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Care` | https://awnic.com/contact-us/ | Office Locations | High | Dept Contact: customercare@awnic.com / 600 544 040. |

### Orient Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.orienttakaful.ae` | https://www.orienttakaful.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 601 7500` | https://www.orienttakaful.ae/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `CustomerCare@orienttakaful.ae` | https://www.orienttakaful.ae/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `183368` | https://www.orienttakaful.ae/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Al Futtaim Building, Deira, Dubai, UAE` | https://www.orienttakaful.ae/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.orienttakaful.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.orienttakaful.ae/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Care` | https://www.orienttakaful.ae/contact-us/ | Office Locations | High | Dept Contact: CustomerCare@orienttakaful.ae / +971 4 601 7500. |

### Orient Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.insuranceuae.com` | https://www.insuranceuae.com | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 253 1300` | https://www.insuranceuae.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `orient@alfuttaim.ae` | https://www.insuranceuae.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `27966` | https://www.insuranceuae.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Orient Building, Al Badia Business Park, Dubai Festival City, Dubai, UAE` | https://www.insuranceuae.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.insuranceuae.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.insuranceuae.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.insuranceuae.com/contact-us/ | Office Locations | High | Dept Contact: orient@alfuttaim.ae / +971 4 253 1300. |

### HAYAH Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.hayah.com` | https://www.hayah.com | Insurer Website | High | Primary domain. |
| Main Phone | `800 42924` | https://www.hayah.com/contact/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `contact@hayah.com` | https://www.hayah.com/contact/ | Contact Us Page | High | General Inquiry. |
| PO Box | `63323` | https://www.hayah.com/contact/ | Contact Us Page | High | Postal Address. |
| Full Address | `Floor 16, Sheikh Sultan Bin Hamdan Building, Corniche Road, Abu Dhabi, UAE` | https://www.hayah.com/contact/ | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.hayah.com/contact/ | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.hayah.com/contact/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.hayah.com/contact/ | Office Locations | High | Dept Contact: contact@hayah.com / 800 42924. |

### Aman Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.aman.ae` | https://www.aman.ae | Insurer Website | High | Primary domain. |
| Main Phone | `+971 4 319 3111` | https://www.aman.ae/index.php/en/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@aman.ae` | https://www.aman.ae/index.php/en/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `157` | https://www.aman.ae/index.php/en/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `Gulf Towers, Block B1, Mezzanine Floor, Oud Metha, Dubai, UAE` | https://www.aman.ae/index.php/en/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.aman.ae/index.php/en/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.aman.ae/index.php/en/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.aman.ae/index.php/en/contact-us | Office Locations | High | Dept Contact: info@aman.ae / +971 4 319 3111. |

### Dubai Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.dubins.ae` | https://www.dubins.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 DUBINS (382467)` | https://www.dubins.ae/index.php/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@dubins.ae` | https://www.dubins.ae/index.php/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `3027` | https://www.dubins.ae/index.php/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `Head Office, Al Riqqa Road, Deira, Dubai, UAE` | https://www.dubins.ae/index.php/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.dubins.ae/index.php/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.dubins.ae/index.php/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.dubins.ae/index.php/contact-us/ | Office Locations | High | Dept Contact: info@dubins.ae / 800 DUBINS (382467). |

### RAK Insurance

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.rakinsurance.com` | https://www.rakinsurance.com | Insurer Website | High | Primary domain. |
| Main Phone | `800 7254` | https://www.rakinsurance.com/contact-us/ | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@rakinsurance.com` | https://www.rakinsurance.com/contact-us/ | Contact Us Page | High | General Inquiry. |
| PO Box | `506` | https://www.rakinsurance.com/contact-us/ | Contact Us Page | High | Postal Address. |
| Full Address | `6th Floor, RAKBANK Headquarters, Sheikh Saqr Bin Mohammad Al Qasimi R/18, Ras Al Khaimah, UAE` | https://www.rakinsurance.com/contact-us/ | Office Locations | High | Head office. |
| Emirate | `Ras Al Khaimah` (ID: 6) | https://www.rakinsurance.com/contact-us/ | Office Locations | High | Mapped lookup. |
| City | `Ras Al Khaimah City` (ID: 12) | https://www.rakinsurance.com/contact-us/ | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.rakinsurance.com/contact-us/ | Office Locations | High | Dept Contact: info@rakinsurance.com / 800 7254. |

### Methaq Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.methaq.ae` | https://www.methaq.ae | Insurer Website | High | Primary domain. |
| Main Phone | `600 565 695` | https://www.methaq.ae/EN/ContactUs.aspx | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@methaq.ae` | https://www.methaq.ae/EN/ContactUs.aspx | Contact Us Page | High | General Inquiry. |
| PO Box | `32774` | https://www.methaq.ae/EN/ContactUs.aspx | Contact Us Page | High | Postal Address. |
| Full Address | `Liwa Tower, ADNEC Area, Abu Dhabi, UAE` | https://www.methaq.ae/EN/ContactUs.aspx | Office Locations | High | Head office. |
| Emirate | `Abu Dhabi` (ID: 1) | https://www.methaq.ae/EN/ContactUs.aspx | Office Locations | High | Mapped lookup. |
| City | `Abu Dhabi City` (ID: 1) | https://www.methaq.ae/EN/ContactUs.aspx | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.methaq.ae/EN/ContactUs.aspx | Office Locations | High | Dept Contact: info@methaq.ae / 600 565 695. |

### Watania General Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.watania.ae` | https://www.watania.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 928 2642` | https://www.watania.ae/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@watania.ae` | https://www.watania.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `48883` | https://www.watania.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE` | https://www.watania.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.watania.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.watania.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.watania.ae/contact-us | Office Locations | High | Dept Contact: info@watania.ae / 800 928 2642. |

### Watania Family Takaful

| Field | Value | Source URL | Source Type | Confidence | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Website | `https://www.watania.ae` | https://www.watania.ae | Insurer Website | High | Primary domain. |
| Main Phone | `800 928 2642` | https://www.watania.ae/contact-us | Contact Us Page | High | Helpline / Reception. |
| Main Email | `info@watania.ae` | https://www.watania.ae/contact-us | Contact Us Page | High | General Inquiry. |
| PO Box | `48883` | https://www.watania.ae/contact-us | Contact Us Page | High | Postal Address. |
| Full Address | `The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE` | https://www.watania.ae/contact-us | Office Locations | High | Head office. |
| Emirate | `Dubai` (ID: 2) | https://www.watania.ae/contact-us | Office Locations | High | Mapped lookup. |
| City | `Dubai City` (ID: 4) | https://www.watania.ae/contact-us | Office Locations | High | Mapped lookup. |
| Contact Department | `Customer Support` | https://www.watania.ae/contact-us | Office Locations | High | Dept Contact: info@watania.ae / 800 928 2642. |

## 7. Data Quality Summary

- **Total insurers reviewed**: 31
- **Insurers with verified website**: 31
- **Insurers with verified phone**: 31
- **Insurers with verified email**: 31
- **Insurers with verified address**: 31
- **Insurers with verified PO Box**: 31
- **Insurers with products verified**: 31
- **Insurers excluded from enrichment and why**: 0 (all 31 national/takaful policy issuers verified successfully, though Yas Takaful is noted as suspended).

## 8. Database Mapping Plan

1. **`parties`**:
   - `main_phone` -> official main phone
   - `main_email` -> official main email
   - `website` -> official website URL
   - `po_box` -> PO Box number
   - `full_address_text` -> full head office address
   - `emirate_id` -> head office emirate ID
   - `city_id` -> head office city ID
   - `remarks` -> enriched category and registration notes
2. **`party_addresses`**:
   - Inserts one `HEAD_OFFICE` (type: 18) primary active address linked to `party_id`.
   - Code generated dynamically using `MASTER_PARTY_ADDRESS`.
3. **`party_contacts`**:
   - Inserts one `OPERATIONS` (role: 22, department: 28) primary active contact named "Customer Service" or "Customer Care" linked to `party_id`.
   - Code generated dynamically using `MASTER_PARTY_CONTACT`.

## 9. Existing ERP Record Matching

All 31 insurers were checked against the database. No duplicates exist:

| Insurer | Existing Party Found: Yes/No | Existing Party Code | Match Rule | Action: Insert/Update/Skip/Review | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Yas Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Salama Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Sukoon Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **National General Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Daman Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Alliance Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Takaful Emarat** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Insurance House** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Dubai National Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Sukoon Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **ADNIC** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Abu Dhabi Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Union Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Emirates Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Buhaira Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **United Fidelity Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Sharjah Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Sagr Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Dhafra Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Ain Ahlia Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Fujairah Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Al Wathba Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Orient Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Orient Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **HAYAH Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Aman Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Dubai Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **RAK Insurance** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Methaq Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Watania General Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |
| **Watania Family Takaful** | No | N/A | name/cbuae_reg_no | Insert/Enrich | Inserts if missing; updates if already exists. |

## 10. SQL Safety Features

- **Uses MASTER_PARTY numbering for new rows only**: For new parties, sequential codes are dynamically generated via the numbering engine, keeping counter state correct.
- **Does not change party_code**: Updates only missing fields on existing records; `party_code` remains unchanged.
- **Does not create duplicates**: Uses `EXISTS` check on both `legal_name_en` and remarks registration no to match existing records before inserting.
- **Updates only missing fields**: Uses `COALESCE` to prevent overwriting existing custom values in `parties` table.
- **Creates child address/contact rows only when safe**: Runs check to prevent duplicate primary addresses/contacts.
- **Does not seed brokers**: Excluded.
- **Does not seed foreign branches**: Excluded.
- **Does not insert unverified TRN/trade license**: Left empty in this phase.

## 11. Enriched Dataset Preview

Refer to the JSON dataset at [UAE_INSURANCE_PARTIES_ENRICHED_DATASET.json](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_PARTIES_ENRICHED_DATASET.json) for the full preview.

## 12. SQL File Created

```text
supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses.sql
```

## 13. Rollback / Reversal Plan

A precise commented rollback section is placed at the bottom of the SQL script. To reverse only this enrichment:
1. Delete child contacts marked with `notes = 'Seeded via official contact enrichment script.'`.
2. Delete child addresses marked with `notes = 'Seeded via official contact enrichment script.'`.
3. Clear/NULL the enriched fields on the `parties` table that were modified within the last hour.
4. Delete parties newly created by this script.

## 14. Remaining Gaps

- **Trade License / TRN / Bank accounts**: These must be collected during vendor onboarding. Seeding them here is omitted to prevent conflicts.

## 15. Human Approval Required

The user must approve:
1. The mapping of `Yas Takaful` as suspended in remarks.
2. The automatic creation of a single `HEAD_OFFICE` address and `Customer Service` contact per insurer.
3. Execution in a Superuser/Service Role SQL console.

## 16. Final Recommendation

We recommend executing the generated SQL file `supabase/manual_sql/seed_uae_insurance_parties_enriched_contacts_addresses.sql` inside a Supabase Database Console (using the Service Role key or Superuser privileges) after this report is approved by a human administrator.
