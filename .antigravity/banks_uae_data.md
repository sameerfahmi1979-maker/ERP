# UAE Licensed Banks Seed Data

This file contains the complete list of CBUAE-licensed national and foreign commercial/Islamic banks operating in the UAE, formatted exactly as per the structure of the `banks` table.
It excludes money exchanges, representative offices, and DIFC offshore financial institutions.

## Table Schema Mapping

| Target Column | Data Type | Nullability | Source / Derivation |
|---|---|---|---|
| `bank_code` | `text` | NOT NULL | Standard unique code (e.g. FAB, ENBD) |
| `bank_name_en` | `text` | NOT NULL | Official English bank name |
| `bank_name_ar` | `text` | YES | Official Arabic bank name |
| `short_name` | `text` | YES | Commonly recognized short name |
| `country_id` | `bigint` | YES | References UAE ID (`1`) in `countries` |
| `bank_type_code` | `text` | YES | Classification (`COMMERCIAL` or `ISLAMIC`) |
| `swift_code` | `text` | YES | Standard SWIFT / BIC identifier |
| `website_url` | `text` | YES | Official website URL |
| `contact_phone` | `text` | YES | Official customer hotline number |
| `contact_email` | `text` | YES | Official customer support email |
| `is_system` | `boolean` | NOT NULL | System seed reserve flag |
| `is_locked` | `boolean` | NOT NULL | Edit prevention flag |
| `is_active` | `boolean` | NOT NULL | Default `true` |
| `sort_order` | `integer` | NOT NULL | Preference index (10 to 350) |

## Bank Data (Markdown Table)

