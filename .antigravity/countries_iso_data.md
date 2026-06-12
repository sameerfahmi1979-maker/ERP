# ISO Countries Seed Data

This file contains the complete list of ISO 3166-1 countries formatted exactly as per the structure of the `countries` table.
The names, Arabic translations, and Arabic nationalities (demonyms) have been cleaned, verified, and mapped according to international standards.
You can use this data to perform batch insertions or seed updates.

## Table Schema Mapping

| Target Column | Data Type | Nullability | Source / Derivation |
|---|---|---|---|
| `country_code` | `text` | NOT NULL | ISO 3166-1 alpha-2 (2 letters) |
| `iso3_code` | `text` | NOT NULL | ISO 3166-1 alpha-3 (3 letters) |
| `name_en` | `text` | NOT NULL | English name |
| `name_ar` | `text` | YES | Arabic name |
| `nationality_en` | `text` | NOT NULL | English nationality / demonym |
| `nationality_ar` | `text` | YES | Arabic nationality / demonym |
| `phone_code` | `text` | YES | International dialing prefix (e.g. +971) |
| `default_currency_code` | `text` | YES | ISO currency code (e.g. AED) |
| `is_gcc` | `boolean` | NOT NULL | `true` if AE, SA, KW, QA, BH, OM |
| `is_uae` | `boolean` | NOT NULL | `true` if AE |
| `is_system` | `boolean` | NOT NULL | `true` for GCC, `false` for others |
| `is_locked` | `boolean` | NOT NULL | `true` for GCC, `false` for others |
| `is_active` | `boolean` | NOT NULL | Default `true` |
| `sort_order` | `integer` | NOT NULL | GCC values (10-60), others default to 100 |

## Country Data (Markdown Table)

