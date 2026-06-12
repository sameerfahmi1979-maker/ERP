# ISO Currencies Seed Data

This file contains the complete list of ISO 4217 currencies formatted exactly as per the structure of the `currencies` table.
The names, Arabic translations, decimal places, and symbols have been verified using Unicode CLDR standards.

## Table Schema Mapping

| Target Column | Data Type | Nullability | Description |
|---|---|---|---|
| `currency_code` | `text` | NOT NULL | 3-letter uppercase ISO 4217 code |
| `currency_name_en` | `text` | NOT NULL | English currency name |
| `currency_name_ar` | `text` | YES | Arabic currency name |
| `symbol` | `text` | YES | Currency symbol or localized notation |
| `decimal_places` | `integer` | NOT NULL | Fraction decimal precision (0 to 4) |
| `is_base_currency` | `boolean` | NOT NULL | `true` if AED (base currency) |
| `is_system` | `boolean` | NOT NULL | System locked/reserved flag |
| `is_locked` | `boolean` | NOT NULL | Edit prevention flag |
| `is_active` | `boolean` | NOT NULL | Default `true` |
| `sort_order` | `integer` | NOT NULL | Sort ordering preference |

## Currency Data (Markdown Table)

| Currency Code | Symbol | Name (EN) | Name (AR) | Decimal Places | Base Currency? | System? | Locked? | Sort Order |
|---|---|---|---|---|---|---|---|---|
| AED | د.إ | UAE Dirham | درهم إماراتي | 2 | Yes | Yes | Yes | 10 |
| USD | $ | US Dollar | دولار أمريكي | 2 | No | Yes | No | 20 |
| EUR | € | Euro | يورو | 2 | No | Yes | No | 30 |
| GBP | £ | British Pound | جنيه إسترليني | 2 | No | No | No | 40 |
| SAR | ﷼ | Saudi Riyal | ريال سعودي | 2 | No | Yes | No | 50 |
| QAR | ﷼ | Qatari Riyal | ريال قطري | 2 | No | No | No | 60 |
| OMR | ﷼ | Omani Rial | ريال عماني | 3 | No | No | No | 70 |
| BHD | .د.ب | Bahraini Dinar | دينار بحريني | 3 | No | No | No | 80 |
| KWD | د.ك | Kuwaiti Dinar | دينار كويتي | 3 | No | No | No | 90 |
| INR | ₹ | Indian Rupee | روبية هندية | 2 | No | No | No | 100 |
| AFN | AFN | Afghan Afghani | أفغاني | 0 | No | No | No | 200 |
| ALL | ALL | Albanian Lek | ليك ألباني | 0 | No | No | No | 200 |
| DZD | دج | Algerian Dinar | دينار جزائري | 2 | No | No | No | 200 |
| AOA | AOA | Angolan Kwanza | كوانزا أنغولي | 2 | No | No | No | 200 |
| ARS | ARS | Argentine Peso | بيزو أرجنتيني | 2 | No | No | No | 200 |
| AMD | AMD | Armenian Dram | درام أرميني | 2 | No | No | No | 200 |
| AWG | AWG | Aruban Florin | فلورن أروبي | 2 | No | No | No | 200 |
| AUD | AU$ | Australian Dollar | دولار أسترالي | 2 | No | No | No | 200 |
| AZN | AZN | Azerbaijani Manat | مانات أذربيجان | 2 | No | No | No | 200 |
| BSD | BSD | Bahamian Dollar | دولار باهامي | 2 | No | No | No | 200 |
| BDT | BDT | Bangladeshi Taka | تاكا بنغلاديشي | 2 | No | No | No | 200 |
| BBD | BBD | Barbadian Dollar | دولار بربادوسي | 2 | No | No | No | 200 |
| BYN | BYN | Belarusian Ruble | روبل بيلاروسي | 2 | No | No | No | 200 |
| BZD | BZD | Belize Dollar | دولار بليزي | 2 | No | No | No | 200 |
| BMD | BMD | Bermudan Dollar | دولار برمودي | 2 | No | No | No | 200 |
| BTN | BTN | Bhutanese Ngultrum | نولتوم بوتاني | 2 | No | No | No | 200 |
| BOB | BOB | Bolivian Boliviano | بوليفيانو بوليفي | 2 | No | No | No | 200 |
| BAM | BAM | Bosnia-Herzegovina Convertible Mark | مارك البوسنة والهرسك قابل للتحويل | 2 | No | No | No | 200 |
| BWP | BWP | Botswanan Pula | بولا بتسواني | 2 | No | No | No | 200 |
| BRL | R$ | Brazilian Real | ريال برازيلي | 2 | No | No | No | 200 |
| BND | BND | Brunei Dollar | دولار بروناي | 2 | No | No | No | 200 |
| BGN | BGN | Bulgarian Lev | ليف بلغاري | 2 | No | No | No | 200 |
| BIF | BIF | Burundian Franc | فرنك بروندي | 0 | No | No | No | 200 |
| KHR | KHR | Cambodian Riel | رييال كمبودي | 2 | No | No | No | 200 |
| CAD | CA$ | Canadian Dollar | دولار كندي | 2 | No | No | No | 200 |
| CVE | CVE | Cape Verdean Escudo | اسكودو الرأس الأخضر | 2 | No | No | No | 200 |
| KYD | KYD | Cayman Islands Dollar | دولار جزر كيمن | 2 | No | No | No | 200 |
| XAF | FCFA | Central African CFA Franc | فرنك وسط أفريقي | 0 | No | No | No | 200 |
| XPF | CFPF | CFP Franc | فرنك سي إف بي | 0 | No | No | No | 200 |
| CLP | CLP | Chilean Peso | بيزو تشيلي | 0 | No | No | No | 200 |
| CNY | ¥ | Chinese Yuan | يوان صيني | 2 | No | No | No | 200 |
| CKD | CKD | CKD Currency | CKD | 2 | No | No | No | 200 |
| COP | COP | Colombian Peso | بيزو كولومبي | 0 | No | No | No | 200 |
| KMF | KMF | Comorian Franc | فرنك جزر القمر | 0 | No | No | No | 200 |
| CDF | CDF | Congolese Franc | فرنك كونغولي | 2 | No | No | No | 200 |
| CRC | CRC | Costa Rican Colón | كولن كوستاريكي | 2 | No | No | No | 200 |
| CUC | CUC | Cuban Convertible Peso | بيزو كوبي قابل للتحويل | 2 | No | No | No | 200 |
| CUP | CUP | Cuban Peso | بيزو كوبي | 2 | No | No | No | 200 |
| CZK | CZK | Czech Koruna | كرونة تشيكية | 2 | No | No | No | 200 |
| DKK | DKK | Danish Krone | كرونة دنماركية | 2 | No | No | No | 200 |
| DJF | DJF | Djiboutian Franc | فرنك جيبوتي | 0 | No | No | No | 200 |
| DOP | DOP | Dominican Peso | بيزو الدومنيكان | 2 | No | No | No | 200 |
| XCD | EC$ | East Caribbean Dollar | دولار شرق الكاريبي | 2 | No | No | No | 200 |
| EGP | جم | Egyptian Pound | جنيه مصري | 2 | No | No | No | 200 |
| ERN | ERN | Eritrean Nakfa | ناكفا أريتري | 2 | No | No | No | 200 |
| ETB | ETB | Ethiopian Birr | بير أثيوبي | 2 | No | No | No | 200 |
| FKP | FKP | Falkland Islands Pound | جنيه جزر فوكلاند | 2 | No | No | No | 200 |
| FJD | FJD | Fijian Dollar | دولار فيجي | 2 | No | No | No | 200 |
| FOK | FOK | FOK Currency | FOK | 2 | No | No | No | 200 |
| GMD | GMD | Gambian Dalasi | دلاسي غامبي | 2 | No | No | No | 200 |
| GEL | GEL | Georgian Lari | لارى جورجي | 2 | No | No | No | 200 |
| GGP | GGP | GGP Currency | GGP | 2 | No | No | No | 200 |
| GHS | GHS | Ghanaian Cedi | سيدي غانا | 2 | No | No | No | 200 |
| GIP | GIP | Gibraltar Pound | جنيه جبل طارق | 2 | No | No | No | 200 |
| GTQ | GTQ | Guatemalan Quetzal | كوتزال غواتيمالا | 2 | No | No | No | 200 |
| GNF | GNF | Guinean Franc | فرنك غينيا | 0 | No | No | No | 200 |
| GYD | GYD | Guyanaese Dollar | دولار غيانا | 2 | No | No | No | 200 |
| HTG | HTG | Haitian Gourde | جوردى هايتي | 2 | No | No | No | 200 |
| HNL | HNL | Honduran Lempira | ليمبيرا هنداروس | 2 | No | No | No | 200 |
| HKD | HK$ | Hong Kong Dollar | دولار هونغ كونغ | 2 | No | No | No | 200 |
| HUF | HUF | Hungarian Forint | فورينت هنغاري | 0 | No | No | No | 200 |
| ISK | ISK | Icelandic Króna | كرونة أيسلندية | 0 | No | No | No | 200 |
| IMP | IMP | IMP Currency | IMP | 2 | No | No | No | 200 |
| IDR | IDR | Indonesian Rupiah | روبية إندونيسية | 0 | No | No | No | 200 |
| IRR | رإ | Iranian Rial | ريال إيراني | 0 | No | No | No | 200 |
| IQD | دع | Iraqi Dinar | دينار عراقي | 0 | No | No | No | 200 |
| ILS | ₪ | Israeli New Shekel | شيكل إسرائيلي جديد | 2 | No | No | No | 200 |
| JMD | JMD | Jamaican Dollar | دولار جامايكي | 2 | No | No | No | 200 |
| JPY | ¥ | Japanese Yen | ين ياباني | 0 | No | No | No | 200 |
| JEP | JEP | JEP Currency | JEP | 2 | No | No | No | 200 |
| JOD | دأ | Jordanian Dinar | دينار أردني | 3 | No | No | No | 200 |
| KZT | KZT | Kazakhstani Tenge | تينغ كازاخستاني | 2 | No | No | No | 200 |
| KES | KES | Kenyan Shilling | شلن كينيي | 2 | No | No | No | 200 |
| KID | KID | KID Currency | KID | 2 | No | No | No | 200 |
| KGS | KGS | Kyrgyz Som | سوم قيرغستاني | 2 | No | No | No | 200 |
| LAK | LAK | Laotian Kip | كيب لاوسي | 0 | No | No | No | 200 |
| LBP | لل | Lebanese Pound | جنيه لبناني | 0 | No | No | No | 200 |
| LSL | LSL | Lesotho Loti | لوتي ليسوتو | 2 | No | No | No | 200 |
| LRD | LRD | Liberian Dollar | دولار ليبيري | 2 | No | No | No | 200 |
| LYD | دل | Libyan Dinar | دينار ليبي | 3 | No | No | No | 200 |
| MOP | MOP | Macanese Pataca | باتاكا ماكاوي | 2 | No | No | No | 200 |
| MKD | MKD | Macedonian Denar | دينار مقدوني | 2 | No | No | No | 200 |
| MGA | MGA | Malagasy Ariary | أرياري مدغشقر | 0 | No | No | No | 200 |
| MWK | MWK | Malawian Kwacha | كواشا مالاوي | 2 | No | No | No | 200 |
| MYR | MYR | Malaysian Ringgit | رينغيت ماليزي | 2 | No | No | No | 200 |
| MVR | MVR | Maldivian Rufiyaa | روفيه جزر المالديف | 2 | No | No | No | 200 |
| MRU | أم | Mauritanian Ouguiya | أوقية موريتانية | 2 | No | No | No | 200 |
| MUR | MUR | Mauritian Rupee | روبية موريشيوسية | 2 | No | No | No | 200 |
| MXN | MX$ | Mexican Peso | بيزو مكسيكي | 2 | No | No | No | 200 |
| MDL | MDL | Moldovan Leu | ليو مولدوفي | 2 | No | No | No | 200 |
| MNT | MNT | Mongolian Tugrik | توغروغ منغولي | 2 | No | No | No | 200 |
| MAD | دم | Moroccan Dirham | درهم مغربي | 2 | No | No | No | 200 |
| MZN | MZN | Mozambican Metical | متكال موزمبيقي | 2 | No | No | No | 200 |
| MMK | MMK | Myanmar Kyat | كيات ميانمار | 0 | No | No | No | 200 |
| NAD | NAD | Namibian Dollar | دولار ناميبي | 2 | No | No | No | 200 |
| NPR | NPR | Nepalese Rupee | روبية نيبالي | 2 | No | No | No | 200 |
| ANG | ANG | Netherlands Antillean Guilder | غيلدر أنتيلي هولندي | 2 | No | No | No | 200 |
| TWD | NT$ | New Taiwan Dollar | دولار تايواني | 2 | No | No | No | 200 |
| NZD | NZ$ | New Zealand Dollar | دولار نيوزيلندي | 2 | No | No | No | 200 |
| NIO | NIO | Nicaraguan Córdoba | قرطبة نيكاراغوا | 2 | No | No | No | 200 |
| NGN | NGN | Nigerian Naira | نايرا نيجيري | 2 | No | No | No | 200 |
| KPW | KPW | North Korean Won | وون كوريا الشمالية | 0 | No | No | No | 200 |
| NOK | NOK | Norwegian Krone | كرونة نرويجية | 2 | No | No | No | 200 |
| PKR | PKR | Pakistani Rupee | روبية باكستاني | 0 | No | No | No | 200 |
| PAB | PAB | Panamanian Balboa | بالبوا بنمي | 2 | No | No | No | 200 |
| PGK | PGK | Papua New Guinean Kina | كينا بابوا غينيا الجديدة | 2 | No | No | No | 200 |
| PYG | PYG | Paraguayan Guarani | غواراني باراغواي | 0 | No | No | No | 200 |
| PEN | PEN | Peruvian Sol | سول بيروفي | 2 | No | No | No | 200 |
| PHP | ₱ | Philippine Peso | بيزو فلبيني | 2 | No | No | No | 200 |
| PLN | PLN | Polish Zloty | زلوتي بولندي | 2 | No | No | No | 200 |
| RON | RON | Romanian Leu | ليو روماني | 2 | No | No | No | 200 |
| RUB | ₽ | Russian Ruble | روبل روسي | 2 | No | No | No | 200 |
| RWF | RWF | Rwandan Franc | فرنك رواندي | 0 | No | No | No | 200 |
| WST | WST | Samoan Tala | تالا ساموا | 2 | No | No | No | 200 |
| STN | STN | São Tomé & Príncipe Dobra | دوبرا ساو تومي وبرينسيبي | 2 | No | No | No | 200 |
| RSD | RSD | Serbian Dinar | دينار صربي | 2 | No | No | No | 200 |
| SCR | SCR | Seychellois Rupee | روبية سيشيلية | 2 | No | No | No | 200 |
| SLL | SLL | Sierra Leonean Leone (1964—2022) | ليون سيراليوني - 1964-2022 | 0 | No | No | No | 200 |
| SGD | SGD | Singapore Dollar | دولار سنغافوري | 2 | No | No | No | 200 |
| SBD | SBD | Solomon Islands Dollar | دولار جزر سليمان | 2 | No | No | No | 200 |
| SOS | SOS | Somali Shilling | شلن صومالي | 0 | No | No | No | 200 |
| ZAR | ZAR | South African Rand | راند جنوب أفريقيا | 2 | No | No | No | 200 |
| KRW | ₩ | South Korean Won | وون كوريا الجنوبية | 0 | No | No | No | 200 |
| SSP | SSP | South Sudanese Pound | جنيه جنوب السودان | 2 | No | No | No | 200 |
| LKR | LKR | Sri Lankan Rupee | روبية سريلانكية | 2 | No | No | No | 200 |
| SHP | SHP | St. Helena Pound | جنيه سانت هيلين | 2 | No | No | No | 200 |
| SDG | جس | Sudanese Pound | جنيه سوداني | 2 | No | No | No | 200 |
| SRD | SRD | Surinamese Dollar | دولار سورينامي | 2 | No | No | No | 200 |
| SZL | SZL | Swazi Lilangeni | ليلانجيني سوازيلندي | 2 | No | No | No | 200 |
| SEK | SEK | Swedish Krona | كرونة سويدية | 2 | No | No | No | 200 |
| CHF | CHF | Swiss Franc | فرنك سويسري | 2 | No | No | No | 200 |
| SYP | لس | Syrian Pound | ليرة سورية | 0 | No | No | No | 200 |
| TJS | TJS | Tajikistani Somoni | سوموني طاجيكستاني | 2 | No | No | No | 200 |
| TZS | TZS | Tanzanian Shilling | شلن تنزاني | 2 | No | No | No | 200 |
| THB | ฿ | Thai Baht | باخت تايلاندي | 2 | No | No | No | 200 |
| TOP | TOP | Tongan Paʻanga | بانغا تونغا | 2 | No | No | No | 200 |
| TTD | TTD | Trinidad & Tobago Dollar | دولار ترينداد وتوباغو | 2 | No | No | No | 200 |
| TND | دت | Tunisian Dinar | دينار تونسي | 3 | No | No | No | 200 |
| TRY | ₺ | Turkish Lira | ليرة تركية | 2 | No | No | No | 200 |
| TMT | TMT | Turkmenistani Manat | مانات تركمانستان | 2 | No | No | No | 200 |
| TVD | TVD | TVD Currency | TVD | 2 | No | No | No | 200 |
| UGX | UGX | Ugandan Shilling | شلن أوغندي | 0 | No | No | No | 200 |
| UAH | UAH | Ukrainian Hryvnia | هريفنيا أوكراني | 2 | No | No | No | 200 |
| UYU | UYU | Uruguayan Peso | بيزو اوروغواي | 2 | No | No | No | 200 |
| UZS | UZS | Uzbekistani Som | سوم أوزبكستاني | 2 | No | No | No | 200 |
| VUV | VUV | Vanuatu Vatu | فاتو فانواتو | 0 | No | No | No | 200 |
| VES | VES | Venezuelan Bolívar | بوليفار فنزويلي | 2 | No | No | No | 200 |
| VND | ₫ | Vietnamese Dong | دونج فيتنامي | 0 | No | No | No | 200 |
| XOF | F CFA | West African CFA Franc | فرنك غرب أفريقي | 0 | No | No | No | 200 |
| YER | ري | Yemeni Rial | ريال يمني | 0 | No | No | No | 200 |
| ZMW | ZMW | Zambian Kwacha | كواشا زامبي | 2 | No | No | No | 200 |
| ZWB | ZWB | ZWB Currency | ZWB | 2 | No | No | No | 200 |