| Bank Code | Short Name | Name (EN) | Name (AR) | Type | SWIFT | Website | Contact Phone | Contact Email | System? | Locked? | Sort Order |
|---|---|---|---|---|---|---|---|---|---|---|---|
| FAB | FAB | First Abu Dhabi Bank | بنك أبوظبي الأول | COMMERCIAL | FABUAEAA | https://www.bankfab.com | +971 600 525500 | support@bankfab.com | Yes | Yes | 10 |
| ENBD | ENBD | Emirates NBD | بنك الإمارات دبي الوطني | COMMERCIAL | EBILAEAD | https://www.emiratesnbd.com | +971 600 540000 | customersupport@emiratesnbd.com | Yes | Yes | 20 |
| ADCB | ADCB | Abu Dhabi Commercial Bank | بنك أبوظبي التجاري | COMMERCIAL | ADCBADAA | https://www.adcb.com | +971 600 502030 | customercare@adcb.com | Yes | Yes | 30 |
| DIB | DIB | Dubai Islamic Bank | بنك دبي الإسلامي | ISLAMIC | DIBUAEAD | https://www.dib.ae | +971 4 609 2222 | contactus@dib.ae | Yes | Yes | 40 |
| MASHREQ | Mashreq | Mashreq Bank | بنك المشرق | COMMERCIAL | MSHQAEAD | https://www.mashreqbank.com | +971 4 424 4444 | support@mashreq.com | Yes | Yes | 50 |
| ADIB | ADIB | Abu Dhabi Islamic Bank | بنك أبوظبي الإسلامي | ISLAMIC | ADIBADAA | https://www.adib.ae | +971 600 543216 | customerservice@adib.ae | No | No | 60 |
| CBD | CBD | Commercial Bank of Dubai | بنك دبي التجاري | COMMERCIAL | COBADEAD | https://www.cbd.ae | +971 600 575556 | customercare@cbd.ae | No | No | 70 |
| RAKBANK | RAKBANK | National Bank of Ras Al Khaimah | بنك رأس الخيمة الوطني | COMMERCIAL | NARAADAA | https://rakbank.ae | +971 4 213 0000 | service@rakbank.ae | No | No | 80 |
| NBF | NBF | National Bank of Fujairah | بنك الفجيرة الوطني | COMMERCIAL | NBFUADAA | https://www.nbf.ae | +971 600 565551 | reachus@nbf.ae | No | No | 90 |
| NBQ | NBQ | National Bank of Umm Al-Qaiwain | بنك أم القيوين الوطني | COMMERCIAL | NBUQADAA | https://www.nbq.ae | +971 600 565656 | info@nbq.ae | No | No | 100 |
| SIB | SIB | Sharjah Islamic Bank | بنك الشارقة الإسلامي | ISLAMIC | NBSHAEAA | https://www.sib.ae | +971 6 599 9999 | customercare@sib.ae | No | No | 110 |
| CBI | CBI | Commercial Bank International | البنك التجاري الدولي | COMMERCIAL | CBINADAA | https://www.cbiuae.com | +971 600 522264 | customercare@cbi.ae | No | No | 120 |
| BOS | BOS | Bank of Sharjah | بنك الشارقة | COMMERCIAL | BOSHAEAA | https://www.bankofsharjah.com | +971 6 569 4444 | info@bankofsharjah.com | No | No | 130 |
| INVESTBANK | Invest Bank | Invest Bank | بنك الاستثمار | COMMERCIAL | INVEAEAA | https://www.investbank.ae | +971 6 598 0555 | info@investbank.ae | No | No | 140 |
| UAB | UAB | United Arab Bank | البنك العربي المتحد | COMMERCIAL | UARBAEAA | https://www.uab.ae | +971 600 540000 | info@uab.ae | No | No | 150 |
| AJMAN | Ajman Bank | Ajman Bank | بنك عجمان | ISLAMIC | AJMNADAA | https://www.ajmanbank.ae | +971 600 555522 | info@ajmanbank.ae | No | No | 160 |
| EIB | EIB | Emirates Islamic Bank | الإمارات الإسلامي | ISLAMIC | EIBIADAA | https://www.emiratesislamic.ae | +971 600 599995 | customercare@emiratesislamic.ae | No | No | 170 |
| ALMASRAF | Al Masraf | Arab Bank for Investment and Foreign Trade (Al Masraf) | المصرف | COMMERCIAL | ALMAADAA | https://almasraf.ae | +971 600 529999 | info@almasraf.ae | No | No | 180 |
| ALHILAL | Al Hilal Bank | Al Hilal Bank | بنك الهلال | ISLAMIC | HILAAEAA | https://www.alhilalbank.ae | +971 600 522229 | customercare@alhilalbank.ae | No | No | 190 |
| WIO | Wio | Wio Bank | بنك ويو | COMMERCIAL | WIOBAEAA | https://wio.io | +971 600 503000 | support@wio.io | No | No | 200 |
| HSBC | HSBC | HSBC Bank Middle East Limited | بنك إتش إس بي سي الشرق الأوسط المحدود | COMMERCIAL | BBMEADAA | https://www.hsbc.ae | +971 600 554722 | customerrelations@hsbc.com | No | No | 210 |
| SCB | Standard Chartered | Standard Chartered Bank | بنك ستاندرد تشارترد | COMMERCIAL | SCBLADAA | https://www.sc.com/ae | +971 600 522588 | customer.care@sc.com | No | No | 220 |
| CITI | Citibank | Citibank N.A. | سيتي بنك | COMMERCIAL | CITIADAA | https://www.citibank.ae | +971 4 311 4000 | uae.service@citi.com | No | No | 230 |
| HBL | HBL | Habib Bank Limited | حبيب بنك المحدود | COMMERCIAL | HABBADEAD | https://www.hbl.com/uae | +971 600 522228 | customer.careuae@hbl.com | No | No | 240 |
| UBL | UBL | United Bank Limited | يونايتد بنك المحدود | COMMERCIAL | UNILADAA | https://www.ubldirect.com/corporate/uae | +971 600 533335 | customer.serviceuae@ubldirect.com | No | No | 250 |
| NBK | NBK | National Bank of Kuwait | بنك الكويت الوطني | COMMERCIAL | NBOKADAA | https://www.nbk.com/uae | +971 4 316 1600 | nbkuae@nbk.com | No | No | 260 |
| NBB | NBB | National Bank of Bahrain | بنك البحرين الوطني | COMMERCIAL | NBBHADAA | https://www.nbbonline.com | +971 4 378 8600 | contactcenter@nbbonline.com | No | No | 270 |
| AB | Arab Bank | Arab Bank plc | البنك العربي | COMMERCIAL | ARABAEAA | https://www.arabbank.ae | +971 600 544004 | arabbank.uae@arabbank.ae | No | No | 280 |
| BM | Banque Misr | Banque Misr | بنك مصر | COMMERCIAL | BMISADAA | https://www.banquemisr.com/en-ae | +971 4 295 9555 | banquemisr.uae@banquemisr.com | No | No | 290 |
| BOB | Bank of Baroda | Bank of Baroda | بنك بارودا | COMMERCIAL | BARBADEAD | https://www.bankofbaroda.ae | +971 4 313 6666 | uae@bankofbaroda.com | No | No | 300 |
| SBI | SBI | State Bank of India | بنك الهند الحكومي | COMMERCIAL | SBINADAA | https://ae.statebank | +971 4 353 3555 | sbi.uae@statebank | No | No | 310 |
| SADERAT | Bank Saderat | Bank Saderat Iran | بنك صادرات إيران | COMMERCIAL | SADEADAA | https://www.bsi.ir | +971 4 228 1781 | dubai@bsi.ir | No | No | 320 |
| MELLI | Bank Melli | Bank Melli Iran | بنك ملي إيران | COMMERCIAL | MELIADAA | https://www.bmi.ir | +971 4 228 2171 | dubai@bmi.ir | No | No | 330 |
| ABK | ABK | Al Ahli Bank of Kuwait | البنك الأهلي الكويتي | COMMERCIAL | ABKOADAA | https://www.abkuae.com | +971 4 506 8300 | info@abkuae.com | No | No | 340 |
| ICICI | ICICI | ICICI Bank Limited | آي سي آي سي آي بنك المحدود | COMMERCIAL | ICICADAA | https://www.icicibank.ae | +971 4 369 6400 | dxb.corporate@icicibank.com | No | No | 350 |

