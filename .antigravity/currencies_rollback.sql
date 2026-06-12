-- Rollback script to revert currency insertions
-- Keeps only the original seed/existing currencies: AED, USD, EUR, GBP, SAR, QAR, OMR, BHD, KWD, INR, JRD
BEGIN;

DELETE FROM public.currencies
WHERE currency_code NOT IN ('AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'OMR', 'BHD', 'KWD', 'INR', 'JRD');

COMMIT;
