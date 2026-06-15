-- ERP GLOBAL CLEANUP.1 — Drop legacy Customer module tables
--
-- Dependency audit result (2026-06-14):
--   customers          → only outbound FKs to shared lookup tables (safe to drop)
--   customer_contacts  → FK to customers only (safe to drop)
--   customer_addresses → FK to customers + shared geography (safe to drop)
--   customer_bank_details → FK to customers + shared finance tables (safe to drop)
--   customer_documents → FK to customers + user_profiles (safe to drop)
--
-- Tables RETAINED (active Party Master dependencies):
--   customer_categories → referenced by party_customer_profiles.customer_category_id
--   customer_statuses   → referenced by party_customer_profiles.customer_status_id
--
-- No views, functions, or triggers depend on the dropped tables.
-- All customer data is confirmed test data only (confirmed by Sameer).
-- Active customer management is via Party Master (/admin/master-data/parties/customers).

drop table if exists customer_documents;
drop table if exists customer_bank_details;
drop table if exists customer_addresses;
drop table if exists customer_contacts;
drop table if exists customers;