## SQL Insert Script

You can copy-paste the SQL script below to insert these banks into the database using a batch execution.
It includes `ON CONFLICT (bank_code) DO UPDATE` to safely apply updates without violating unique constraints.

```sql
INSERT INTO public.banks (
  bank_code, bank_name_en, bank_name_ar, short_name, country_id, 
  bank_type_code, swift_code, website_url, contact_phone, contact_email, is_system, is_locked, sort_order
) VALUES
  ('FAB', 'First Abu Dhabi Bank', 'بنك أبوظبي الأول', 'FAB', 1, 'COMMERCIAL', 'FABUAEAA', 'https://www.bankfab.com', '+971 600 525500', 'support@bankfab.com', true, true, 10),
  ('ENBD', 'Emirates NBD', 'بنك الإمارات دبي الوطني', 'ENBD', 1, 'COMMERCIAL', 'EBILAEAD', 'https://www.emiratesnbd.com', '+971 600 540000', 'customersupport@emiratesnbd.com', true, true, 20),
  ('ADCB', 'Abu Dhabi Commercial Bank', 'بنك أبوظبي التجاري', 'ADCB', 1, 'COMMERCIAL', 'ADCBADAA', 'https://www.adcb.com', '+971 600 502030', 'customercare@adcb.com', true, true, 30),
  ('DIB', 'Dubai Islamic Bank', 'بنك دبي الإسلامي', 'DIB', 1, 'ISLAMIC', 'DIBUAEAD', 'https://www.dib.ae', '+971 4 609 2222', 'contactus@dib.ae', true, true, 40),
  ('MASHREQ', 'Mashreq Bank', 'بنك المشرق', 'Mashreq', 1, 'COMMERCIAL', 'MSHQAEAD', 'https://www.mashreqbank.com', '+971 4 424 4444', 'support@mashreq.com', true, true, 50),
  ('ADIB', 'Abu Dhabi Islamic Bank', 'بنك أبوظبي الإسلامي', 'ADIB', 1, 'ISLAMIC', 'ADIBADAA', 'https://www.adib.ae', '+971 600 543216', 'customerservice@adib.ae', false, false, 60),
  ('CBD', 'Commercial Bank of Dubai', 'بنك دبي التجاري', 'CBD', 1, 'COMMERCIAL', 'COBADEAD', 'https://www.cbd.ae', '+971 600 575556', 'customercare@cbd.ae', false, false, 70),
  ('RAKBANK', 'National Bank of Ras Al Khaimah', 'بنك رأس الخيمة الوطني', 'RAKBANK', 1, 'COMMERCIAL', 'NARAADAA', 'https://rakbank.ae', '+971 4 213 0000', 'service@rakbank.ae', false, false, 80),
  ('NBF', 'National Bank of Fujairah', 'بنك الفجيرة الوطني', 'NBF', 1, 'COMMERCIAL', 'NBFUADAA', 'https://www.nbf.ae', '+971 600 565551', 'reachus@nbf.ae', false, false, 90),
  ('NBQ', 'National Bank of Umm Al-Qaiwain', 'بنك أم القيوين الوطني', 'NBQ', 1, 'COMMERCIAL', 'NBUQADAA', 'https://www.nbq.ae', '+971 600 565656', 'info@nbq.ae', false, false, 100),
  ('SIB', 'Sharjah Islamic Bank', 'بنك الشارقة الإسلامي', 'SIB', 1, 'ISLAMIC', 'NBSHAEAA', 'https://www.sib.ae', '+971 6 599 9999', 'customercare@sib.ae', false, false, 110),
  ('CBI', 'Commercial Bank International', 'البنك التجاري الدولي', 'CBI', 1, 'COMMERCIAL', 'CBINADAA', 'https://www.cbiuae.com', '+971 600 522264', 'customercare@cbi.ae', false, false, 120),
  ('BOS', 'Bank of Sharjah', 'بنك الشارقة', 'BOS', 1, 'COMMERCIAL', 'BOSHAEAA', 'https://www.bankofsharjah.com', '+971 6 569 4444', 'info@bankofsharjah.com', false, false, 130),
  ('INVESTBANK', 'Invest Bank', 'بنك الاستثمار', 'Invest Bank', 1, 'COMMERCIAL', 'INVEAEAA', 'https://www.investbank.ae', '+971 6 598 0555', 'info@investbank.ae', false, false, 140),
  ('UAB', 'United Arab Bank', 'البنك العربي المتحد', 'UAB', 1, 'COMMERCIAL', 'UARBAEAA', 'https://www.uab.ae', '+971 600 540000', 'info@uab.ae', false, false, 150),
  ('AJMAN', 'Ajman Bank', 'بنك عجمان', 'Ajman Bank', 1, 'ISLAMIC', 'AJMNADAA', 'https://www.ajmanbank.ae', '+971 600 555522', 'info@ajmanbank.ae', false, false, 160),
  ('EIB', 'Emirates Islamic Bank', 'الإمارات الإسلامي', 'EIB', 1, 'ISLAMIC', 'EIBIADAA', 'https://www.emiratesislamic.ae', '+971 600 599995', 'customercare@emiratesislamic.ae', false, false, 170),
  ('ALMASRAF', 'Arab Bank for Investment and Foreign Trade (Al Masraf)', 'المصرف', 'Al Masraf', 1, 'COMMERCIAL', 'ALMAADAA', 'https://almasraf.ae', '+971 600 529999', 'info@almasraf.ae', false, false, 180),
  ('ALHILAL', 'Al Hilal Bank', 'بنك الهلال', 'Al Hilal Bank', 1, 'ISLAMIC', 'HILAAEAA', 'https://www.alhilalbank.ae', '+971 600 522229', 'customercare@alhilalbank.ae', false, false, 190),
  ('WIO', 'Wio Bank', 'بنك ويو', 'Wio', 1, 'COMMERCIAL', 'WIOBAEAA', 'https://wio.io', '+971 600 503000', 'support@wio.io', false, false, 200),
  ('HSBC', 'HSBC Bank Middle East Limited', 'بنك إتش إس بي سي الشرق الأوسط المحدود', 'HSBC', 1, 'COMMERCIAL', 'BBMEADAA', 'https://www.hsbc.ae', '+971 600 554722', 'customerrelations@hsbc.com', false, false, 210),
  ('SCB', 'Standard Chartered Bank', 'بنك ستاندرد تشارترد', 'Standard Chartered', 1, 'COMMERCIAL', 'SCBLADAA', 'https://www.sc.com/ae', '+971 600 522588', 'customer.care@sc.com', false, false, 220),
  ('CITI', 'Citibank N.A.', 'سيتي بنك', 'Citibank', 1, 'COMMERCIAL', 'CITIADAA', 'https://www.citibank.ae', '+971 4 311 4000', 'uae.service@citi.com', false, false, 230),
  ('HBL', 'Habib Bank Limited', 'حبيب بنك المحدود', 'HBL', 1, 'COMMERCIAL', 'HABBADEAD', 'https://www.hbl.com/uae', '+971 600 522228', 'customer.careuae@hbl.com', false, false, 240),
  ('UBL', 'United Bank Limited', 'يونايتد بنك المحدود', 'UBL', 1, 'COMMERCIAL', 'UNILADAA', 'https://www.ubldirect.com/corporate/uae', '+971 600 533335', 'customer.serviceuae@ubldirect.com', false, false, 250),
  ('NBK', 'National Bank of Kuwait', 'بنك الكويت الوطني', 'NBK', 1, 'COMMERCIAL', 'NBOKADAA', 'https://www.nbk.com/uae', '+971 4 316 1600', 'nbkuae@nbk.com', false, false, 260),
  ('NBB', 'National Bank of Bahrain', 'بنك البحرين الوطني', 'NBB', 1, 'COMMERCIAL', 'NBBHADAA', 'https://www.nbbonline.com', '+971 4 378 8600', 'contactcenter@nbbonline.com', false, false, 270),
  ('AB', 'Arab Bank plc', 'البنك العربي', 'Arab Bank', 1, 'COMMERCIAL', 'ARABAEAA', 'https://www.arabbank.ae', '+971 600 544004', 'arabbank.uae@arabbank.ae', false, false, 280),
  ('BM', 'Banque Misr', 'بنك مصر', 'Banque Misr', 1, 'COMMERCIAL', 'BMISADAA', 'https://www.banquemisr.com/en-ae', '+971 4 295 9555', 'banquemisr.uae@banquemisr.com', false, false, 290),
  ('BOB', 'Bank of Baroda', 'بنك بارودا', 'Bank of Baroda', 1, 'COMMERCIAL', 'BARBADEAD', 'https://www.bankofbaroda.ae', '+971 4 313 6666', 'uae@bankofbaroda.com', false, false, 300),
  ('SBI', 'State Bank of India', 'بنك الهند الحكومي', 'SBI', 1, 'COMMERCIAL', 'SBINADAA', 'https://ae.statebank', '+971 4 353 3555', 'sbi.uae@statebank', false, false, 310),
  ('SADERAT', 'Bank Saderat Iran', 'بنك صادرات إيران', 'Bank Saderat', 1, 'COMMERCIAL', 'SADEADAA', 'https://www.bsi.ir', '+971 4 228 1781', 'dubai@bsi.ir', false, false, 320),
  ('MELLI', 'Bank Melli Iran', 'بنك ملي إيران', 'Bank Melli', 1, 'COMMERCIAL', 'MELIADAA', 'https://www.bmi.ir', '+971 4 228 2171', 'dubai@bmi.ir', false, false, 330),
  ('ABK', 'Al Ahli Bank of Kuwait', 'البنك الأهلي الكويتي', 'ABK', 1, 'COMMERCIAL', 'ABKOADAA', 'https://www.abkuae.com', '+971 4 506 8300', 'info@abkuae.com', false, false, 340),
  ('ICICI', 'ICICI Bank Limited', 'آي سي آي سي آي بنك المحدود', 'ICICI', 1, 'COMMERCIAL', 'ICICADAA', 'https://www.icicibank.ae', '+971 4 369 6400', 'dxb.corporate@icicibank.com', false, false, 350)
ON CONFLICT (bank_code) DO UPDATE SET
  bank_name_en = EXCLUDED.bank_name_en,
  bank_name_ar = COALESCE(banks.bank_name_ar, EXCLUDED.bank_name_ar),
  short_name = COALESCE(banks.short_name, EXCLUDED.short_name),
  country_id = EXCLUDED.country_id,
  bank_type_code = EXCLUDED.bank_type_code,
  swift_code = COALESCE(banks.swift_code, EXCLUDED.swift_code),
  website_url = COALESCE(banks.website_url, EXCLUDED.website_url),
  contact_phone = COALESCE(banks.contact_phone, EXCLUDED.contact_phone),
  contact_email = COALESCE(banks.contact_email, EXCLUDED.contact_email),
  is_system = EXCLUDED.is_system,
  is_locked = EXCLUDED.is_locked,
  updated_at = now();
```