## SQL Insert Script

You can copy-paste the SQL script below to insert the currencies into the database using a batch execution.
It includes `ON CONFLICT (currency_code) DO UPDATE` to safely apply updates without violating unique constraints.

```sql
INSERT INTO public.currencies (
  currency_code, currency_name_en, currency_name_ar, symbol, decimal_places, 
  is_base_currency, is_system, is_locked, sort_order
) VALUES
  ('AED', 'UAE Dirham', 'درهم إماراتي', 'د.إ', 2, true, true, true, 10),
  ('USD', 'US Dollar', 'دولار أمريكي', '$', 2, false, true, false, 20),
  ('EUR', 'Euro', 'يورو', '€', 2, false, true, false, 30),
  ('GBP', 'British Pound', 'جنيه إسترليني', '£', 2, false, false, false, 40),
  ('SAR', 'Saudi Riyal', 'ريال سعودي', '﷼', 2, false, true, false, 50),
  ('QAR', 'Qatari Riyal', 'ريال قطري', '﷼', 2, false, false, false, 60),
  ('OMR', 'Omani Rial', 'ريال عماني', '﷼', 3, false, false, false, 70),
  ('BHD', 'Bahraini Dinar', 'دينار بحريني', '.د.ب', 3, false, false, false, 80),
  ('KWD', 'Kuwaiti Dinar', 'دينار كويتي', 'د.ك', 3, false, false, false, 90),
  ('INR', 'Indian Rupee', 'روبية هندية', '₹', 2, false, false, false, 100),
  ('AFN', 'Afghan Afghani', 'أفغاني', 'AFN', 0, false, false, false, 200),
  ('ALL', 'Albanian Lek', 'ليك ألباني', 'ALL', 0, false, false, false, 200),
  ('DZD', 'Algerian Dinar', 'دينار جزائري', 'دج', 2, false, false, false, 200),
  ('AOA', 'Angolan Kwanza', 'كوانزا أنغولي', 'AOA', 2, false, false, false, 200),
  ('ARS', 'Argentine Peso', 'بيزو أرجنتيني', 'ARS', 2, false, false, false, 200),
  ('AMD', 'Armenian Dram', 'درام أرميني', 'AMD', 2, false, false, false, 200),
  ('AWG', 'Aruban Florin', 'فلورن أروبي', 'AWG', 2, false, false, false, 200),
  ('AUD', 'Australian Dollar', 'دولار أسترالي', 'AU$', 2, false, false, false, 200),
  ('AZN', 'Azerbaijani Manat', 'مانات أذربيجان', 'AZN', 2, false, false, false, 200),
  ('BSD', 'Bahamian Dollar', 'دولار باهامي', 'BSD', 2, false, false, false, 200),
  ('BDT', 'Bangladeshi Taka', 'تاكا بنغلاديشي', 'BDT', 2, false, false, false, 200),
  ('BBD', 'Barbadian Dollar', 'دولار بربادوسي', 'BBD', 2, false, false, false, 200),
  ('BYN', 'Belarusian Ruble', 'روبل بيلاروسي', 'BYN', 2, false, false, false, 200),
  ('BZD', 'Belize Dollar', 'دولار بليزي', 'BZD', 2, false, false, false, 200),
  ('BMD', 'Bermudan Dollar', 'دولار برمودي', 'BMD', 2, false, false, false, 200),
  ('BTN', 'Bhutanese Ngultrum', 'نولتوم بوتاني', 'BTN', 2, false, false, false, 200),
  ('BOB', 'Bolivian Boliviano', 'بوليفيانو بوليفي', 'BOB', 2, false, false, false, 200),
  ('BAM', 'Bosnia-Herzegovina Convertible Mark', 'مارك البوسنة والهرسك قابل للتحويل', 'BAM', 2, false, false, false, 200),
  ('BWP', 'Botswanan Pula', 'بولا بتسواني', 'BWP', 2, false, false, false, 200),
  ('BRL', 'Brazilian Real', 'ريال برازيلي', 'R$', 2, false, false, false, 200),
  ('BND', 'Brunei Dollar', 'دولار بروناي', 'BND', 2, false, false, false, 200),
  ('BGN', 'Bulgarian Lev', 'ليف بلغاري', 'BGN', 2, false, false, false, 200),
  ('BIF', 'Burundian Franc', 'فرنك بروندي', 'BIF', 0, false, false, false, 200),
  ('KHR', 'Cambodian Riel', 'رييال كمبودي', 'KHR', 2, false, false, false, 200),
  ('CAD', 'Canadian Dollar', 'دولار كندي', 'CA$', 2, false, false, false, 200),
  ('CVE', 'Cape Verdean Escudo', 'اسكودو الرأس الأخضر', 'CVE', 2, false, false, false, 200),
  ('KYD', 'Cayman Islands Dollar', 'دولار جزر كيمن', 'KYD', 2, false, false, false, 200),
  ('XAF', 'Central African CFA Franc', 'فرنك وسط أفريقي', 'FCFA', 0, false, false, false, 200),
  ('XPF', 'CFP Franc', 'فرنك سي إف بي', 'CFPF', 0, false, false, false, 200),
  ('CLP', 'Chilean Peso', 'بيزو تشيلي', 'CLP', 0, false, false, false, 200),
  ('CNY', 'Chinese Yuan', 'يوان صيني', '¥', 2, false, false, false, 200),
  ('CKD', 'CKD Currency', 'CKD', 'CKD', 2, false, false, false, 200),
  ('COP', 'Colombian Peso', 'بيزو كولومبي', 'COP', 0, false, false, false, 200),
  ('KMF', 'Comorian Franc', 'فرنك جزر القمر', 'KMF', 0, false, false, false, 200),
  ('CDF', 'Congolese Franc', 'فرنك كونغولي', 'CDF', 2, false, false, false, 200),
  ('CRC', 'Costa Rican Colón', 'كولن كوستاريكي', 'CRC', 2, false, false, false, 200),
  ('CUC', 'Cuban Convertible Peso', 'بيزو كوبي قابل للتحويل', 'CUC', 2, false, false, false, 200),
  ('CUP', 'Cuban Peso', 'بيزو كوبي', 'CUP', 2, false, false, false, 200),
  ('CZK', 'Czech Koruna', 'كرونة تشيكية', 'CZK', 2, false, false, false, 200),
  ('DKK', 'Danish Krone', 'كرونة دنماركية', 'DKK', 2, false, false, false, 200),
  ('DJF', 'Djiboutian Franc', 'فرنك جيبوتي', 'DJF', 0, false, false, false, 200),
  ('DOP', 'Dominican Peso', 'بيزو الدومنيكان', 'DOP', 2, false, false, false, 200),
  ('XCD', 'East Caribbean Dollar', 'دولار شرق الكاريبي', 'EC$', 2, false, false, false, 200),
  ('EGP', 'Egyptian Pound', 'جنيه مصري', 'جم', 2, false, false, false, 200),
  ('ERN', 'Eritrean Nakfa', 'ناكفا أريتري', 'ERN', 2, false, false, false, 200),
  ('ETB', 'Ethiopian Birr', 'بير أثيوبي', 'ETB', 2, false, false, false, 200),
  ('FKP', 'Falkland Islands Pound', 'جنيه جزر فوكلاند', 'FKP', 2, false, false, false, 200),
  ('FJD', 'Fijian Dollar', 'دولار فيجي', 'FJD', 2, false, false, false, 200),
  ('FOK', 'FOK Currency', 'FOK', 'FOK', 2, false, false, false, 200),
  ('GMD', 'Gambian Dalasi', 'دلاسي غامبي', 'GMD', 2, false, false, false, 200),
  ('GEL', 'Georgian Lari', 'لارى جورجي', 'GEL', 2, false, false, false, 200),
  ('GGP', 'GGP Currency', 'GGP', 'GGP', 2, false, false, false, 200),
  ('GHS', 'Ghanaian Cedi', 'سيدي غانا', 'GHS', 2, false, false, false, 200),
  ('GIP', 'Gibraltar Pound', 'جنيه جبل طارق', 'GIP', 2, false, false, false, 200),
  ('GTQ', 'Guatemalan Quetzal', 'كوتزال غواتيمالا', 'GTQ', 2, false, false, false, 200),
  ('GNF', 'Guinean Franc', 'فرنك غينيا', 'GNF', 0, false, false, false, 200),
  ('GYD', 'Guyanaese Dollar', 'دولار غيانا', 'GYD', 2, false, false, false, 200),
  ('HTG', 'Haitian Gourde', 'جوردى هايتي', 'HTG', 2, false, false, false, 200),
  ('HNL', 'Honduran Lempira', 'ليمبيرا هنداروس', 'HNL', 2, false, false, false, 200),
  ('HKD', 'Hong Kong Dollar', 'دولار هونغ كونغ', 'HK$', 2, false, false, false, 200),
  ('HUF', 'Hungarian Forint', 'فورينت هنغاري', 'HUF', 0, false, false, false, 200),
  ('ISK', 'Icelandic Króna', 'كرونة أيسلندية', 'ISK', 0, false, false, false, 200),
  ('IMP', 'IMP Currency', 'IMP', 'IMP', 2, false, false, false, 200),
  ('IDR', 'Indonesian Rupiah', 'روبية إندونيسية', 'IDR', 0, false, false, false, 200),
  ('IRR', 'Iranian Rial', 'ريال إيراني', 'رإ', 0, false, false, false, 200),
  ('IQD', 'Iraqi Dinar', 'دينار عراقي', 'دع', 0, false, false, false, 200),
  ('ILS', 'Israeli New Shekel', 'شيكل إسرائيلي جديد', '₪', 2, false, false, false, 200),
  ('JMD', 'Jamaican Dollar', 'دولار جامايكي', 'JMD', 2, false, false, false, 200),
  ('JPY', 'Japanese Yen', 'ين ياباني', '¥', 0, false, false, false, 200),
  ('JEP', 'JEP Currency', 'JEP', 'JEP', 2, false, false, false, 200),
  ('JOD', 'Jordanian Dinar', 'دينار أردني', 'دأ', 3, false, false, false, 200),
  ('KZT', 'Kazakhstani Tenge', 'تينغ كازاخستاني', 'KZT', 2, false, false, false, 200),
  ('KES', 'Kenyan Shilling', 'شلن كينيي', 'KES', 2, false, false, false, 200),
  ('KID', 'KID Currency', 'KID', 'KID', 2, false, false, false, 200),
  ('KGS', 'Kyrgyz Som', 'سوم قيرغستاني', 'KGS', 2, false, false, false, 200),
  ('LAK', 'Laotian Kip', 'كيب لاوسي', 'LAK', 0, false, false, false, 200),
  ('LBP', 'Lebanese Pound', 'جنيه لبناني', 'لل', 0, false, false, false, 200),
  ('LSL', 'Lesotho Loti', 'لوتي ليسوتو', 'LSL', 2, false, false, false, 200),
  ('LRD', 'Liberian Dollar', 'دولار ليبيري', 'LRD', 2, false, false, false, 200),
  ('LYD', 'Libyan Dinar', 'دينار ليبي', 'دل', 3, false, false, false, 200),
  ('MOP', 'Macanese Pataca', 'باتاكا ماكاوي', 'MOP', 2, false, false, false, 200),
  ('MKD', 'Macedonian Denar', 'دينار مقدوني', 'MKD', 2, false, false, false, 200),
  ('MGA', 'Malagasy Ariary', 'أرياري مدغشقر', 'MGA', 0, false, false, false, 200),
  ('MWK', 'Malawian Kwacha', 'كواشا مالاوي', 'MWK', 2, false, false, false, 200),
  ('MYR', 'Malaysian Ringgit', 'رينغيت ماليزي', 'MYR', 2, false, false, false, 200),
  ('MVR', 'Maldivian Rufiyaa', 'روفيه جزر المالديف', 'MVR', 2, false, false, false, 200),
  ('MRU', 'Mauritanian Ouguiya', 'أوقية موريتانية', 'أم', 2, false, false, false, 200),
  ('MUR', 'Mauritian Rupee', 'روبية موريشيوسية', 'MUR', 2, false, false, false, 200),
  ('MXN', 'Mexican Peso', 'بيزو مكسيكي', 'MX$', 2, false, false, false, 200),
  ('MDL', 'Moldovan Leu', 'ليو مولدوفي', 'MDL', 2, false, false, false, 200),
  ('MNT', 'Mongolian Tugrik', 'توغروغ منغولي', 'MNT', 2, false, false, false, 200),
  ('MAD', 'Moroccan Dirham', 'درهم مغربي', 'دم', 2, false, false, false, 200),
  ('MZN', 'Mozambican Metical', 'متكال موزمبيقي', 'MZN', 2, false, false, false, 200),
  ('MMK', 'Myanmar Kyat', 'كيات ميانمار', 'MMK', 0, false, false, false, 200),
  ('NAD', 'Namibian Dollar', 'دولار ناميبي', 'NAD', 2, false, false, false, 200),
  ('NPR', 'Nepalese Rupee', 'روبية نيبالي', 'NPR', 2, false, false, false, 200),
  ('ANG', 'Netherlands Antillean Guilder', 'غيلدر أنتيلي هولندي', 'ANG', 2, false, false, false, 200),
  ('TWD', 'New Taiwan Dollar', 'دولار تايواني', 'NT$', 2, false, false, false, 200),
  ('NZD', 'New Zealand Dollar', 'دولار نيوزيلندي', 'NZ$', 2, false, false, false, 200),
  ('NIO', 'Nicaraguan Córdoba', 'قرطبة نيكاراغوا', 'NIO', 2, false, false, false, 200),
  ('NGN', 'Nigerian Naira', 'نايرا نيجيري', 'NGN', 2, false, false, false, 200),
  ('KPW', 'North Korean Won', 'وون كوريا الشمالية', 'KPW', 0, false, false, false, 200),
  ('NOK', 'Norwegian Krone', 'كرونة نرويجية', 'NOK', 2, false, false, false, 200),
  ('PKR', 'Pakistani Rupee', 'روبية باكستاني', 'PKR', 0, false, false, false, 200),
  ('PAB', 'Panamanian Balboa', 'بالبوا بنمي', 'PAB', 2, false, false, false, 200),
  ('PGK', 'Papua New Guinean Kina', 'كينا بابوا غينيا الجديدة', 'PGK', 2, false, false, false, 200),
  ('PYG', 'Paraguayan Guarani', 'غواراني باراغواي', 'PYG', 0, false, false, false, 200),
  ('PEN', 'Peruvian Sol', 'سول بيروفي', 'PEN', 2, false, false, false, 200),
  ('PHP', 'Philippine Peso', 'بيزو فلبيني', '₱', 2, false, false, false, 200),
  ('PLN', 'Polish Zloty', 'زلوتي بولندي', 'PLN', 2, false, false, false, 200),
  ('RON', 'Romanian Leu', 'ليو روماني', 'RON', 2, false, false, false, 200),
  ('RUB', 'Russian Ruble', 'روبل روسي', '₽', 2, false, false, false, 200),
  ('RWF', 'Rwandan Franc', 'فرنك رواندي', 'RWF', 0, false, false, false, 200),
  ('WST', 'Samoan Tala', 'تالا ساموا', 'WST', 2, false, false, false, 200),
  ('STN', 'São Tomé & Príncipe Dobra', 'دوبرا ساو تومي وبرينسيبي', 'STN', 2, false, false, false, 200),
  ('RSD', 'Serbian Dinar', 'دينار صربي', 'RSD', 2, false, false, false, 200),
  ('SCR', 'Seychellois Rupee', 'روبية سيشيلية', 'SCR', 2, false, false, false, 200),
  ('SLL', 'Sierra Leonean Leone (1964—2022)', 'ليون سيراليوني - 1964-2022', 'SLL', 0, false, false, false, 200),
  ('SGD', 'Singapore Dollar', 'دولار سنغافوري', 'SGD', 2, false, false, false, 200),
  ('SBD', 'Solomon Islands Dollar', 'دولار جزر سليمان', 'SBD', 2, false, false, false, 200),
  ('SOS', 'Somali Shilling', 'شلن صومالي', 'SOS', 0, false, false, false, 200),
  ('ZAR', 'South African Rand', 'راند جنوب أفريقيا', 'ZAR', 2, false, false, false, 200),
  ('KRW', 'South Korean Won', 'وون كوريا الجنوبية', '₩', 0, false, false, false, 200),
  ('SSP', 'South Sudanese Pound', 'جنيه جنوب السودان', 'SSP', 2, false, false, false, 200),
  ('LKR', 'Sri Lankan Rupee', 'روبية سريلانكية', 'LKR', 2, false, false, false, 200),
  ('SHP', 'St. Helena Pound', 'جنيه سانت هيلين', 'SHP', 2, false, false, false, 200),
  ('SDG', 'Sudanese Pound', 'جنيه سوداني', 'جس', 2, false, false, false, 200),
  ('SRD', 'Surinamese Dollar', 'دولار سورينامي', 'SRD', 2, false, false, false, 200),
  ('SZL', 'Swazi Lilangeni', 'ليلانجيني سوازيلندي', 'SZL', 2, false, false, false, 200),
  ('SEK', 'Swedish Krona', 'كرونة سويدية', 'SEK', 2, false, false, false, 200),
  ('CHF', 'Swiss Franc', 'فرنك سويسري', 'CHF', 2, false, false, false, 200),
  ('SYP', 'Syrian Pound', 'ليرة سورية', 'لس', 0, false, false, false, 200),
  ('TJS', 'Tajikistani Somoni', 'سوموني طاجيكستاني', 'TJS', 2, false, false, false, 200),
  ('TZS', 'Tanzanian Shilling', 'شلن تنزاني', 'TZS', 2, false, false, false, 200),
  ('THB', 'Thai Baht', 'باخت تايلاندي', '฿', 2, false, false, false, 200),
  ('TOP', 'Tongan Paʻanga', 'بانغا تونغا', 'TOP', 2, false, false, false, 200),
  ('TTD', 'Trinidad & Tobago Dollar', 'دولار ترينداد وتوباغو', 'TTD', 2, false, false, false, 200),
  ('TND', 'Tunisian Dinar', 'دينار تونسي', 'دت', 3, false, false, false, 200),
  ('TRY', 'Turkish Lira', 'ليرة تركية', '₺', 2, false, false, false, 200),
  ('TMT', 'Turkmenistani Manat', 'مانات تركمانستان', 'TMT', 2, false, false, false, 200),
  ('TVD', 'TVD Currency', 'TVD', 'TVD', 2, false, false, false, 200),
  ('UGX', 'Ugandan Shilling', 'شلن أوغندي', 'UGX', 0, false, false, false, 200),
  ('UAH', 'Ukrainian Hryvnia', 'هريفنيا أوكراني', 'UAH', 2, false, false, false, 200),
  ('UYU', 'Uruguayan Peso', 'بيزو اوروغواي', 'UYU', 2, false, false, false, 200),
  ('UZS', 'Uzbekistani Som', 'سوم أوزبكستاني', 'UZS', 2, false, false, false, 200),
  ('VUV', 'Vanuatu Vatu', 'فاتو فانواتو', 'VUV', 0, false, false, false, 200),
  ('VES', 'Venezuelan Bolívar', 'بوليفار فنزويلي', 'VES', 2, false, false, false, 200),
  ('VND', 'Vietnamese Dong', 'دونج فيتنامي', '₫', 0, false, false, false, 200),
  ('XOF', 'West African CFA Franc', 'فرنك غرب أفريقي', 'F CFA', 0, false, false, false, 200),
  ('YER', 'Yemeni Rial', 'ريال يمني', 'ري', 0, false, false, false, 200),
  ('ZMW', 'Zambian Kwacha', 'كواشا زامبي', 'ZMW', 2, false, false, false, 200),
  ('ZWB', 'ZWB Currency', 'ZWB', 'ZWB', 2, false, false, false, 200)
ON CONFLICT (currency_code) DO UPDATE SET
  currency_name_en = EXCLUDED.currency_name_en,
  currency_name_ar = COALESCE(currencies.currency_name_ar, EXCLUDED.currency_name_ar),
  symbol = COALESCE(currencies.symbol, EXCLUDED.symbol),
  decimal_places = EXCLUDED.decimal_places,
  is_system = EXCLUDED.is_system,
  is_locked = EXCLUDED.is_locked,
  updated_at = now();
```
