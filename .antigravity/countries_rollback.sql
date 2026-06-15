-- Rollback script to revert country insertions
-- Keeps only the original 15 seed countries: AE, SA, KW, QA, BH, OM, US, GB, IN, PK, EG, JO, LB, SY, IQ
BEGIN;

DELETE FROM public.countries
WHERE country_code NOT IN ('AE', 'SA', 'KW', 'QA', 'BH', 'OM', 'US', 'GB', 'IN', 'PK', 'EG', 'JO', 'LB', 'SY', 'IQ');

COMMIT;