| Country Code | ISO3 Code | Name (EN) | Name (AR) | Nationality (EN) | Nationality (AR) | Phone Code | Default Currency | GCC? | UAE? | Sort Order |
|---|---|---|---|---|---|---|---|---|---|---|
| AE | ARE | United Arab Emirates | الإمارات العربية المتحدة | Emirati | إماراتي | +971 | AED | Yes | Yes | 10 |
| SA | SAU | Saudi Arabia | المملكة العربية السعودية | Saudi | سعودي | +966 | SAR | Yes | No | 20 |
| KW | KWT | Kuwait | الكويت | Kuwaiti | كويتي | +965 | KWD | Yes | No | 30 |
| QA | QAT | Qatar | قطر | Qatari | قطري | +974 | QAR | Yes | No | 40 |
| BH | BHR | Bahrain | البحرين | Bahraini | بحريني | +973 | BHD | Yes | No | 50 |
| OM | OMN | Oman | عمان | Omani | عماني | +968 | OMR | Yes | No | 60 |
| AF | AFG | Afghanistan | أفغانستان | Afghan | أفغاني | +93 | AFN | No | No | 100 |
| AL | ALB | Albania | ألبانيا | Albanian | ألباني | +355 | ALL | No | No | 100 |
| DZ | DZA | Algeria | الجزائر | Algerian | جزائري | +213 | DZD | No | No | 100 |
| AS | ASM | American Samoa | ساموا الأمريكية | American Samoan | ساموائي أمريكي | +1684 | USD | No | No | 100 |
| AD | AND | Andorra | أندورا | Andorran | أندوري | +376 | EUR | No | No | 100 |
| AO | AGO | Angola | جمهورية أنغولا | Angolan | أنغولي | +244 | AOA | No | No | 100 |
| AI | AIA | Anguilla | أنغويلا | Anguillian | أنغويلي | +1264 | XCD | No | No | 100 |
| AQ | ATA | Antarctica | أنتارتيكا | Antarctican | أنتارتيكي |  |  | No | No | 100 |
| AG | ATG | Antigua and Barbuda | أنتيغوا وباربودا | Antiguan, Barbudan | أنتيغوا وباربودي | +1268 | XCD | No | No | 100 |
| AR | ARG | Argentina | الأرجنتين | Argentine | أرجنتيني | +54 | ARS | No | No | 100 |
| AM | ARM | Armenia | أرمينيا | Armenian | أرميني | +374 | AMD | No | No | 100 |
| AW | ABW | Aruba | أروبا | Aruban | أروبي | +297 | AWG | No | No | 100 |
| AU | AUS | Australia | أستراليا | Australian | أسترالي | +61 | AUD | No | No | 100 |
| AT | AUT | Austria | النمسا | Austrian | نمساوي | +43 | EUR | No | No | 100 |
| AZ | AZE | Azerbaijan | أذربيجان | Azerbaijani | أذربيجاني | +994 | AZN | No | No | 100 |
| BS | BHS | Bahamas | البهاما | Bahamian | باهامى | +1242 | BSD | No | No | 100 |
| BD | BGD | Bangladesh | بنغلاديش | Bangladeshi | بنجلاديشي | +880 | BDT | No | No | 100 |
| BB | BRB | Barbados | باربادوس | Barbadian | باربادوسي | +1246 | BBD | No | No | 100 |
| BY | BLR | Belarus | بيلاروسيا | Belarusian | بيلاروسي | +375 | BYN | No | No | 100 |
| BE | BEL | Belgium | بلجيكا | Belgian | بلجيكي | +32 | EUR | No | No | 100 |
| BZ | BLZ | Belize | بليز | Belizean | بليزي | +501 | BZD | No | No | 100 |
| BJ | BEN | Benin | بنين | Beninese | بنيني | +229 | XOF | No | No | 100 |
| BM | BMU | Bermuda | برمودا | Bermudian | برمودي | +1441 | BMD | No | No | 100 |
| BT | BTN | Bhutan | بوتان | Bhutanese | بوتاني | +975 | BTN | No | No | 100 |
| BO | BOL | Bolivia | بوليفيا | Bolivian | بوليفي | +591 | BOB | No | No | 100 |
| BA | BIH | Bosnia and Herzegovina | البوسنة والهرسك | Bosnian, Herzegovinian | بوسني | +387 | BAM | No | No | 100 |
| BW | BWA | Botswana | بوتسوانا | Motswana | بوتسواني | +267 | BWP | No | No | 100 |
| BV | BVT | Bouvet Island | جزر بوفيه | Bouvet Island | جزر بوفيهي | +47 |  | No | No | 100 |
| BR | BRA | Brazil | البرازيل | Brazilian | برازيلي | +55 | BRL | No | No | 100 |
| IO | IOT | British Indian Ocean Territory | إقليم المحيط الهندي البريطاني | Indian | هندي | +246 | USD | No | No | 100 |
| VG | VGB | British Virgin Islands | جزر العذراء | Virgin Islander | عذرائي | +1284 | USD | No | No | 100 |
| BN | BRN | Brunei | بروناي | Bruneian | بروناى | +673 | BND | No | No | 100 |
| BG | BGR | Bulgaria | بلغاريا | Bulgarian | بلغاري | +359 | BGN | No | No | 100 |
| BF | BFA | Burkina Faso | بوركينا فاسو | Burkinabe | بوركيني | +226 | XOF | No | No | 100 |
| BI | BDI | Burundi | بوروندي | Burundian | بوروندي | +257 | BIF | No | No | 100 |
| KH | KHM | Cambodia | كمبوديا | Cambodian | كمبودي | +855 | KHR | No | No | 100 |
| CM | CMR | Cameroon | الكاميرون | Cameroonian | كاميروني | +237 | XAF | No | No | 100 |
| CA | CAN | Canada | كندا | Canadian | كندي | +1 | CAD | No | No | 100 |
| CV | CPV | Cape Verde | كابو فيردي | Cape Verdian | كابو فيرديي | +238 | CVE | No | No | 100 |
| BQ | BES | Caribbean Netherlands | الجزر الكاريبية الهولندية | Dutch | هولندي | +599 | USD | No | No | 100 |
| KY | CYM | Cayman Islands | جزر كايمان | Caymanian | جزر كايماني | +1345 | KYD | No | No | 100 |
| CF | CAF | Central African Republic | جمهورية أفريقيا الوسطى | Central African | وسط أفريقيا | +236 | XAF | No | No | 100 |
| TD | TCD | Chad | تشاد | Chadian | تشادي | +235 | XAF | No | No | 100 |
| CL | CHL | Chile | تشيلي | Chilean | شيلي | +56 | CLP | No | No | 100 |
| CN | CHN | China | الصين | Chinese | صينى | +86 | CNY | No | No | 100 |
| CX | CXR | Christmas Island | جزيرة كريسماس | Christmas Islander | كريسماسي | +61 | AUD | No | No | 100 |
| CC | CCK | Cocos (Keeling) Islands | جزر كوكوس | Cocos Islander | كوكوسي | +61 | AUD | No | No | 100 |
| CO | COL | Colombia | كولومبيا | Colombian | كولومبي | +57 | COP | No | No | 100 |
| KM | COM | Comoros | جزر القمر | Comoran | جزر القمر | +269 | KMF | No | No | 100 |
| CG | COG | Congo | جمهورية الكونغو | Congolese | كونغولي | +242 | XAF | No | No | 100 |
| CK | COK | Cook Islands | جزر كوك | Cook Islander | جزر كوكي | +682 | CKD | No | No | 100 |
| CR | CRI | Costa Rica | كوستاريكا | Costa Rican | كوستاريكي | +506 | CRC | No | No | 100 |
| HR | HRV | Croatia | كرواتيا | Croatian | كرواتية | +385 | EUR | No | No | 100 |
| CU | CUB | Cuba | كوبا | Cuban | كوبي | +53 | CUC | No | No | 100 |
| CW | CUW | Curaçao | كوراساو | Curaçaoan | كوراساوي | +599 | ANG | No | No | 100 |
| CY | CYP | Cyprus | قبرص | Cypriot | قبرصي | +357 | EUR | No | No | 100 |
| CZ | CZE | Czechia | التشيك | Czech | تشيكي | +420 | CZK | No | No | 100 |
| DK | DNK | Denmark | الدنمارك | Danish | دانماركي | +45 | DKK | No | No | 100 |
| DJ | DJI | Djibouti | جيبوتي | Djibouti | جيبوتي | +253 | DJF | No | No | 100 |
| DM | DMA | Dominica | دومينيكا | Dominican | دومينيكاني | +1767 | XCD | No | No | 100 |
| DO | DOM | Dominican Republic | جمهورية الدومينيكان | Dominican | دومينيكاني | +1 | DOP | No | No | 100 |
| CD | COD | DR Congo | الكونغو | Congolese | كونغولي | +243 | CDF | No | No | 100 |
| EC | ECU | Ecuador | الإكوادور | Ecuadorean | اكوادوري | +593 | USD | No | No | 100 |
| SV | SLV | El Salvador | السلفادور | Salvadoran | سلفادوري | +503 | USD | No | No | 100 |
| GQ | GNQ | Equatorial Guinea | غينيا الاستوائية | Equatorial Guinean | غيني  استوائي | +240 | XAF | No | No | 100 |
| ER | ERI | Eritrea | إريتريا | Eritrean | إريتري | +291 | ERN | No | No | 100 |
| EE | EST | Estonia | إستونيا | Estonian | إستوني | +372 | EUR | No | No | 100 |
| SZ | SWZ | Eswatini | إسواتيني | Swazi | سوازي | +268 | SZL | No | No | 100 |
| ET | ETH | Ethiopia | إثيوبيا | Ethiopian | حبشي | +251 | ETB | No | No | 100 |
| FK | FLK | Falkland Islands | جزر فوكلاند | Falkland Islander | جزر فوكلاندي | +500 | FKP | No | No | 100 |
| FO | FRO | Faroe Islands | جزر فارو | Faroese | فاروي | +298 | DKK | No | No | 100 |
| FJ | FJI | Fiji | فيجي | Fijian | فيجي | +679 | FJD | No | No | 100 |
| FI | FIN | Finland | فنلندا | Finnish | فنلندي | +358 | EUR | No | No | 100 |
| FR | FRA | France | فرنسا | French | فرنسي | +33 | EUR | No | No | 100 |
| GF | GUF | French Guiana | غويانا | Guianan | غوياني | +594 | EUR | No | No | 100 |
| PF | PYF | French Polynesia | بولينزيا الفرنسية | French Polynesian | بولينزيا الفرنسيةي | +689 | XPF | No | No | 100 |
| TF | ATF | French Southern and Antarctic Lands | أراض فرنسية جنوبية وأنتارتيكية | French | فرنسي | +262 | EUR | No | No | 100 |
| GA | GAB | Gabon | الغابون | Gabonese | جابوني | +241 | XAF | No | No | 100 |
| GM | GMB | Gambia | غامبيا | Gambian | غامبيي | +220 | GMD | No | No | 100 |
| GE | GEO | Georgia | جورجيا | Georgian | جورجي | +995 | GEL | No | No | 100 |
| DE | DEU | Germany | ألمانيا | German | ألماني | +49 | EUR | No | No | 100 |
| GH | GHA | Ghana | غانا | Ghanaian | غاني | +233 | GHS | No | No | 100 |
| GI | GIB | Gibraltar | جبل طارق | Gibraltar | جبل طارقي | +350 | GIP | No | No | 100 |
| GR | GRC | Greece | اليونان | Greek | إغريقي | +30 | EUR | No | No | 100 |
| GL | GRL | Greenland | جرينلاند | Greenlandic | جرينلاندي | +299 | DKK | No | No | 100 |
| GD | GRD | Grenada | غرينادا | Grenadian | جرينادي | +1473 | XCD | No | No | 100 |
| GP | GLP | Guadeloupe | غوادلوب | Guadeloupian | غوادلوبي | +590 | EUR | No | No | 100 |
| GU | GUM | Guam | غوام | Guamanian | غوامي | +1671 | USD | No | No | 100 |
| GT | GTM | Guatemala | غواتيمالا | Guatemalan | غواتيمالي | +502 | GTQ | No | No | 100 |
| GG | GGY | Guernsey | غيرنزي | Channel Islander | قنالي | +44 | GBP | No | No | 100 |
| GN | GIN | Guinea | غينيا | Guinean | غيني | +224 | GNF | No | No | 100 |
| GW | GNB | Guinea-Bissau | غينيا بيساو | Guinea-Bissauan | غيني بيساوي | +245 | XOF | No | No | 100 |
| GY | GUY | Guyana | غيانا | Guyanese | جوياني | +592 | GYD | No | No | 100 |
| HT | HTI | Haiti | هايتي | Haitian | هايتي | +509 | HTG | No | No | 100 |
| HM | HMD | Heard Island and McDonald Islands | جزيرة هيرد وجزر ماكدونالد | Heard and McDonald Islander | جزيرة هيرد وجزر ماكدونالدي |  |  | No | No | 100 |
| HN | HND | Honduras | هندوراس | Honduran | هندوراسي | +504 | HNL | No | No | 100 |
| HK | HKG | Hong Kong | هونغ كونغ | Hong Konger | هونغ كونغي | +852 | HKD | No | No | 100 |
| HU | HUN | Hungary | المجر | Hungarian | هنغاري | +36 | HUF | No | No | 100 |
| IS | ISL | Iceland | آيسلندا | Icelander | إيسلندي | +354 | ISK | No | No | 100 |
| ID | IDN | Indonesia | إندونيسيا | Indonesian | إندونيسي | +62 | IDR | No | No | 100 |
| IR | IRN | Iran | إيران | Iranian | إيراني | +98 | IRR | No | No | 100 |
| IE | IRL | Ireland | أيرلندا | Irish | إيرلندي | +353 | EUR | No | No | 100 |
| IM | IMN | Isle of Man | جزيرة مان | Manx | جزيرة ماني | +44 | GBP | No | No | 100 |
| IL | ISR | Israel | إسرائيل | Israeli | إسرائيلي | +972 | ILS | No | No | 100 |
| IT | ITA | Italy | إيطاليا | Italian | إيطالي | +39 | EUR | No | No | 100 |
| CI | CIV | Ivory Coast | ساحل العاج | Ivorian | إفواري | +225 | XOF | No | No | 100 |
| JM | JAM | Jamaica | جامايكا | Jamaican | جامايكي | +1876 | JMD | No | No | 100 |
| JP | JPN | Japan | اليابان | Japanese | ياباني | +81 | JPY | No | No | 100 |
| JE | JEY | Jersey | جيرزي | Channel Islander | قنالي | +44 | GBP | No | No | 100 |
| KZ | KAZ | Kazakhstan | كازاخستان | Kazakhstani | كازاخستاني | +7 | KZT | No | No | 100 |
| KE | KEN | Kenya | كينيا | Kenyan | كيني | +254 | KES | No | No | 100 |
| KI | KIR | Kiribati | كيريباتي | I-Kiribati | كيريباتيي | +686 | AUD | No | No | 100 |
| XK | UNK | Kosovo | كوسوفو | Kosovar | كوسوفوي | +383 | EUR | No | No | 100 |
| KG | KGZ | Kyrgyzstan | قيرغيزستان | Kirghiz | قيرغيزستاني | +996 | KGS | No | No | 100 |
| LA | LAO | Laos | لاوس | Laotian | لاوسي | +856 | LAK | No | No | 100 |
| LV | LVA | Latvia | لاتفيا | Latvian | لاتفي | +371 | EUR | No | No | 100 |
| LS | LSO | Lesotho | ليسوتو | Mosotho | ليسوتو | +266 | LSL | No | No | 100 |
| LR | LBR | Liberia | ليبيريا | Liberian | ليبيري | +231 | LRD | No | No | 100 |
| LY | LBY | Libya | ليبيا | Libyan | ليبي | +218 | LYD | No | No | 100 |
| LI | LIE | Liechtenstein | ليختنشتاين | Liechtensteiner | ليختنشتايني | +423 | CHF | No | No | 100 |
| LT | LTU | Lithuania | ليتوانيا | Lithuanian | لتواني | +370 | EUR | No | No | 100 |
| LU | LUX | Luxembourg | لوكسمبورغ | Luxembourger | لكسمبرغي | +352 | EUR | No | No | 100 |
| MO | MAC | Macau | ماكاو | Macanese | ماكاوي | +853 | MOP | No | No | 100 |
| MG | MDG | Madagascar | مدغشقر | Malagasy | مدغشقري | +261 | MGA | No | No | 100 |
| MW | MWI | Malawi | مالاوي | Malawian | مالاوى | +265 | MWK | No | No | 100 |
| MY | MYS | Malaysia | ماليزيا | Malaysian | ماليزي | +60 | MYR | No | No | 100 |
| MV | MDV | Maldives | المالديف | Maldivan | مالديفي | +960 | MVR | No | No | 100 |
| ML | MLI | Mali | مالي | Malian | مالي | +223 | XOF | No | No | 100 |
| MT | MLT | Malta | مالطا | Maltese | مالطي | +356 | EUR | No | No | 100 |
| MH | MHL | Marshall Islands | جزر مارشال | Marshallese | مارشالي | +692 | USD | No | No | 100 |
| MQ | MTQ | Martinique | مارتينيك | Martinican | مارتينيكي | +596 | EUR | No | No | 100 |
| MR | MRT | Mauritania | موريتانيا | Mauritanian | موريتاني | +222 | MRU | No | No | 100 |
| MU | MUS | Mauritius | موريشيوس | Mauritian | موريشيوسي | +230 | MUR | No | No | 100 |
| YT | MYT | Mayotte | مايوت | Mahoran | مايوتي | +262 | EUR | No | No | 100 |
| MX | MEX | Mexico | المسكيك | Mexican | مكسيكي | +52 | MXN | No | No | 100 |
| FM | FSM | Micronesia | ميكرونيسيا | Micronesian | ميكرونيزي | +691 |  | No | No | 100 |
| MD | MDA | Moldova | مولدوڤا | Moldovan | مولدوفي | +373 | MDL | No | No | 100 |
| MC | MCO | Monaco | موناكو | Monegasque | موناكوي | +377 | EUR | No | No | 100 |
| MN | MNG | Mongolia | منغوليا | Mongolian | منغولي | +976 | MNT | No | No | 100 |
| ME | MNE | Montenegro | الجبل الاسود | Montenegrin | مونتينيغري | +382 | EUR | No | No | 100 |
| MS | MSR | Montserrat | مونتسرات | Montserratian | مونتسراتي | +1664 | XCD | No | No | 100 |
| MA | MAR | Morocco | المغرب | Moroccan | مغربي | +212 | MAD | No | No | 100 |
| MZ | MOZ | Mozambique | موزمبيق | Mozambican | موزمبيقي | +258 | MZN | No | No | 100 |
| MM | MMR | Myanmar | ميانمار | Burmese | بورمي | +95 | MMK | No | No | 100 |
| NA | NAM | Namibia | ناميبيا | Namibian | ناميبي | +264 | NAD | No | No | 100 |
| NR | NRU | Nauru | ناورو | Nauruan | ناورو | +674 | AUD | No | No | 100 |
| NP | NPL | Nepal | نيبال | Nepalese | نيبالي | +977 | NPR | No | No | 100 |
| NL | NLD | Netherlands | هولندا | Dutch | هولندي | +31 | EUR | No | No | 100 |
| NC | NCL | New Caledonia | كاليدونيا الجديدة | New Caledonian | كاليدونيا الجديدةي | +687 | XPF | No | No | 100 |
| NZ | NZL | New Zealand | نيوزيلندا | New Zealander | نيوزيلندي | +64 | NZD | No | No | 100 |
| NI | NIC | Nicaragua | نيكاراغوا | Nicaraguan | نيكاراغوا | +505 | NIO | No | No | 100 |
| NE | NER | Niger | النيجر | Nigerien | نيجري | +227 | XOF | No | No | 100 |
| NG | NGA | Nigeria | نيجيريا | Nigerian | نيجيري | +234 | NGN | No | No | 100 |
| NU | NIU | Niue | نييوي | Niuean | نييويي | +683 | NZD | No | No | 100 |
| NF | NFK | Norfolk Island | جزيرة نورفولك | Norfolk Islander | جزيرة نورفولكي | +672 | AUD | No | No | 100 |
| KP | PRK | North Korea | كوريا الشمالية | North Korean | كوري شمالي | +850 | KPW | No | No | 100 |
| MK | MKD | North Macedonia | شمال مقدونيا | Macedonian | مقدوني | +389 | MKD | No | No | 100 |
| MP | MNP | Northern Mariana Islands | جزر ماريانا الشمالية | American | أمريكي | +1670 | USD | No | No | 100 |
| NO | NOR | Norway | النرويج | Norwegian | نرويجي | +47 | NOK | No | No | 100 |
| PW | PLW | Palau | بالاو | Palauan | بالاوي | +680 | USD | No | No | 100 |
| PS | PSE | Palestine | فلسطين | Palestinian | فلسطيني | +970 | EGP | No | No | 100 |
| PA | PAN | Panama | بنما | Panamanian | بنمي | +507 | PAB | No | No | 100 |
| PG | PNG | Papua New Guinea | بابوا غينيا الجديدة | Papua New Guinean | بابوا غينيا الجديدة | +675 | PGK | No | No | 100 |
| PY | PRY | Paraguay | باراغواي | Paraguayan | باراغواياني | +595 | PYG | No | No | 100 |
| PE | PER | Peru | بيرو | Peruvian | بيروفي | +51 | PEN | No | No | 100 |
| PH | PHL | Philippines | الفلبين | Filipino | فلبيني | +63 | PHP | No | No | 100 |
| PN | PCN | Pitcairn Islands | جزر بيتكيرن | Pitcairn Islander | بيتكيرني | +64 | NZD | No | No | 100 |
| PL | POL | Poland | بولندا | Polish | بولندي | +48 | PLN | No | No | 100 |
| PT | PRT | Portugal | البرتغال | Portuguese | برتغالي | +351 | EUR | No | No | 100 |
| PR | PRI | Puerto Rico | بويرتوريكو | Puerto Rican | بويرتوريكوي | +1 | USD | No | No | 100 |
| RO | ROU | Romania | رومانيا | Romanian | روماني | +40 | RON | No | No | 100 |
| RU | RUS | Russia | روسيا | Russian | روسي | +7 | RUB | No | No | 100 |
| RW | RWA | Rwanda | رواندا | Rwandan | رواندي | +250 | RWF | No | No | 100 |
| RE | REU | Réunion | لا ريونيون | Réunionese | ريونيوني | +262 | EUR | No | No | 100 |
| BL | BLM | Saint Barthélemy | سان بارتليمي | Saint Barthélemy Islander | بارتليمي | +590 | EUR | No | No | 100 |
| SH | SHN | Saint Helena, Ascension and Tristan da Cunha | سانت هيلينا وأسينشين وتريستان دا كونا | Saint Helenian | سانت هيليني | +2 | GBP | No | No | 100 |
| KN | KNA | Saint Kitts and Nevis | سانت كيتس ونيفيس | Kittitian or Nevisian | كيتيسي | +1869 | XCD | No | No | 100 |
| LC | LCA | Saint Lucia | سانت لوسيا | Saint Lucian | سانت لوسي | +1758 | XCD | No | No | 100 |
| MF | MAF | Saint Martin | سانت مارتن | Saint Martin Islander | مارتني | +590 | EUR | No | No | 100 |
| PM | SPM | Saint Pierre and Miquelon | سان بيير وميكلون | Saint-Pierrais, Miquelonnais | سان بييري | +508 | EUR | No | No | 100 |
| VC | VCT | Saint Vincent and the Grenadines | سانت فينسنت والغرينادين | Saint Vincentian | سانت فينسنتي | +1784 | XCD | No | No | 100 |
| WS | WSM | Samoa | ساموا | Samoan | ساموايان | +685 | WST | No | No | 100 |
| SM | SMR | San Marino | سان مارينو | Sammarinese | سان مارينوي | +378 | EUR | No | No | 100 |
| SN | SEN | Senegal | السنغال | Senegalese | سنغالي | +221 | XOF | No | No | 100 |
| RS | SRB | Serbia | صيربيا | Serbian | صربي | +381 | RSD | No | No | 100 |
| SC | SYC | Seychelles | سيشل | Seychellois | سيشلي | +248 | SCR | No | No | 100 |
| SL | SLE | Sierra Leone | سيراليون | Sierra Leonean | سيراليوني | +232 | SLL | No | No | 100 |
| SG | SGP | Singapore | سنغافورة | Singaporean | سنغافوري | +65 | SGD | No | No | 100 |
| SX | SXM | Sint Maarten | سينت مارتن | St. Maartener | سنت مارتني | +1721 | ANG | No | No | 100 |
| SK | SVK | Slovakia | سلوفاكيا | Slovak | سلوفاكي | +421 | EUR | No | No | 100 |
| SI | SVN | Slovenia | سلوفينيا | Slovene | سلوفيني | +386 | EUR | No | No | 100 |
| SB | SLB | Solomon Islands | جزر سليمان | Solomon Islander | سليماني | +677 | SBD | No | No | 100 |
| SO | SOM | Somalia | الصومال | Somali | صومالي | +252 | SOS | No | No | 100 |
| ZA | ZAF | South Africa | جنوب أفريقيا | South African | جنوب افريقيي | +27 | ZAR | No | No | 100 |
| GS | SGS | South Georgia | جورجيا الجنوبية | South Georgian South Sandwich Islander | جورجي جنوبي | +500 | SHP | No | No | 100 |
| KR | KOR | South Korea | كوريا الجنوبية | South Korean | كوري جنوبي | +82 | KRW | No | No | 100 |
| SS | SSD | South Sudan | جنوب السودان | South Sudanese | جنوب السوداني | +211 | SSP | No | No | 100 |
| ES | ESP | Spain | إسبانيا | Spanish | إسباني | +34 | EUR | No | No | 100 |
| LK | LKA | Sri Lanka | سريلانكا | Sri Lankan | سري لانكي | +94 | LKR | No | No | 100 |
| SD | SDN | Sudan | السودان | Sudanese | سوداني | +249 | SDG | No | No | 100 |
| SR | SUR | Suriname | سورينام | Surinamer | سورينامي | +597 | SRD | No | No | 100 |
| SJ | SJM | Svalbard and Jan Mayen | سفالبارد ويان ماين | Norwegian | نرويجي | +4779 | NOK | No | No | 100 |
| SE | SWE | Sweden | السويد | Swedish | سويدي | +46 | SEK | No | No | 100 |
| CH | CHE | Switzerland | سويسرا | Swiss | سويسري | +41 | CHF | No | No | 100 |
| ST | STP | São Tomé and Príncipe | ساو تومي وبرينسيب | Sao Tomean | ساو توميان | +239 | STN | No | No | 100 |
| TW | TWN | Taiwan | تايوان | Taiwanese | تايواني | +886 | TWD | No | No | 100 |
| TJ | TJK | Tajikistan | طاجيكستان | Tadzhik | طاجيكستاني | +992 | TJS | No | No | 100 |
| TZ | TZA | Tanzania | تنزانيا | Tanzanian | تنزاني | +255 | TZS | No | No | 100 |
| TH | THA | Thailand | تايلند | Thai | التايلاندي | +66 | THB | No | No | 100 |
| TL | TLS | Timor-Leste | تيمور الشرقية | East Timorese | تيموري | +670 | USD | No | No | 100 |
| TG | TGO | Togo | توغو | Togolese | توغواني | +228 | XOF | No | No | 100 |
| TK | TKL | Tokelau | توكيلاو | Tokelauan | توكيلاوي | +690 | NZD | No | No | 100 |
| TO | TON | Tonga | تونغا | Tongan | تونجاني | +676 | TOP | No | No | 100 |
| TT | TTO | Trinidad and Tobago | ترينيداد وتوباغو | Trinidadian | ترينيدادي | +1868 | TTD | No | No | 100 |
| TN | TUN | Tunisia | تونس | Tunisian | تونسي | +216 | TND | No | No | 100 |
| TM | TKM | Turkmenistan | تركمانستان | Turkmen | تركمانستاني | +993 | TMT | No | No | 100 |
| TC | TCA | Turks and Caicos Islands | جزر توركس وكايكوس | Turks and Caicos Islander | تركاوي | +1649 | USD | No | No | 100 |
| TV | TUV | Tuvalu | توفالو | Tuvaluan | توفالي | +688 | AUD | No | No | 100 |
| TR | TUR | Türkiye | تركيا | Turkish | تركي | +90 | TRY | No | No | 100 |
| UG | UGA | Uganda | أوغندا | Ugandan | أوغندي | +256 | UGX | No | No | 100 |
| UA | UKR | Ukraine | أوكرانيا | Ukrainian | أوكراني | +380 | UAH | No | No | 100 |
| US | USA | United States | الولايات المتحدة | American | أمريكي | +1 | USD | No | No | 100 |
| UM | UMI | United States Minor Outlying Islands | جزر الولايات المتحدة الصغيرة النائية | American Islander | جزر الولايات المتحدة الصغيرة النائيةي |  | USD | No | No | 100 |
| VI | VIR | United States Virgin Islands | جزر العذراء الامريكية | Virgin Islander | عذرائي | +1340 | USD | No | No | 100 |
| UY | URY | Uruguay | الأوروغواي | Uruguayan | أوروجواي | +598 | UYU | No | No | 100 |
| UZ | UZB | Uzbekistan | أوزباكستان | Uzbekistani | أوزبكستاني | +998 | UZS | No | No | 100 |
| VU | VUT | Vanuatu | فانواتو | Ni-Vanuatu | فانواتي | +678 | VUV | No | No | 100 |
| VA | VAT | Vatican City | مدينة الفاتيكان | Vatican | مدينة الفاتيكاني | +3 | EUR | No | No | 100 |
| VE | VEN | Venezuela | فنزويلا | Venezuelan | فنزويلي | +58 | VES | No | No | 100 |
| VN | VNM | Vietnam | فيتنام | Vietnamese | فيتنامي | +84 | VND | No | No | 100 |
| WF | WLF | Wallis and Futuna | واليس وفوتونا | Wallis and Futuna Islander | واليسي | +681 | XPF | No | No | 100 |
| EH | ESH | Western Sahara | الصحراء الغربية | Sahrawi | صحراوي | +2 | DZD | No | No | 100 |
| YE | YEM | Yemen | اليمن | Yemeni | اليمني | +967 | YER | No | No | 100 |
| ZM | ZMB | Zambia | زامبيا | Zambian | زامبي | +260 | ZMW | No | No | 100 |
| ZW | ZWE | Zimbabwe | زيمبابوي | Zimbabwean | زيمبابوي | +263 | BWP | No | No | 100 |
| AX | ALA | Åland Islands | جزر أولاند | Ålandish | أولاندي | +35818 | EUR | No | No | 100 |
| GB | GBR | United Kingdom | المملكة المتحدة | British | بريطاني | +44 | GBP | No | No | 110 |
| IN | IND | India | الهند | Indian | هندي | +91 | INR | No | No | 120 |
| PK | PAK | Pakistan | باكستان | Pakistani | باكستاني | +92 | PKR | No | No | 130 |
| EG | EGY | Egypt | مصر | Egyptian | مصري | +20 | EGP | No | No | 140 |
| JO | JOR | Jordan | الأردن | Jordanian | أردني | +962 | JOD | No | No | 150 |
| LB | LBN | Lebanon | لبنان | Lebanese | لبناني | +961 | LBP | No | No | 160 |
| SY | SYR | Syria | سوريا | Syrian | سوري | +963 | SYP | No | No | 170 |
| IQ | IRQ | Iraq | العراق | Iraqi | عراقي | +964 | IQD | No | No | 180 |

