-- Fix: Resync MASTER_PARTY and MASTER_PARTY_ADDRESS numbering counters
-- Root cause: Antigravity seeded 83 parties and 1 address directly into the DB,
-- bypassing generateNextReference(). The counters were not incremented,
-- causing "duplicate key value violates unique constraint parties_party_code_uq"
-- when creating new parties via the UI.
--
-- Diagnosis:
--   MASTER_PARTY         counter=63, actual max party_code seq=83
--   MASTER_PARTY_ADDRESS counter=0,  actual max address_code seq=54

UPDATE global_numbering_rules
SET
  current_sequence_number = 83,
  next_sequence_number    = 84,
  updated_at              = now()
WHERE rule_code = 'MASTER_PARTY';

UPDATE global_numbering_rules
SET
  current_sequence_number = 54,
  next_sequence_number    = 55,
  updated_at              = now()
WHERE rule_code = 'MASTER_PARTY_ADDRESS';
