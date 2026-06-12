-- Rollback script to revert bank insertions
-- Keeps only the original 5 seed banks: FAB, ENBD, ADCB, DIB, MASHREQ
BEGIN;

DELETE FROM public.banks
WHERE bank_code NOT IN ('FAB', 'ENBD', 'ADCB', 'DIB', 'MASHREQ');

COMMIT;