## SQL Insert Script

You can copy-paste the SQL script below to insert the countries into the database using a batch execution.
It includes `ON CONFLICT (country_code) DO UPDATE` to safely apply updates without violating constraints.

```sql
INSERT INTO public.countries (
  country_code, iso3_code, name_en, name_ar, 
  nationality_en, nationality_ar, phone_code, default_currency_code, 
  is_gcc, is_uae, is_system, is_locked, sort_order
) VALUES
  ('AE', 'ARE', 'United Arab Emirates', 'الإمارات العربية المتحدة', 'Emirati', 'إماراتي', '+971', 'AED', true, true, true, true, 10),
  ('SA', 'SAU', 'Saudi Arabia', 'المملكة العربية السعودية', 'Saudi', 'سعودي', '+966', 'SAR', true, false, true, true, 20),
  ('KW', 'KWT', 'Kuwait', 'الكويت', 'Kuwaiti', 'كويتي', '+965', 'KWD', true, false, true, true, 30),
  ('QA', 'QAT', 'Qatar', 'قطر', 'Qatari', 'قطري', '+974', 'QAR', true, false, true, true, 40),
  ('BH', 'BHR', 'Bahrain', 'البحرين', 'Bahraini', 'بحريني', '+973', 'BHD', true, false, true, true, 50),
  ('OM', 'OMN', 'Oman', 'عمان', 'Omani', 'عماني', '+968', 'OMR', true, false, true, true, 60),
  ('AF', 'AFG', 'Afghanistan', 'أفغانستان', 'Afghan', 'أفغاني', '+93', 'AFN', false, false, false, false, 100),
  ('AL', 'ALB', 'Albania', 'ألبانيا', 'Albanian', 'ألباني', '+355', 'ALL', false, false, false, false, 100),
  ('DZ', 'DZA', 'Algeria', 'الجزائر', 'Algerian', 'جزائري', '+213', 'DZD', false, false, false, false, 100),
  ('AS', 'ASM', 'American Samoa', 'ساموا الأمريكية', 'American Samoan', 'ساموائي أمريكي', '+1684', 'USD', false, false, false, false, 100),
  ('AD', 'AND', 'Andorra', 'أندورا', 'Andorran', 'أندوري', '+376', 'EUR', false, false, false, false, 100),
  ('AO', 'AGO', 'Angola', 'جمهورية أنغولا', 'Angolan', 'أنغولي', '+244', 'AOA', false, false, false, false, 100),
  ('AI', 'AIA', 'Anguilla', 'أنغويلا', 'Anguillian', 'أنغويلي', '+1264', 'XCD', false, false, false, false, 100),
  ('AQ', 'ATA', 'Antarctica', 'أنتارتيكا', 'Antarctican', 'أنتارتيكي', NULL, NULL, false, false, false, false, 100),
  ('AG', 'ATG', 'Antigua and Barbuda', 'أنتيغوا وباربودا', 'Antiguan, Barbudan', 'أنتيغوا وباربودي', '+1268', 'XCD', false, false, false, false, 100),
  ('AR', 'ARG', 'Argentina', 'الأرجنتين', 'Argentine', 'أرجنتيني', '+54', 'ARS', false, false, false, false, 100),
  ('AM', 'ARM', 'Armenia', 'أرمينيا', 'Armenian', 'أرميني', '+374', 'AMD', false, false, false, false, 100),
  ('AW', 'ABW', 'Aruba', 'أروبا', 'Aruban', 'أروبي', '+297', 'AWG', false, false, false, false, 100),
  ('AU', 'AUS', 'Australia', 'أستراليا', 'Australian', 'أسترالي', '+61', 'AUD', false, false, false, false, 100),
  ('AT', 'AUT', 'Austria', 'النمسا', 'Austrian', 'نمساوي', '+43', 'EUR', false, false, false, false, 100),
  ('AZ', 'AZE', 'Azerbaijan', 'أذربيجان', 'Azerbaijani', 'أذربيجاني', '+994', 'AZN', false, false, false, false, 100),
  ('BS', 'BHS', 'Bahamas', 'البهاما', 'Bahamian', 'باهامى', '+1242', 'BSD', false, false, false, false, 100),
  ('BD', 'BGD', 'Bangladesh', 'بنغلاديش', 'Bangladeshi', 'بنجلاديشي', '+880', 'BDT', false, false, false, false, 100),
  ('BB', 'BRB', 'Barbados', 'باربادوس', 'Barbadian', 'باربادوسي', '+1246', 'BBD', false, false, false, false, 100),
  ('BY', 'BLR', 'Belarus', 'بيلاروسيا', 'Belarusian', 'بيلاروسي', '+375', 'BYN', false, false, false, false, 100),
  ('BE', 'BEL', 'Belgium', 'بلجيكا', 'Belgian', 'بلجيكي', '+32', 'EUR', false, false, false, false, 100),
  ('BZ', 'BLZ', 'Belize', 'بليز', 'Belizean', 'بليزي', '+501', 'BZD', false, false, false, false, 100),
  ('BJ', 'BEN', 'Benin', 'بنين', 'Beninese', 'بنيني', '+229', 'XOF', false, false, false, false, 100),
  ('BM', 'BMU', 'Bermuda', 'برمودا', 'Bermudian', 'برمودي', '+1441', 'BMD', false, false, false, false, 100),
  ('BT', 'BTN', 'Bhutan', 'بوتان', 'Bhutanese', 'بوتاني', '+975', 'BTN', false, false, false, false, 100),
  ('BO', 'BOL', 'Bolivia', 'بوليفيا', 'Bolivian', 'بوليفي', '+591', 'BOB', false, false, false, false, 100),
  ('BA', 'BIH', 'Bosnia and Herzegovina', 'البوسنة والهرسك', 'Bosnian, Herzegovinian', 'بوسني', '+387', 'BAM', false, false, false, false, 100),
  ('BW', 'BWA', 'Botswana', 'بوتسوانا', 'Motswana', 'بوتسواني', '+267', 'BWP', false, false, false, false, 100),
  ('BV', 'BVT', 'Bouvet Island', 'جزر بوفيه', 'Bouvet Island', 'جزر بوفيهي', '+47', NULL, false, false, false, false, 100),
  ('BR', 'BRA', 'Brazil', 'البرازيل', 'Brazilian', 'برازيلي', '+55', 'BRL', false, false, false, false, 100),
  ('IO', 'IOT', 'British Indian Ocean Territory', 'إقليم المحيط الهندي البريطاني', 'Indian', 'هندي', '+246', 'USD', false, false, false, false, 100),
  ('VG', 'VGB', 'British Virgin Islands', 'جزر العذراء', 'Virgin Islander', 'عذرائي', '+1284', 'USD', false, false, false, false, 100),
  ('BN', 'BRN', 'Brunei', 'بروناي', 'Bruneian', 'بروناى', '+673', 'BND', false, false, false, false, 100),
  ('BG', 'BGR', 'Bulgaria', 'بلغاريا', 'Bulgarian', 'بلغاري', '+359', 'BGN', false, false, false, false, 100),
  ('BF', 'BFA', 'Burkina Faso', 'بوركينا فاسو', 'Burkinabe', 'بوركيني', '+226', 'XOF', false, false, false, false, 100),
  ('BI', 'BDI', 'Burundi', 'بوروندي', 'Burundian', 'بوروندي', '+257', 'BIF', false, false, false, false, 100),
  ('KH', 'KHM', 'Cambodia', 'كمبوديا', 'Cambodian', 'كمبودي', '+855', 'KHR', false, false, false, false, 100),
  ('CM', 'CMR', 'Cameroon', 'الكاميرون', 'Cameroonian', 'كاميروني', '+237', 'XAF', false, false, false, false, 100),
  ('CA', 'CAN', 'Canada', 'كندا', 'Canadian', 'كندي', '+1', 'CAD', false, false, false, false, 100),
  ('CV', 'CPV', 'Cape Verde', 'كابو فيردي', 'Cape Verdian', 'كابو فيرديي', '+238', 'CVE', false, false, false, false, 100),
  ('BQ', 'BES', 'Caribbean Netherlands', 'الجزر الكاريبية الهولندية', 'Dutch', 'هولندي', '+599', 'USD', false, false, false, false, 100),
  ('KY', 'CYM', 'Cayman Islands', 'جزر كايمان', 'Caymanian', 'جزر كايماني', '+1345', 'KYD', false, false, false, false, 100),
  ('CF', 'CAF', 'Central African Republic', 'جمهورية أفريقيا الوسطى', 'Central African', 'وسط أفريقيا', '+236', 'XAF', false, false, false, false, 100),
  ('TD', 'TCD', 'Chad', 'تشاد', 'Chadian', 'تشادي', '+235', 'XAF', false, false, false, false, 100),
  ('CL', 'CHL', 'Chile', 'تشيلي', 'Chilean', 'شيلي', '+56', 'CLP', false, false, false, false, 100),
  ('CN', 'CHN', 'China', 'الصين', 'Chinese', 'صينى', '+86', 'CNY', false, false, false, false, 100),
  ('CX', 'CXR', 'Christmas Island', 'جزيرة كريسماس', 'Christmas Islander', 'كريسماسي', '+61', 'AUD', false, false, false, false, 100),
  ('CC', 'CCK', 'Cocos (Keeling) Islands', 'جزر كوكوس', 'Cocos Islander', 'كوكوسي', '+61', 'AUD', false, false, false, false, 100),
  ('CO', 'COL', 'Colombia', 'كولومبيا', 'Colombian', 'كولومبي', '+57', 'COP', false, false, false, false, 100),
  ('KM', 'COM', 'Comoros', 'جزر القمر', 'Comoran', 'جزر القمر', '+269', 'KMF', false, false, false, false, 100),
  ('CG', 'COG', 'Congo', 'جمهورية الكونغو', 'Congolese', 'كونغولي', '+242', 'XAF', false, false, false, false, 100),
  ('CK', 'COK', 'Cook Islands', 'جزر كوك', 'Cook Islander', 'جزر كوكي', '+682', 'CKD', false, false, false, false, 100),
  ('CR', 'CRI', 'Costa Rica', 'كوستاريكا', 'Costa Rican', 'كوستاريكي', '+506', 'CRC', false, false, false, false, 100),
  ('HR', 'HRV', 'Croatia', 'كرواتيا', 'Croatian', 'كرواتية', '+385', 'EUR', false, false, false, false, 100),
  ('CU', 'CUB', 'Cuba', 'كوبا', 'Cuban', 'كوبي', '+53', 'CUC', false, false, false, false, 100),
  ('CW', 'CUW', 'Curaçao', 'كوراساو', 'Curaçaoan', 'كوراساوي', '+599', 'ANG', false, false, false, false, 100),
  ('CY', 'CYP', 'Cyprus', 'قبرص', 'Cypriot', 'قبرصي', '+357', 'EUR', false, false, false, false, 100),
  ('CZ', 'CZE', 'Czechia', 'التشيك', 'Czech', 'تشيكي', '+420', 'CZK', false, false, false, false, 100),
  ('DK', 'DNK', 'Denmark', 'الدنمارك', 'Danish', 'دانماركي', '+45', 'DKK', false, false, false, false, 100),
  ('DJ', 'DJI', 'Djibouti', 'جيبوتي', 'Djibouti', 'جيبوتي', '+253', 'DJF', false, false, false, false, 100),
  ('DM', 'DMA', 'Dominica', 'دومينيكا', 'Dominican', 'دومينيكاني', '+1767', 'XCD', false, false, false, false, 100),
  ('DO', 'DOM', 'Dominican Republic', 'جمهورية الدومينيكان', 'Dominican', 'دومينيكاني', '+1', 'DOP', false, false, false, false, 100),
  ('CD', 'COD', 'DR Congo', 'الكونغو', 'Congolese', 'كونغولي', '+243', 'CDF', false, false, false, false, 100),
  ('EC', 'ECU', 'Ecuador', 'الإكوادور', 'Ecuadorean', 'اكوادوري', '+593', 'USD', false, false, false, false, 100),
  ('SV', 'SLV', 'El Salvador', 'السلفادور', 'Salvadoran', 'سلفادوري', '+503', 'USD', false, false, false, false, 100),
  ('GQ', 'GNQ', 'Equatorial Guinea', 'غينيا الاستوائية', 'Equatorial Guinean', 'غيني  استوائي', '+240', 'XAF', false, false, false, false, 100),
  ('ER', 'ERI', 'Eritrea', 'إريتريا', 'Eritrean', 'إريتري', '+291', 'ERN', false, false, false, false, 100),
  ('EE', 'EST', 'Estonia', 'إستونيا', 'Estonian', 'إستوني', '+372', 'EUR', false, false, false, false, 100),
  ('SZ', 'SWZ', 'Eswatini', 'إسواتيني', 'Swazi', 'سوازي', '+268', 'SZL', false, false, false, false, 100),
  ('ET', 'ETH', 'Ethiopia', 'إثيوبيا', 'Ethiopian', 'حبشي', '+251', 'ETB', false, false, false, false, 100),
  ('FK', 'FLK', 'Falkland Islands', 'جزر فوكلاند', 'Falkland Islander', 'جزر فوكلاندي', '+500', 'FKP', false, false, false, false, 100),
  ('FO', 'FRO', 'Faroe Islands', 'جزر فارو', 'Faroese', 'فاروي', '+298', 'DKK', false, false, false, false, 100),
  ('FJ', 'FJI', 'Fiji', 'فيجي', 'Fijian', 'فيجي', '+679', 'FJD', false, false, false, false, 100),
  ('FI', 'FIN', 'Finland', 'فنلندا', 'Finnish', 'فنلندي', '+358', 'EUR', false, false, false, false, 100),
  ('FR', 'FRA', 'France', 'فرنسا', 'French', 'فرنسي', '+33', 'EUR', false, false, false, false, 100),
  ('GF', 'GUF', 'French Guiana', 'غويانا', 'Guianan', 'غوياني', '+594', 'EUR', false, false, false, false, 100),
  ('PF', 'PYF', 'French Polynesia', 'بولينزيا الفرنسية', 'French Polynesian', 'بولينزيا الفرنسيةي', '+689', 'XPF', false, false, false, false, 100),
  ('TF', 'ATF', 'French Southern and Antarctic Lands', 'أراض فرنسية جنوبية وأنتارتيكية', 'French', 'فرنسي', '+262', 'EUR', false, false, false, false, 100),
  ('GA', 'GAB', 'Gabon', 'الغابون', 'Gabonese', 'جابوني', '+241', 'XAF', false, false, false, false, 100),
  ('GM', 'GMB', 'Gambia', 'غامبيا', 'Gambian', 'غامبيي', '+220', 'GMD', false, false, false, false, 100),
  ('GE', 'GEO', 'Georgia', 'جورجيا', 'Georgian', 'جورجي', '+995', 'GEL', false, false, false, false, 100),
  ('DE', 'DEU', 'Germany', 'ألمانيا', 'German', 'ألماني', '+49', 'EUR', false, false, false, false, 100),
  ('GH', 'GHA', 'Ghana', 'غانا', 'Ghanaian', 'غاني', '+233', 'GHS', false, false, false, false, 100),
  ('GI', 'GIB', 'Gibraltar', 'جبل طارق', 'Gibraltar', 'جبل طارقي', '+350', 'GIP', false, false, false, false, 100),
  ('GR', 'GRC', 'Greece', 'اليونان', 'Greek', 'إغريقي', '+30', 'EUR', false, false, false, false, 100),
  ('GL', 'GRL', 'Greenland', 'جرينلاند', 'Greenlandic', 'جرينلاندي', '+299', 'DKK', false, false, false, false, 100),
  ('GD', 'GRD', 'Grenada', 'غرينادا', 'Grenadian', 'جرينادي', '+1473', 'XCD', false, false, false, false, 100),
  ('GP', 'GLP', 'Guadeloupe', 'غوادلوب', 'Guadeloupian', 'غوادلوبي', '+590', 'EUR', false, false, false, false, 100),
  ('GU', 'GUM', 'Guam', 'غوام', 'Guamanian', 'غوامي', '+1671', 'USD', false, false, false, false, 100),
  ('GT', 'GTM', 'Guatemala', 'غواتيمالا', 'Guatemalan', 'غواتيمالي', '+502', 'GTQ', false, false, false, false, 100),
  ('GG', 'GGY', 'Guernsey', 'غيرنزي', 'Channel Islander', 'قنالي', '+44', 'GBP', false, false, false, false, 100),
  ('GN', 'GIN', 'Guinea', 'غينيا', 'Guinean', 'غيني', '+224', 'GNF', false, false, false, false, 100),
  ('GW', 'GNB', 'Guinea-Bissau', 'غينيا بيساو', 'Guinea-Bissauan', 'غيني بيساوي', '+245', 'XOF', false, false, false, false, 100),
  ('GY', 'GUY', 'Guyana', 'غيانا', 'Guyanese', 'جوياني', '+592', 'GYD', false, false, false, false, 100),
  ('HT', 'HTI', 'Haiti', 'هايتي', 'Haitian', 'هايتي', '+509', 'HTG', false, false, false, false, 100),
  ('HM', 'HMD', 'Heard Island and McDonald Islands', 'جزيرة هيرد وجزر ماكدونالد', 'Heard and McDonald Islander', 'جزيرة هيرد وجزر ماكدونالدي', NULL, NULL, false, false, false, false, 100),
  ('HN', 'HND', 'Honduras', 'هندوراس', 'Honduran', 'هندوراسي', '+504', 'HNL', false, false, false, false, 100),
  ('HK', 'HKG', 'Hong Kong', 'هونغ كونغ', 'Hong Konger', 'هونغ كونغي', '+852', 'HKD', false, false, false, false, 100),
  ('HU', 'HUN', 'Hungary', 'المجر', 'Hungarian', 'هنغاري', '+36', 'HUF', false, false, false, false, 100),
  ('IS', 'ISL', 'Iceland', 'آيسلندا', 'Icelander', 'إيسلندي', '+354', 'ISK', false, false, false, false, 100),
  ('ID', 'IDN', 'Indonesia', 'إندونيسيا', 'Indonesian', 'إندونيسي', '+62', 'IDR', false, false, false, false, 100),
  ('IR', 'IRN', 'Iran', 'إيران', 'Iranian', 'إيراني', '+98', 'IRR', false, false, false, false, 100),
  ('IE', 'IRL', 'Ireland', 'أيرلندا', 'Irish', 'إيرلندي', '+353', 'EUR', false, false, false, false, 100),
  ('IM', 'IMN', 'Isle of Man', 'جزيرة مان', 'Manx', 'جزيرة ماني', '+44', 'GBP', false, false, false, false, 100),
  ('IL', 'ISR', 'Israel', 'إسرائيل', 'Israeli', 'إسرائيلي', '+972', 'ILS', false, false, false, false, 100),
  ('IT', 'ITA', 'Italy', 'إيطاليا', 'Italian', 'إيطالي', '+39', 'EUR', false, false, false, false, 100),
  ('CI', 'CIV', 'Ivory Coast', 'ساحل العاج', 'Ivorian', 'إفواري', '+225', 'XOF', false, false, false, false, 100),
  ('JM', 'JAM', 'Jamaica', 'جامايكا', 'Jamaican', 'جامايكي', '+1876', 'JMD', false, false, false, false, 100),
  ('JP', 'JPN', 'Japan', 'اليابان', 'Japanese', 'ياباني', '+81', 'JPY', false, false, false, false, 100),
  ('JE', 'JEY', 'Jersey', 'جيرزي', 'Channel Islander', 'قنالي', '+44', 'GBP', false, false, false, false, 100),
  ('KZ', 'KAZ', 'Kazakhstan', 'كازاخستان', 'Kazakhstani', 'كازاخستاني', '+7', 'KZT', false, false, false, false, 100),
  ('KE', 'KEN', 'Kenya', 'كينيا', 'Kenyan', 'كيني', '+254', 'KES', false, false, false, false, 100),
  ('KI', 'KIR', 'Kiribati', 'كيريباتي', 'I-Kiribati', 'كيريباتيي', '+686', 'AUD', false, false, false, false, 100),
  ('XK', 'UNK', 'Kosovo', 'كوسوفو', 'Kosovar', 'كوسوفوي', '+383', 'EUR', false, false, false, false, 100),
  ('KG', 'KGZ', 'Kyrgyzstan', 'قيرغيزستان', 'Kirghiz', 'قيرغيزستاني', '+996', 'KGS', false, false, false, false, 100),
  ('LA', 'LAO', 'Laos', 'لاوس', 'Laotian', 'لاوسي', '+856', 'LAK', false, false, false, false, 100),
  ('LV', 'LVA', 'Latvia', 'لاتفيا', 'Latvian', 'لاتفي', '+371', 'EUR', false, false, false, false, 100),
  ('LS', 'LSO', 'Lesotho', 'ليسوتو', 'Mosotho', 'ليسوتو', '+266', 'LSL', false, false, false, false, 100),
  ('LR', 'LBR', 'Liberia', 'ليبيريا', 'Liberian', 'ليبيري', '+231', 'LRD', false, false, false, false, 100),
  ('LY', 'LBY', 'Libya', 'ليبيا', 'Libyan', 'ليبي', '+218', 'LYD', false, false, false, false, 100),
  ('LI', 'LIE', 'Liechtenstein', 'ليختنشتاين', 'Liechtensteiner', 'ليختنشتايني', '+423', 'CHF', false, false, false, false, 100),
  ('LT', 'LTU', 'Lithuania', 'ليتوانيا', 'Lithuanian', 'لتواني', '+370', 'EUR', false, false, false, false, 100),
  ('LU', 'LUX', 'Luxembourg', 'لوكسمبورغ', 'Luxembourger', 'لكسمبرغي', '+352', 'EUR', false, false, false, false, 100),
  ('MO', 'MAC', 'Macau', 'ماكاو', 'Macanese', 'ماكاوي', '+853', 'MOP', false, false, false, false, 100),
  ('MG', 'MDG', 'Madagascar', 'مدغشقر', 'Malagasy', 'مدغشقري', '+261', 'MGA', false, false, false, false, 100),
  ('MW', 'MWI', 'Malawi', 'مالاوي', 'Malawian', 'مالاوى', '+265', 'MWK', false, false, false, false, 100),
  ('MY', 'MYS', 'Malaysia', 'ماليزيا', 'Malaysian', 'ماليزي', '+60', 'MYR', false, false, false, false, 100),
  ('MV', 'MDV', 'Maldives', 'المالديف', 'Maldivan', 'مالديفي', '+960', 'MVR', false, false, false, false, 100),
  ('ML', 'MLI', 'Mali', 'مالي', 'Malian', 'مالي', '+223', 'XOF', false, false, false, false, 100),
  ('MT', 'MLT', 'Malta', 'مالطا', 'Maltese', 'مالطي', '+356', 'EUR', false, false, false, false, 100),
  ('MH', 'MHL', 'Marshall Islands', 'جزر مارشال', 'Marshallese', 'مارشالي', '+692', 'USD', false, false, false, false, 100),
  ('MQ', 'MTQ', 'Martinique', 'مارتينيك', 'Martinican', 'مارتينيكي', '+596', 'EUR', false, false, false, false, 100),
  ('MR', 'MRT', 'Mauritania', 'موريتانيا', 'Mauritanian', 'موريتاني', '+222', 'MRU', false, false, false, false, 100),
  ('MU', 'MUS', 'Mauritius', 'موريشيوس', 'Mauritian', 'موريشيوسي', '+230', 'MUR', false, false, false, false, 100),
  ('YT', 'MYT', 'Mayotte', 'مايوت', 'Mahoran', 'مايوتي', '+262', 'EUR', false, false, false, false, 100),
  ('MX', 'MEX', 'Mexico', 'المسكيك', 'Mexican', 'مكسيكي', '+52', 'MXN', false, false, false, false, 100),
  ('FM', 'FSM', 'Micronesia', 'ميكرونيسيا', 'Micronesian', 'ميكرونيزي', '+691', NULL, false, false, false, false, 100),
  ('MD', 'MDA', 'Moldova', 'مولدوڤا', 'Moldovan', 'مولدوفي', '+373', 'MDL', false, false, false, false, 100),
  ('MC', 'MCO', 'Monaco', 'موناكو', 'Monegasque', 'موناكوي', '+377', 'EUR', false, false, false, false, 100),
  ('MN', 'MNG', 'Mongolia', 'منغوليا', 'Mongolian', 'منغولي', '+976', 'MNT', false, false, false, false, 100),
  ('ME', 'MNE', 'Montenegro', 'الجبل الاسود', 'Montenegrin', 'مونتينيغري', '+382', 'EUR', false, false, false, false, 100),
  ('MS', 'MSR', 'Montserrat', 'مونتسرات', 'Montserratian', 'مونتسراتي', '+1664', 'XCD', false, false, false, false, 100),
  ('MA', 'MAR', 'Morocco', 'المغرب', 'Moroccan', 'مغربي', '+212', 'MAD', false, false, false, false, 100),
  ('MZ', 'MOZ', 'Mozambique', 'موزمبيق', 'Mozambican', 'موزمبيقي', '+258', 'MZN', false, false, false, false, 100),
  ('MM', 'MMR', 'Myanmar', 'ميانمار', 'Burmese', 'بورمي', '+95', 'MMK', false, false, false, false, 100),
  ('NA', 'NAM', 'Namibia', 'ناميبيا', 'Namibian', 'ناميبي', '+264', 'NAD', false, false, false, false, 100),
  ('NR', 'NRU', 'Nauru', 'ناورو', 'Nauruan', 'ناورو', '+674', 'AUD', false, false, false, false, 100),
  ('NP', 'NPL', 'Nepal', 'نيبال', 'Nepalese', 'نيبالي', '+977', 'NPR', false, false, false, false, 100),
  ('NL', 'NLD', 'Netherlands', 'هولندا', 'Dutch', 'هولندي', '+31', 'EUR', false, false, false, false, 100),
  ('NC', 'NCL', 'New Caledonia', 'كاليدونيا الجديدة', 'New Caledonian', 'كاليدونيا الجديدةي', '+687', 'XPF', false, false, false, false, 100),
  ('NZ', 'NZL', 'New Zealand', 'نيوزيلندا', 'New Zealander', 'نيوزيلندي', '+64', 'NZD', false, false, false, false, 100),
  ('NI', 'NIC', 'Nicaragua', 'نيكاراغوا', 'Nicaraguan', 'نيكاراغوا', '+505', 'NIO', false, false, false, false, 100),
  ('NE', 'NER', 'Niger', 'النيجر', 'Nigerien', 'نيجري', '+227', 'XOF', false, false, false, false, 100),
  ('NG', 'NGA', 'Nigeria', 'نيجيريا', 'Nigerian', 'نيجيري', '+234', 'NGN', false, false, false, false, 100),
  ('NU', 'NIU', 'Niue', 'نييوي', 'Niuean', 'نييويي', '+683', 'NZD', false, false, false, false, 100),
  ('NF', 'NFK', 'Norfolk Island', 'جزيرة نورفولك', 'Norfolk Islander', 'جزيرة نورفولكي', '+672', 'AUD', false, false, false, false, 100),
  ('KP', 'PRK', 'North Korea', 'كوريا الشمالية', 'North Korean', 'كوري شمالي', '+850', 'KPW', false, false, false, false, 100),
  ('MK', 'MKD', 'North Macedonia', 'شمال مقدونيا', 'Macedonian', 'مقدوني', '+389', 'MKD', false, false, false, false, 100),
  ('MP', 'MNP', 'Northern Mariana Islands', 'جزر ماريانا الشمالية', 'American', 'أمريكي', '+1670', 'USD', false, false, false, false, 100),
  ('NO', 'NOR', 'Norway', 'النرويج', 'Norwegian', 'نرويجي', '+47', 'NOK', false, false, false, false, 100),
  ('PW', 'PLW', 'Palau', 'بالاو', 'Palauan', 'بالاوي', '+680', 'USD', false, false, false, false, 100),
  ('PS', 'PSE', 'Palestine', 'فلسطين', 'Palestinian', 'فلسطيني', '+970', 'EGP', false, false, false, false, 100),
  ('PA', 'PAN', 'Panama', 'بنما', 'Panamanian', 'بنمي', '+507', 'PAB', false, false, false, false, 100),
  ('PG', 'PNG', 'Papua New Guinea', 'بابوا غينيا الجديدة', 'Papua New Guinean', 'بابوا غينيا الجديدة', '+675', 'PGK', false, false, false, false, 100),
  ('PY', 'PRY', 'Paraguay', 'باراغواي', 'Paraguayan', 'باراغواياني', '+595', 'PYG', false, false, false, false, 100),
  ('PE', 'PER', 'Peru', 'بيرو', 'Peruvian', 'بيروفي', '+51', 'PEN', false, false, false, false, 100),
  ('PH', 'PHL', 'Philippines', 'الفلبين', 'Filipino', 'فلبيني', '+63', 'PHP', false, false, false, false, 100),
  ('PN', 'PCN', 'Pitcairn Islands', 'جزر بيتكيرن', 'Pitcairn Islander', 'بيتكيرني', '+64', 'NZD', false, false, false, false, 100),
  ('PL', 'POL', 'Poland', 'بولندا', 'Polish', 'بولندي', '+48', 'PLN', false, false, false, false, 100),
  ('PT', 'PRT', 'Portugal', 'البرتغال', 'Portuguese', 'برتغالي', '+351', 'EUR', false, false, false, false, 100),
  ('PR', 'PRI', 'Puerto Rico', 'بويرتوريكو', 'Puerto Rican', 'بويرتوريكوي', '+1', 'USD', false, false, false, false, 100),
  ('RO', 'ROU', 'Romania', 'رومانيا', 'Romanian', 'روماني', '+40', 'RON', false, false, false, false, 100),
  ('RU', 'RUS', 'Russia', 'روسيا', 'Russian', 'روسي', '+7', 'RUB', false, false, false, false, 100),
  ('RW', 'RWA', 'Rwanda', 'رواندا', 'Rwandan', 'رواندي', '+250', 'RWF', false, false, false, false, 100),
  ('RE', 'REU', 'Réunion', 'لا ريونيون', 'Réunionese', 'ريونيوني', '+262', 'EUR', false, false, false, false, 100),
  ('BL', 'BLM', 'Saint Barthélemy', 'سان بارتليمي', 'Saint Barthélemy Islander', 'بارتليمي', '+590', 'EUR', false, false, false, false, 100),
  ('SH', 'SHN', 'Saint Helena, Ascension and Tristan da Cunha', 'سانت هيلينا وأسينشين وتريستان دا كونا', 'Saint Helenian', 'سانت هيليني', '+2', 'GBP', false, false, false, false, 100),
  ('KN', 'KNA', 'Saint Kitts and Nevis', 'سانت كيتس ونيفيس', 'Kittitian or Nevisian', 'كيتيسي', '+1869', 'XCD', false, false, false, false, 100),
  ('LC', 'LCA', 'Saint Lucia', 'سانت لوسيا', 'Saint Lucian', 'سانت لوسي', '+1758', 'XCD', false, false, false, false, 100),
  ('MF', 'MAF', 'Saint Martin', 'سانت مارتن', 'Saint Martin Islander', 'مارتني', '+590', 'EUR', false, false, false, false, 100),
  ('PM', 'SPM', 'Saint Pierre and Miquelon', 'سان بيير وميكلون', 'Saint-Pierrais, Miquelonnais', 'سان بييري', '+508', 'EUR', false, false, false, false, 100),
  ('VC', 'VCT', 'Saint Vincent and the Grenadines', 'سانت فينسنت والغرينادين', 'Saint Vincentian', 'سانت فينسنتي', '+1784', 'XCD', false, false, false, false, 100),
  ('WS', 'WSM', 'Samoa', 'ساموا', 'Samoan', 'ساموايان', '+685', 'WST', false, false, false, false, 100),
  ('SM', 'SMR', 'San Marino', 'سان مارينو', 'Sammarinese', 'سان مارينوي', '+378', 'EUR', false, false, false, false, 100),
  ('SN', 'SEN', 'Senegal', 'السنغال', 'Senegalese', 'سنغالي', '+221', 'XOF', false, false, false, false, 100),
  ('RS', 'SRB', 'Serbia', 'صيربيا', 'Serbian', 'صربي', '+381', 'RSD', false, false, false, false, 100),
  ('SC', 'SYC', 'Seychelles', 'سيشل', 'Seychellois', 'سيشلي', '+248', 'SCR', false, false, false, false, 100),
  ('SL', 'SLE', 'Sierra Leone', 'سيراليون', 'Sierra Leonean', 'سيراليوني', '+232', 'SLL', false, false, false, false, 100),
  ('SG', 'SGP', 'Singapore', 'سنغافورة', 'Singaporean', 'سنغافوري', '+65', 'SGD', false, false, false, false, 100),
  ('SX', 'SXM', 'Sint Maarten', 'سينت مارتن', 'St. Maartener', 'سنت مارتني', '+1721', 'ANG', false, false, false, false, 100),
  ('SK', 'SVK', 'Slovakia', 'سلوفاكيا', 'Slovak', 'سلوفاكي', '+421', 'EUR', false, false, false, false, 100),
  ('SI', 'SVN', 'Slovenia', 'سلوفينيا', 'Slovene', 'سلوفيني', '+386', 'EUR', false, false, false, false, 100),
  ('SB', 'SLB', 'Solomon Islands', 'جزر سليمان', 'Solomon Islander', 'سليماني', '+677', 'SBD', false, false, false, false, 100),
  ('SO', 'SOM', 'Somalia', 'الصومال', 'Somali', 'صومالي', '+252', 'SOS', false, false, false, false, 100),
  ('ZA', 'ZAF', 'South Africa', 'جنوب أفريقيا', 'South African', 'جنوب افريقيي', '+27', 'ZAR', false, false, false, false, 100),
  ('GS', 'SGS', 'South Georgia', 'جورجيا الجنوبية', 'South Georgian South Sandwich Islander', 'جورجي جنوبي', '+500', 'SHP', false, false, false, false, 100),
  ('KR', 'KOR', 'South Korea', 'كوريا الجنوبية', 'South Korean', 'كوري جنوبي', '+82', 'KRW', false, false, false, false, 100),
  ('SS', 'SSD', 'South Sudan', 'جنوب السودان', 'South Sudanese', 'جنوب السوداني', '+211', 'SSP', false, false, false, false, 100),
  ('ES', 'ESP', 'Spain', 'إسبانيا', 'Spanish', 'إسباني', '+34', 'EUR', false, false, false, false, 100),
  ('LK', 'LKA', 'Sri Lanka', 'سريلانكا', 'Sri Lankan', 'سري لانكي', '+94', 'LKR', false, false, false, false, 100),
  ('SD', 'SDN', 'Sudan', 'السودان', 'Sudanese', 'سوداني', '+249', 'SDG', false, false, false, false, 100),
  ('SR', 'SUR', 'Suriname', 'سورينام', 'Surinamer', 'سورينامي', '+597', 'SRD', false, false, false, false, 100),
  ('SJ', 'SJM', 'Svalbard and Jan Mayen', 'سفالبارد ويان ماين', 'Norwegian', 'نرويجي', '+4779', 'NOK', false, false, false, false, 100),
  ('SE', 'SWE', 'Sweden', 'السويد', 'Swedish', 'سويدي', '+46', 'SEK', false, false, false, false, 100),
  ('CH', 'CHE', 'Switzerland', 'سويسرا', 'Swiss', 'سويسري', '+41', 'CHF', false, false, false, false, 100),
  ('ST', 'STP', 'São Tomé and Príncipe', 'ساو تومي وبرينسيب', 'Sao Tomean', 'ساو توميان', '+239', 'STN', false, false, false, false, 100),
  ('TW', 'TWN', 'Taiwan', 'تايوان', 'Taiwanese', 'تايواني', '+886', 'TWD', false, false, false, false, 100),
  ('TJ', 'TJK', 'Tajikistan', 'طاجيكستان', 'Tadzhik', 'طاجيكستاني', '+992', 'TJS', false, false, false, false, 100),
  ('TZ', 'TZA', 'Tanzania', 'تنزانيا', 'Tanzanian', 'تنزاني', '+255', 'TZS', false, false, false, false, 100),
  ('TH', 'THA', 'Thailand', 'تايلند', 'Thai', 'التايلاندي', '+66', 'THB', false, false, false, false, 100),
  ('TL', 'TLS', 'Timor-Leste', 'تيمور الشرقية', 'East Timorese', 'تيموري', '+670', 'USD', false, false, false, false, 100),
  ('TG', 'TGO', 'Togo', 'توغو', 'Togolese', 'توغواني', '+228', 'XOF', false, false, false, false, 100),
  ('TK', 'TKL', 'Tokelau', 'توكيلاو', 'Tokelauan', 'توكيلاوي', '+690', 'NZD', false, false, false, false, 100),
  ('TO', 'TON', 'Tonga', 'تونغا', 'Tongan', 'تونجاني', '+676', 'TOP', false, false, false, false, 100),
  ('TT', 'TTO', 'Trinidad and Tobago', 'ترينيداد وتوباغو', 'Trinidadian', 'ترينيدادي', '+1868', 'TTD', false, false, false, false, 100),
  ('TN', 'TUN', 'Tunisia', 'تونس', 'Tunisian', 'تونسي', '+216', 'TND', false, false, false, false, 100),
  ('TM', 'TKM', 'Turkmenistan', 'تركمانستان', 'Turkmen', 'تركمانستاني', '+993', 'TMT', false, false, false, false, 100),
  ('TC', 'TCA', 'Turks and Caicos Islands', 'جزر توركس وكايكوس', 'Turks and Caicos Islander', 'تركاوي', '+1649', 'USD', false, false, false, false, 100),
  ('TV', 'TUV', 'Tuvalu', 'توفالو', 'Tuvaluan', 'توفالي', '+688', 'AUD', false, false, false, false, 100),
  ('TR', 'TUR', 'Türkiye', 'تركيا', 'Turkish', 'تركي', '+90', 'TRY', false, false, false, false, 100),
  ('UG', 'UGA', 'Uganda', 'أوغندا', 'Ugandan', 'أوغندي', '+256', 'UGX', false, false, false, false, 100),
  ('UA', 'UKR', 'Ukraine', 'أوكرانيا', 'Ukrainian', 'أوكراني', '+380', 'UAH', false, false, false, false, 100),
  ('US', 'USA', 'United States', 'الولايات المتحدة', 'American', 'أمريكي', '+1', 'USD', false, false, false, false, 100),
  ('UM', 'UMI', 'United States Minor Outlying Islands', 'جزر الولايات المتحدة الصغيرة النائية', 'American Islander', 'جزر الولايات المتحدة الصغيرة النائيةي', NULL, 'USD', false, false, false, false, 100),
  ('VI', 'VIR', 'United States Virgin Islands', 'جزر العذراء الامريكية', 'Virgin Islander', 'عذرائي', '+1340', 'USD', false, false, false, false, 100),
  ('UY', 'URY', 'Uruguay', 'الأوروغواي', 'Uruguayan', 'أوروجواي', '+598', 'UYU', false, false, false, false, 100),
  ('UZ', 'UZB', 'Uzbekistan', 'أوزباكستان', 'Uzbekistani', 'أوزبكستاني', '+998', 'UZS', false, false, false, false, 100),
  ('VU', 'VUT', 'Vanuatu', 'فانواتو', 'Ni-Vanuatu', 'فانواتي', '+678', 'VUV', false, false, false, false, 100),
  ('VA', 'VAT', 'Vatican City', 'مدينة الفاتيكان', 'Vatican', 'مدينة الفاتيكاني', '+3', 'EUR', false, false, false, false, 100),
  ('VE', 'VEN', 'Venezuela', 'فنزويلا', 'Venezuelan', 'فنزويلي', '+58', 'VES', false, false, false, false, 100),
  ('VN', 'VNM', 'Vietnam', 'فيتنام', 'Vietnamese', 'فيتنامي', '+84', 'VND', false, false, false, false, 100),
  ('WF', 'WLF', 'Wallis and Futuna', 'واليس وفوتونا', 'Wallis and Futuna Islander', 'واليسي', '+681', 'XPF', false, false, false, false, 100),
  ('EH', 'ESH', 'Western Sahara', 'الصحراء الغربية', 'Sahrawi', 'صحراوي', '+2', 'DZD', false, false, false, false, 100),
  ('YE', 'YEM', 'Yemen', 'اليمن', 'Yemeni', 'اليمني', '+967', 'YER', false, false, false, false, 100),
  ('ZM', 'ZMB', 'Zambia', 'زامبيا', 'Zambian', 'زامبي', '+260', 'ZMW', false, false, false, false, 100),
  ('ZW', 'ZWE', 'Zimbabwe', 'زيمبابوي', 'Zimbabwean', 'زيمبابوي', '+263', 'BWP', false, false, false, false, 100),
  ('AX', 'ALA', 'Åland Islands', 'جزر أولاند', 'Ålandish', 'أولاندي', '+35818', 'EUR', false, false, false, false, 100),
  ('GB', 'GBR', 'United Kingdom', 'المملكة المتحدة', 'British', 'بريطاني', '+44', 'GBP', false, false, false, false, 110),
  ('IN', 'IND', 'India', 'الهند', 'Indian', 'هندي', '+91', 'INR', false, false, false, false, 120),
  ('PK', 'PAK', 'Pakistan', 'باكستان', 'Pakistani', 'باكستاني', '+92', 'PKR', false, false, false, false, 130),
  ('EG', 'EGY', 'Egypt', 'مصر', 'Egyptian', 'مصري', '+20', 'EGP', false, false, false, false, 140),
  ('JO', 'JOR', 'Jordan', 'الأردن', 'Jordanian', 'أردني', '+962', 'JOD', false, false, false, false, 150),
  ('LB', 'LBN', 'Lebanon', 'لبنان', 'Lebanese', 'لبناني', '+961', 'LBP', false, false, false, false, 160),
  ('SY', 'SYR', 'Syria', 'سوريا', 'Syrian', 'سوري', '+963', 'SYP', false, false, false, false, 170),
  ('IQ', 'IRQ', 'Iraq', 'العراق', 'Iraqi', 'عراقي', '+964', 'IQD', false, false, false, false, 180)
ON CONFLICT (country_code) DO UPDATE SET
  iso3_code = EXCLUDED.iso3_code,
  name_en = EXCLUDED.name_en,
  name_ar = COALESCE(countries.name_ar, EXCLUDED.name_ar),
  nationality_en = EXCLUDED.nationality_en,
  nationality_ar = COALESCE(countries.nationality_ar, EXCLUDED.nationality_ar),
  phone_code = COALESCE(countries.phone_code, EXCLUDED.phone_code),
  default_currency_code = COALESCE(countries.default_currency_code, EXCLUDED.default_currency_code),
  is_gcc = EXCLUDED.is_gcc,
  is_uae = EXCLUDED.is_uae,
  updated_at = now();
```
