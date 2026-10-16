import {z} from 'zod';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const name=z.string().trim().min(2,'English name is required (minimum 2 characters)').max(255);
const optionalText=(max:number)=>z.string().trim().max(max).nullable().optional();
const countryId=id.nullable().optional();
const code=z.string().regex(/^[A-Z0-9_]{2,100}$/,'Use 2–100 uppercase letters, numbers or underscores.');
const common={name_en:name,name_ar:optionalText(255),sort_order:z.number().int().min(0).max(2147483647).optional(),is_active:z.boolean().optional()};
const countryFields={...common,nationality_en:z.string().trim().min(2,'English nationality is required').max(100),nationality_ar:optionalText(100),
 phone_code:optionalText(10),default_currency_code:z.string().regex(/^[A-Z]{3}$/,'Use a three-letter currency code.').nullable().optional(),
 is_gcc:z.boolean().optional(),is_uae:z.boolean().optional()};
const regionFields={...common,abbreviation_en:z.string().trim().min(1,'English abbreviation is required').max(20),abbreviation_ar:optionalText(20),country_id:countryId,region_type_code:optionalText(50)};
const cityFields={...common,emirate_id:id,country_id:countryId};
const areaFields={...common,city_id:id,area_type_code:optionalText(50)};
const portFields={...common,emirate_id:id,country_id:countryId,port_type_code:z.string().trim().min(1,'Port type is required').max(50),
 icao_code:z.string().regex(/^[A-Z]{4}$/,'Use four uppercase ICAO letters.').nullable().optional(),
 iata_code:z.string().regex(/^[A-Z]{3}$/,'Use three uppercase IATA letters.').nullable().optional()};

export const createCountrySchema=z.object({country_code:z.string().regex(/^[A-Z]{2}$/,'Use two uppercase country letters.'),iso3_code:z.string().regex(/^[A-Z]{3}$/,'Use three uppercase ISO letters.'),...countryFields}).strict();
export const updateCountrySchema=z.object(countryFields).partial().extend({id}).strict();
export const createEmirateSchema=z.object({emirate_code:z.string().regex(/^[A-Z]{3}$/,'Use three uppercase region letters.'),...regionFields}).strict();
export const updateEmirateSchema=z.object(regionFields).partial().extend({id}).strict();
export const createCitySchema=z.object({city_code:code,...cityFields}).strict();
export const updateCitySchema=z.object(cityFields).partial().extend({id}).strict();
export const createAreaZoneSchema=z.object({area_code:code,...areaFields}).strict();
export const updateAreaZoneSchema=z.object(areaFields).partial().extend({id}).strict();
export const createPortSchema=z.object({port_code:code,...portFields}).strict();
export const updatePortSchema=z.object(portFields).partial().extend({id}).strict();
export const toggleGeographyStatusSchema=z.object({id,is_active:z.boolean(),deactivation_reason:optionalText(500)}).strict();
export const toggleGeographyLockSchema=z.object({id,is_locked:z.boolean()}).strict();
export type CreateCountryInput=z.infer<typeof createCountrySchema>;
export type UpdateCountryInput=z.infer<typeof updateCountrySchema>;
export type CreateEmirateInput=z.infer<typeof createEmirateSchema>;
export type UpdateEmirateInput=z.infer<typeof updateEmirateSchema>;
export type CreateCityInput=z.infer<typeof createCitySchema>;
export type UpdateCityInput=z.infer<typeof updateCitySchema>;
export type CreateAreaZoneInput=z.infer<typeof createAreaZoneSchema>;
export type UpdateAreaZoneInput=z.infer<typeof updateAreaZoneSchema>;
export type CreatePortInput=z.infer<typeof createPortSchema>;
export type UpdatePortInput=z.infer<typeof updatePortSchema>;
export type ToggleGeographyStatusInput=z.infer<typeof toggleGeographyStatusSchema>;
export type ToggleGeographyLockInput=z.infer<typeof toggleGeographyLockSchema>;
