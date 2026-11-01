export type NationalityCountry = {
  id: number; name_en: string; name_ar: string | null;
  nationality_en: string; nationality_ar: string | null;
  country_code: string; iso3_code: string;
};
const normalize = (text: string) => text.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/[.\s]+/g, ' ');
/** Exact master-data names, demonyms and codes only; never match a prefix or
 * guess a country from a person's name or their document's issuing country. */
export function matchDocumentNationality(value: string, countries: readonly NationalityCountry[]): NationalityCountry | null {
  const hint = normalize(value);
  if (!hint) return null;
  const matches = countries.filter(country => [country.name_en, country.name_ar, country.nationality_en,
    country.nationality_ar, country.country_code, country.iso3_code].some(alias => alias && normalize(alias) === hint));
  return matches.length === 1 ? matches[0] : null;
}
