-- =============================================================================
-- REVIEW ONLY
-- DO NOT APPLY
-- DO NOT RUN AGAINST LIVE SUPABASE
-- DO NOT PLACE IN ACTIVE MIGRATIONS FOLDER
-- FOR SAMEER REVIEW ONLY
-- =============================================================================
-- ERP BASE 002F.5A V3 — Party Master Draft Migration
-- Generated: 2026-06-13
-- Phase: ERP BASE 002F.5A — Clean Unified Party Master Foundation
-- Version: V3-SUPABASE-VERIFIED (Supabase integrity-reviewed package)
-- =============================================================================
-- SUPABASE INTEGRITY REVIEW — 2026-06-13
-- Project: https://mmiefuieduzdiiwnqpie.supabase.co (CONFIRMED)
-- Tool: user-supabase MCP (execute_sql)
-- Status: PASS WITH FIXES
--
-- Corrections applied from original V3:
--   1. [CRITICAL] party_finance_profiles: payment_hold → finance_hold (4 fields)
--   2. [CRITICAL] permissions INSERT: added action_code (NOT NULL column in live schema)
--   3. [CRITICAL] role_permissions: viewer → read_only_user (live role code)
--   4. [IMPORTANT] party_notes RLS SELECT: uses current_user_profile_id() (live function)
--
-- All other V3 content verified correct against live schema.
-- FK targets, helper functions, numbering columns, RBAC structure: all confirmed.
-- =============================================================================
-- BEFORE APPLYING:
--   1. Get Sameer explicit written approval on V3 review package.
--   2. Verify all referenced existing tables exist (countries, emirates, cities,
--      areas_zones, currencies, payment_terms, tax_types, banks, user_profiles,
--      global_numbering_rules, permissions, roles, role_permissions, audit_logs).
--   3. Create a full Supabase backup.
--   4. Test in staging environment first.
--   5. Run inside a transaction with ROLLBACK SAVEPOINT strategy.
-- =============================================================================

-- =============================================================================
-- SECTION 0: EXTENSIONS (review only — verify with Supabase support)
-- =============================================================================

-- REVIEW ONLY: pg_trgm required for fuzzy duplicate detection (similar names).
-- Verify with Supabase support before applying.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- SECTION 1: PARTY TYPE MASTER
-- =============================================================================

CREATE TABLE IF NOT EXISTS party_types (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_code     TEXT NOT NULL,
  type_name     TEXT NOT NULL,
  type_name_ar  TEXT,
  description   TEXT,
  icon_name     TEXT,
  color_token   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_types_type_code_uq UNIQUE (type_code),
  CONSTRAINT party_types_type_code_upper CHECK (type_code = upper(type_code))
);

CREATE INDEX IF NOT EXISTS idx_party_types_type_code   ON party_types (type_code);
CREATE INDEX IF NOT EXISTS idx_party_types_is_active   ON party_types (is_active);
CREATE INDEX IF NOT EXISTS idx_party_types_sort_order  ON party_types (sort_order);

-- =============================================================================
-- SECTION 2: PARTY-SPECIFIC LOOKUP MASTER TABLES (17 tables)
-- Standard structure: id, code, name_en, name_ar, description, is_system,
--                     is_active, sort_order, created_at/by, updated_at/by
-- =============================================================================

CREATE TABLE IF NOT EXISTS party_natures (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nature_code TEXT NOT NULL CONSTRAINT party_natures_code_uq UNIQUE,
  name_en     TEXT NOT NULL,
  name_ar     TEXT,
  description TEXT,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_party_natures_code      ON party_natures (nature_code);
CREATE INDEX IF NOT EXISTS idx_party_natures_is_active ON party_natures (is_active);

-- ----

CREATE TABLE IF NOT EXISTS party_statuses (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_code  TEXT NOT NULL CONSTRAINT party_statuses_code_uq UNIQUE,
  name_en      TEXT NOT NULL,
  name_ar      TEXT,
  description  TEXT,
  is_system    BOOLEAN NOT NULL DEFAULT false,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_party_statuses_code ON party_statuses (status_code);

-- ----

CREATE TABLE IF NOT EXISTS party_license_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_type_code TEXT NOT NULL CONSTRAINT party_license_types_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_party_license_types_code ON party_license_types (license_type_code);

-- ----

CREATE TABLE IF NOT EXISTS party_license_statuses (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_status_code  TEXT NOT NULL CONSTRAINT party_license_statuses_code_uq UNIQUE,
  name_en              TEXT NOT NULL,
  name_ar              TEXT,
  description          TEXT,
  is_system            BOOLEAN NOT NULL DEFAULT false,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_tax_statuses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_status_code TEXT NOT NULL CONSTRAINT party_tax_statuses_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_contact_roles (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_role_code   TEXT NOT NULL CONSTRAINT party_contact_roles_code_uq UNIQUE,
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  description         TEXT,
  is_system           BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_contact_departments (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_department_code   TEXT NOT NULL CONSTRAINT party_contact_departments_code_uq UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  description               TEXT,
  is_system                 BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_address_types (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address_type_code   TEXT NOT NULL CONSTRAINT party_address_types_code_uq UNIQUE,
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  description         TEXT,
  is_system           BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_document_types (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_type_code    TEXT NOT NULL CONSTRAINT party_document_types_code_uq UNIQUE,
  name_en               TEXT NOT NULL,
  name_ar               TEXT,
  description           TEXT,
  is_system             BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_document_statuses (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_status_code    TEXT NOT NULL CONSTRAINT party_document_statuses_code_uq UNIQUE,
  name_en                 TEXT NOT NULL,
  name_ar                 TEXT,
  description             TEXT,
  is_system               BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_compliance_statuses (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  compliance_status_code    TEXT NOT NULL CONSTRAINT party_compliance_statuses_code_uq UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  description               TEXT,
  is_system                 BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_approval_statuses (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  approval_status_code    TEXT NOT NULL CONSTRAINT party_approval_statuses_code_uq UNIQUE,
  name_en                 TEXT NOT NULL,
  name_ar                 TEXT,
  description             TEXT,
  is_system               BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  sort_order              INTEGER NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_blacklist_statuses (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  blacklist_status_code     TEXT NOT NULL CONSTRAINT party_blacklist_statuses_code_uq UNIQUE,
  name_en                   TEXT NOT NULL,
  name_ar                   TEXT,
  description               TEXT,
  is_system                 BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_risk_ratings (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_rating_code    TEXT NOT NULL CONSTRAINT party_risk_ratings_code_uq UNIQUE,
  name_en             TEXT NOT NULL,
  name_ar             TEXT,
  description         TEXT,
  is_system           BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_credit_ratings (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  credit_rating_code    TEXT NOT NULL CONSTRAINT party_credit_ratings_code_uq UNIQUE,
  name_en               TEXT NOT NULL,
  name_ar               TEXT,
  description           TEXT,
  is_system             BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS party_note_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note_type_code  TEXT NOT NULL CONSTRAINT party_note_types_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS payment_methods (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method_code     TEXT NOT NULL CONSTRAINT payment_methods_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- =============================================================================
-- SECTION 3: ROLE-PROFILE LOOKUP MASTER TABLES (14 tables)
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT customer_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS customer_statuses (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_code   TEXT NOT NULL CONSTRAINT customer_statuses_code_uq UNIQUE,
  name_en       TEXT NOT NULL,
  name_ar       TEXT,
  description   TEXT,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS invoice_methods (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  method_code     TEXT NOT NULL CONSTRAINT invoice_methods_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS vendor_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT vendor_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS vendor_ratings (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rating_code     TEXT NOT NULL CONSTRAINT vendor_ratings_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS procurement_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT procurement_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS subcontractor_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT subcontractor_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS work_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT work_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS consultant_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type_code       TEXT NOT NULL CONSTRAINT consultant_types_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS consultant_specializations (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialization_code   TEXT NOT NULL CONSTRAINT consultant_specializations_code_uq UNIQUE,
  name_en               TEXT NOT NULL,
  name_ar               TEXT,
  description           TEXT,
  is_system             BOOLEAN NOT NULL DEFAULT false,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS recruitment_categories (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code   TEXT NOT NULL CONSTRAINT recruitment_categories_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS authority_types (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  authority_code  TEXT NOT NULL CONSTRAINT authority_types_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS industry_sectors (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sector_code     TEXT NOT NULL CONSTRAINT industry_sectors_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- ----

CREATE TABLE IF NOT EXISTS sales_regions (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  region_code     TEXT NOT NULL CONSTRAINT sales_regions_code_uq UNIQUE,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  description     TEXT,
  is_system       BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- =============================================================================
-- SECTION 4: SERVICE AND RELATIONSHIP MASTERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS party_service_categories_master (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_code     TEXT NOT NULL CONSTRAINT party_service_cats_code_uq UNIQUE,
  category_name_en  TEXT NOT NULL,
  category_name_ar  TEXT,
  parent_category_id BIGINT REFERENCES party_service_categories_master(id) ON DELETE SET NULL,
  description       TEXT,
  is_system         BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_party_svc_cats_parent ON party_service_categories_master (parent_category_id);
CREATE INDEX IF NOT EXISTS idx_party_svc_cats_active ON party_service_categories_master (is_active);

-- ----

CREATE TABLE IF NOT EXISTS party_relationship_types (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  relationship_code TEXT NOT NULL CONSTRAINT party_rel_types_code_uq UNIQUE,
  name_en           TEXT NOT NULL,
  name_ar           TEXT,
  description       TEXT,
  is_system         BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by        BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

-- =============================================================================
-- SECTION 5: CORE — parties
-- =============================================================================

CREATE TABLE IF NOT EXISTS parties (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_code             TEXT NOT NULL,
  display_name           TEXT NOT NULL,
  legal_name_en          TEXT NOT NULL,
  legal_name_ar          TEXT,
  trade_name_en          TEXT,
  trade_name_ar          TEXT,
  short_name             TEXT,
  party_nature_id        BIGINT NOT NULL REFERENCES party_natures(id) ON DELETE RESTRICT,
  primary_party_type_id  BIGINT REFERENCES party_types(id) ON DELETE SET NULL,
  parent_party_id        BIGINT REFERENCES parties(id) ON DELETE SET NULL,
  main_phone             TEXT,
  main_mobile            TEXT,
  whatsapp               TEXT,
  main_email             TEXT,
  alternate_email        TEXT,
  website                TEXT,
  country_id             BIGINT NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  emirate_id             BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  city_id                BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  area_zone_id           BIGINT REFERENCES areas_zones(id) ON DELETE SET NULL,
  po_box                 TEXT,
  full_address_text      TEXT,
  google_map_url         TEXT,
  latitude               NUMERIC(10,8),
  longitude              NUMERIC(11,8),
  party_status_id        BIGINT NOT NULL REFERENCES party_statuses(id) ON DELETE RESTRICT,
  is_active              BOOLEAN NOT NULL DEFAULT true,
  is_locked              BOOLEAN NOT NULL DEFAULT false,
  is_system              BOOLEAN NOT NULL DEFAULT false,
  remarks                TEXT,
  deactivated_at         TIMESTAMPTZ,
  deactivated_by         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  deactivation_reason    TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by             BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT parties_party_code_uq UNIQUE (party_code),
  CONSTRAINT parties_no_self_parent CHECK (parent_party_id != id),
  CONSTRAINT parties_main_email_format CHECK (main_email IS NULL OR main_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT parties_alt_email_format CHECK (alternate_email IS NULL OR alternate_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  CONSTRAINT parties_latitude_range CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT parties_longitude_range CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_party_code      ON parties (party_code);
CREATE INDEX IF NOT EXISTS idx_parties_display_name           ON parties (display_name);
CREATE INDEX IF NOT EXISTS idx_parties_legal_name_en          ON parties (legal_name_en);
CREATE INDEX IF NOT EXISTS idx_parties_trade_name_en          ON parties (trade_name_en) WHERE trade_name_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parties_main_email             ON parties (main_email) WHERE main_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_parties_country_id             ON parties (country_id);
CREATE INDEX IF NOT EXISTS idx_parties_emirate_id             ON parties (emirate_id);
CREATE INDEX IF NOT EXISTS idx_parties_city_id                ON parties (city_id);
CREATE INDEX IF NOT EXISTS idx_parties_party_status_id        ON parties (party_status_id);
CREATE INDEX IF NOT EXISTS idx_parties_primary_type_id        ON parties (primary_party_type_id);
CREATE INDEX IF NOT EXISTS idx_parties_is_active              ON parties (is_active);
CREATE INDEX IF NOT EXISTS idx_parties_created_at             ON parties (created_at);
CREATE INDEX IF NOT EXISTS idx_parties_updated_at             ON parties (updated_at);
-- REVIEW ONLY: trigram indexes (requires pg_trgm):
-- CREATE INDEX IF NOT EXISTS idx_parties_legal_name_trgm   ON parties USING gin (lower(legal_name_en) gin_trgm_ops);
-- CREATE INDEX IF NOT EXISTS idx_parties_trade_name_trgm   ON parties USING gin (lower(trade_name_en) gin_trgm_ops) WHERE trade_name_en IS NOT NULL;

-- =============================================================================
-- SECTION 6: party_type_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS party_type_assignments (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id        BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  party_type_id   BIGINT NOT NULL REFERENCES party_types(id) ON DELETE RESTRICT,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  assigned_date   DATE,
  assigned_by     BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_type_assign_one_primary
  ON party_type_assignments (party_id) WHERE is_primary = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_type_assign_no_dup_active
  ON party_type_assignments (party_id, party_type_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_type_assign_party_id ON party_type_assignments (party_id);
CREATE INDEX IF NOT EXISTS idx_party_type_assign_type_id  ON party_type_assignments (party_type_id);

-- =============================================================================
-- SECTION 7: CHILD / TRANSACTIONAL TABLES
-- =============================================================================

-- 7.1 party_licenses
CREATE TABLE IF NOT EXISTS party_licenses (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  license_code                TEXT NOT NULL CONSTRAINT party_licenses_code_uq UNIQUE,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  license_type_id             BIGINT NOT NULL REFERENCES party_license_types(id) ON DELETE RESTRICT,
  license_number              TEXT NOT NULL,
  license_name                TEXT,
  issuing_authority_party_id  BIGINT REFERENCES parties(id) ON DELETE SET NULL,
  issuing_country_id          BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  issuing_emirate_id          BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  issue_date                  DATE,
  expiry_date                 DATE,
  renewal_required            BOOLEAN NOT NULL DEFAULT false,
  renewal_notice_days         INTEGER DEFAULT 30,
  license_status_id           BIGINT NOT NULL REFERENCES party_license_statuses(id) ON DELETE RESTRICT,
  license_activity_text       TEXT,
  license_document_id         BIGINT REFERENCES party_documents(id) ON DELETE SET NULL,
  is_primary                  BOOLEAN NOT NULL DEFAULT false,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  remarks                     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_licenses_one_primary
  ON party_licenses (party_id) WHERE is_primary = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_licenses_party_id    ON party_licenses (party_id);
CREATE INDEX IF NOT EXISTS idx_party_licenses_type_id     ON party_licenses (license_type_id);
CREATE INDEX IF NOT EXISTS idx_party_licenses_number      ON party_licenses (license_number);
CREATE INDEX IF NOT EXISTS idx_party_licenses_expiry      ON party_licenses (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_licenses_status_id   ON party_licenses (license_status_id);
CREATE INDEX IF NOT EXISTS idx_party_licenses_authority   ON party_licenses (issuing_authority_party_id) WHERE issuing_authority_party_id IS NOT NULL;

-- 7.2 party_documents (must come before party_licenses in dependency order but references party_licenses via license_document_id; use deferred FK or create docs first and alter licenses after)
-- NOTE: party_licenses.license_document_id FK to party_documents is added as ALTER after party_documents is created.
CREATE TABLE IF NOT EXISTS party_documents (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_code               TEXT NOT NULL CONSTRAINT party_documents_code_uq UNIQUE,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  document_type_id            BIGINT NOT NULL REFERENCES party_document_types(id) ON DELETE RESTRICT,
  document_title              TEXT NOT NULL,
  document_number             TEXT,
  issue_date                  DATE,
  expiry_date                 DATE,
  issuing_authority_party_id  BIGINT REFERENCES parties(id) ON DELETE SET NULL,
  file_path                   TEXT,
  file_name                   TEXT,
  file_mime_type              TEXT,
  file_size                   BIGINT,
  expiry_required             BOOLEAN NOT NULL DEFAULT false,
  renewal_notice_days         INTEGER DEFAULT 30,
  document_status_id          BIGINT NOT NULL REFERENCES party_document_statuses(id) ON DELETE RESTRICT,
  uploaded_by                 BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  uploaded_at                 TIMESTAMPTZ,
  remarks                     TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_party_docs_party_id      ON party_documents (party_id);
CREATE INDEX IF NOT EXISTS idx_party_docs_type_id       ON party_documents (document_type_id);
CREATE INDEX IF NOT EXISTS idx_party_docs_expiry        ON party_documents (expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_docs_status_id     ON party_documents (document_status_id);
CREATE INDEX IF NOT EXISTS idx_party_docs_authority     ON party_documents (issuing_authority_party_id) WHERE issuing_authority_party_id IS NOT NULL;

-- Add deferred FK from party_licenses to party_documents:
-- REVIEW ONLY: uncomment after both tables exist
-- ALTER TABLE party_licenses ADD CONSTRAINT fk_party_licenses_document
--   FOREIGN KEY (license_document_id) REFERENCES party_documents(id) ON DELETE SET NULL;

-- 7.3 party_tax_registrations
CREATE TABLE IF NOT EXISTS party_tax_registrations (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_registration_code     TEXT NOT NULL CONSTRAINT party_tax_reg_code_uq UNIQUE,
  party_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  tax_type_id               BIGINT NOT NULL REFERENCES tax_types(id) ON DELETE RESTRICT,
  tax_registration_number   TEXT NOT NULL,
  tax_country_id            BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  tax_status_id             BIGINT NOT NULL REFERENCES party_tax_statuses(id) ON DELETE RESTRICT,
  effective_from            DATE,
  effective_to              DATE,
  certificate_document_id   BIGINT REFERENCES party_documents(id) ON DELETE SET NULL,
  reverse_charge_applicable BOOLEAN NOT NULL DEFAULT false,
  vat_exempt                BOOLEAN NOT NULL DEFAULT false,
  is_primary                BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  remarks                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_tax_reg_one_primary
  ON party_tax_registrations (party_id) WHERE is_primary = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_tax_reg_no_dup
  ON party_tax_registrations (party_id, tax_type_id, tax_registration_number) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_tax_reg_party_id   ON party_tax_registrations (party_id);
CREATE INDEX IF NOT EXISTS idx_party_tax_reg_number     ON party_tax_registrations (tax_registration_number);
CREATE INDEX IF NOT EXISTS idx_party_tax_reg_type_id    ON party_tax_registrations (tax_type_id);
CREATE INDEX IF NOT EXISTS idx_party_tax_reg_status_id  ON party_tax_registrations (tax_status_id);

-- 7.4 party_finance_profiles (1:1)
CREATE TABLE IF NOT EXISTS party_finance_profiles (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  default_currency_id       BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  default_payment_term_id   BIGINT REFERENCES payment_terms(id) ON DELETE SET NULL,
  default_payment_method_id BIGINT REFERENCES payment_methods(id) ON DELETE SET NULL,
  credit_limit              NUMERIC(18,4),
  credit_currency_id        BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  finance_hold              BOOLEAN NOT NULL DEFAULT false,   -- renamed from payment_hold (SUPABASE_VERIFIED fix)
  finance_hold_reason       TEXT,
  finance_hold_by           BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  finance_hold_at           TIMESTAMPTZ,
  finance_remarks           TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_finance_profiles_party_id_uq UNIQUE (party_id)
);

CREATE INDEX IF NOT EXISTS idx_party_finance_party_id    ON party_finance_profiles (party_id);
CREATE INDEX IF NOT EXISTS idx_party_finance_hold        ON party_finance_profiles (finance_hold);  -- renamed from idx_party_finance_payment_hold

-- 7.5 party_contacts
CREATE TABLE IF NOT EXISTS party_contacts (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contact_code            TEXT NOT NULL CONSTRAINT party_contacts_code_uq UNIQUE,
  party_id                BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  full_name               TEXT NOT NULL,
  designation             TEXT,
  department_id           BIGINT REFERENCES party_contact_departments(id) ON DELETE SET NULL,
  contact_role_id         BIGINT REFERENCES party_contact_roles(id) ON DELETE SET NULL,
  email                   TEXT,
  phone                   TEXT,
  mobile                  TEXT,
  whatsapp                TEXT,
  is_primary              BOOLEAN NOT NULL DEFAULT false,
  is_accounts_contact     BOOLEAN NOT NULL DEFAULT false,
  is_sales_contact        BOOLEAN NOT NULL DEFAULT false,
  is_operations_contact   BOOLEAN NOT NULL DEFAULT false,
  is_hse_contact          BOOLEAN NOT NULL DEFAULT false,
  is_documents_contact    BOOLEAN NOT NULL DEFAULT false,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by              BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_contacts_email_format CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_contacts_one_primary
  ON party_contacts (party_id) WHERE is_primary = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_contacts_party_id   ON party_contacts (party_id);
CREATE INDEX IF NOT EXISTS idx_party_contacts_email      ON party_contacts (email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_contacts_mobile     ON party_contacts (mobile) WHERE mobile IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_contacts_role_id    ON party_contacts (contact_role_id);
CREATE INDEX IF NOT EXISTS idx_party_contacts_is_active  ON party_contacts (is_active);

-- 7.6 party_addresses
CREATE TABLE IF NOT EXISTS party_addresses (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  address_code        TEXT NOT NULL CONSTRAINT party_addresses_code_uq UNIQUE,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  address_type_id     BIGINT NOT NULL REFERENCES party_address_types(id) ON DELETE RESTRICT,
  address_name        TEXT,
  country_id          BIGINT NOT NULL REFERENCES countries(id) ON DELETE RESTRICT,
  emirate_id          BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  city_id             BIGINT REFERENCES cities(id) ON DELETE SET NULL,
  area_zone_id        BIGINT REFERENCES areas_zones(id) ON DELETE SET NULL,
  street              TEXT,
  building            TEXT,
  floor               TEXT,
  office_no           TEXT,
  po_box              TEXT,
  landmark            TEXT,
  google_map_url      TEXT,
  latitude            NUMERIC(10,8),
  longitude           NUMERIC(11,8),
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  is_billing_address  BOOLEAN NOT NULL DEFAULT false,
  is_shipping_address BOOLEAN NOT NULL DEFAULT false,
  is_site_address     BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_addr_one_primary
  ON party_addresses (party_id) WHERE is_primary = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_addr_party_id    ON party_addresses (party_id);
CREATE INDEX IF NOT EXISTS idx_party_addr_geo         ON party_addresses (country_id, emirate_id, city_id);
CREATE INDEX IF NOT EXISTS idx_party_addr_type_id     ON party_addresses (address_type_id);
CREATE INDEX IF NOT EXISTS idx_party_addr_is_active   ON party_addresses (is_active);

-- 7.7 party_bank_details
CREATE TABLE IF NOT EXISTS party_bank_details (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bank_detail_code          TEXT NOT NULL CONSTRAINT party_bank_details_code_uq UNIQUE,
  party_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  bank_id                   BIGINT REFERENCES banks(id) ON DELETE SET NULL,
  bank_name_text            TEXT,
  account_holder_name       TEXT NOT NULL,
  account_number            TEXT,
  iban                      TEXT,
  swift_code                TEXT,
  currency_id               BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  branch_name               TEXT,
  country_id                BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  is_primary                BOOLEAN NOT NULL DEFAULT false,
  is_verified               BOOLEAN NOT NULL DEFAULT false,
  verified_by               BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  verified_at               TIMESTAMPTZ,
  verification_document_id  BIGINT REFERENCES party_documents(id) ON DELETE SET NULL,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  remarks                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_bank_one_primary
  ON party_bank_details (party_id) WHERE is_primary = true AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_bank_party_id  ON party_bank_details (party_id);
CREATE INDEX IF NOT EXISTS idx_party_bank_iban      ON party_bank_details (iban) WHERE iban IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_bank_is_active ON party_bank_details (is_active);

-- 7.8 party_compliance_profiles (1:1)
CREATE TABLE IF NOT EXISTS party_compliance_profiles (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                        BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  kyc_status_id                   BIGINT REFERENCES party_compliance_statuses(id) ON DELETE SET NULL,
  vendor_approval_status_id       BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  customer_approval_status_id     BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  subcontractor_approval_status_id BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  hse_approval_status_id          BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  finance_approval_status_id      BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  legal_approval_status_id        BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  blacklist_status_id             BIGINT REFERENCES party_blacklist_statuses(id) ON DELETE SET NULL,
  blacklist_reason                TEXT,
  risk_rating_id                  BIGINT REFERENCES party_risk_ratings(id) ON DELETE SET NULL,
  credit_rating_id                BIGINT REFERENCES party_credit_ratings(id) ON DELETE SET NULL,
  payment_hold                    BOOLEAN NOT NULL DEFAULT false,
  payment_hold_reason             TEXT,
  work_hold                       BOOLEAN NOT NULL DEFAULT false,
  work_hold_reason                TEXT,
  approved_by                     BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  approved_at                     TIMESTAMPTZ,
  last_review_date                DATE,
  next_review_date                DATE,
  remarks                         TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_compliance_party_id_uq UNIQUE (party_id)
);

CREATE INDEX IF NOT EXISTS idx_party_compliance_party_id ON party_compliance_profiles (party_id);

-- 7.9 party_service_category_assignments
CREATE TABLE IF NOT EXISTS party_service_category_assignments (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id            BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  service_category_id BIGINT NOT NULL REFERENCES party_service_categories_master(id) ON DELETE RESTRICT,
  is_primary          BOOLEAN NOT NULL DEFAULT false,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  remarks             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_svc_one_primary
  ON party_service_category_assignments (party_id) WHERE is_primary = true AND is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_party_svc_no_dup
  ON party_service_category_assignments (party_id, service_category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_svc_party_id    ON party_service_category_assignments (party_id);
CREATE INDEX IF NOT EXISTS idx_party_svc_category_id ON party_service_category_assignments (service_category_id);

-- 7.10 party_relationships
CREATE TABLE IF NOT EXISTS party_relationships (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_party_id       BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  child_party_id        BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  relationship_type_id  BIGINT NOT NULL REFERENCES party_relationship_types(id) ON DELETE RESTRICT,
  effective_from        DATE,
  effective_to          DATE,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  remarks               TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_relationships_no_self CHECK (parent_party_id != child_party_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_party_rel_no_dup_active
  ON party_relationships (parent_party_id, child_party_id, relationship_type_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_party_rel_parent_id    ON party_relationships (parent_party_id);
CREATE INDEX IF NOT EXISTS idx_party_rel_child_id     ON party_relationships (child_party_id);
CREATE INDEX IF NOT EXISTS idx_party_rel_type_id      ON party_relationships (relationship_type_id);

-- 7.11 party_notes
CREATE TABLE IF NOT EXISTS party_notes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  note_code       TEXT NOT NULL CONSTRAINT party_notes_code_uq UNIQUE,
  party_id        BIGINT NOT NULL REFERENCES parties(id) ON DELETE RESTRICT,
  note_type_id    BIGINT REFERENCES party_note_types(id) ON DELETE SET NULL,
  note_title      TEXT,
  note_body       TEXT NOT NULL,
  is_private      BOOLEAN NOT NULL DEFAULT false,
  follow_up_date  DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_party_notes_party_id      ON party_notes (party_id);
CREATE INDEX IF NOT EXISTS idx_party_notes_type_id       ON party_notes (note_type_id);
CREATE INDEX IF NOT EXISTS idx_party_notes_follow_up     ON party_notes (follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_party_notes_is_private    ON party_notes (is_private);

-- =============================================================================
-- SECTION 8: ROLE PROFILE TABLES (6 tables)
-- =============================================================================

-- 8.1 party_customer_profiles
CREATE TABLE IF NOT EXISTS party_customer_profiles (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  customer_category_id        BIGINT REFERENCES customer_categories(id) ON DELETE SET NULL,
  customer_status_id          BIGINT REFERENCES customer_statuses(id) ON DELETE SET NULL,
  industry_sector_id          BIGINT REFERENCES industry_sectors(id) ON DELETE SET NULL,
  sales_region_id             BIGINT REFERENCES sales_regions(id) ON DELETE SET NULL,
  payment_term_id             BIGINT REFERENCES payment_terms(id) ON DELETE SET NULL,
  credit_limit                NUMERIC(18,4),
  credit_currency_id          BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  sales_owner_user_id         BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  requires_lpo                BOOLEAN NOT NULL DEFAULT false,
  requires_contract           BOOLEAN NOT NULL DEFAULT false,
  preferred_invoice_method_id BIGINT REFERENCES invoice_methods(id) ON DELETE SET NULL,
  customer_remarks            TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_customer_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_cust_profile_party_id ON party_customer_profiles (party_id);

-- 8.2 party_vendor_profiles
CREATE TABLE IF NOT EXISTS party_vendor_profiles (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  vendor_category_id          BIGINT REFERENCES vendor_categories(id) ON DELETE SET NULL,
  vendor_rating_id            BIGINT REFERENCES vendor_ratings(id) ON DELETE SET NULL,
  procurement_category_id     BIGINT REFERENCES procurement_categories(id) ON DELETE SET NULL,
  payment_term_id             BIGINT REFERENCES payment_terms(id) ON DELETE SET NULL,
  default_currency_id         BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  preferred_vendor            BOOLEAN NOT NULL DEFAULT false,
  vendor_approval_status_id   BIGINT REFERENCES party_approval_statuses(id) ON DELETE SET NULL,
  can_create_po               BOOLEAN NOT NULL DEFAULT false,
  requires_comparison         BOOLEAN NOT NULL DEFAULT true,
  vendor_remarks              TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_vendor_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_vendor_profile_party_id ON party_vendor_profiles (party_id);

-- 8.3 party_subcontractor_profiles
CREATE TABLE IF NOT EXISTS party_subcontractor_profiles (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  subcontractor_category_id   BIGINT REFERENCES subcontractor_categories(id) ON DELETE SET NULL,
  work_category_id            BIGINT REFERENCES work_categories(id) ON DELETE SET NULL,
  hse_required                BOOLEAN NOT NULL DEFAULT false,
  insurance_required          BOOLEAN NOT NULL DEFAULT false,
  prequalification_required   BOOLEAN NOT NULL DEFAULT false,
  max_contract_value          NUMERIC(18,4),
  contract_currency_id        BIGINT REFERENCES currencies(id) ON DELETE SET NULL,
  approved_for_site_work      BOOLEAN NOT NULL DEFAULT false,
  approved_by_hse             BOOLEAN NOT NULL DEFAULT false,
  subcontractor_remarks       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_subcontractor_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_subcon_profile_party_id ON party_subcontractor_profiles (party_id);

-- 8.4 party_consultant_profiles
CREATE TABLE IF NOT EXISTS party_consultant_profiles (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                        BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  consultant_type_id              BIGINT REFERENCES consultant_types(id) ON DELETE SET NULL,
  specialization_id               BIGINT REFERENCES consultant_specializations(id) ON DELETE SET NULL,
  professional_license_required   BOOLEAN NOT NULL DEFAULT false,
  approved_for_design             BOOLEAN NOT NULL DEFAULT false,
  approved_for_supervision        BOOLEAN NOT NULL DEFAULT false,
  consultant_remarks              TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                      BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_consultant_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_consultant_profile_party_id ON party_consultant_profiles (party_id);

-- 8.5 party_recruitment_agency_profiles
CREATE TABLE IF NOT EXISTS party_recruitment_agency_profiles (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                  BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  source_country_id         BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  recruitment_category_id   BIGINT REFERENCES recruitment_categories(id) ON DELETE SET NULL,
  agreement_required        BOOLEAN NOT NULL DEFAULT false,
  agreement_expiry_date     DATE,
  service_fee_terms         TEXT,
  approved_for_hiring       BOOLEAN NOT NULL DEFAULT false,
  recruitment_remarks       TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_recruit_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_recruit_profile_party_id ON party_recruitment_agency_profiles (party_id);

-- 8.6 party_government_authority_profiles
CREATE TABLE IF NOT EXISTS party_government_authority_profiles (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  party_id                    BIGINT NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  authority_type_id           BIGINT REFERENCES authority_types(id) ON DELETE SET NULL,
  jurisdiction_country_id     BIGINT REFERENCES countries(id) ON DELETE SET NULL,
  jurisdiction_emirate_id     BIGINT REFERENCES emirates(id) ON DELETE SET NULL,
  service_category_id         BIGINT REFERENCES party_service_categories_master(id) ON DELETE SET NULL,
  portal_url                  TEXT,
  portal_username_reference   TEXT,  -- reference label only, NO PASSWORDS
  government_remarks          TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  BIGINT REFERENCES user_profiles(id) ON DELETE SET NULL,
  CONSTRAINT party_govt_profiles_party_id_uq UNIQUE (party_id)
);
CREATE INDEX IF NOT EXISTS idx_govt_profile_party_id ON party_government_authority_profiles (party_id);

-- =============================================================================
-- SECTION 9: ENABLE ROW LEVEL SECURITY — ALL NEW TABLES
-- =============================================================================

ALTER TABLE party_types                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_natures                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_statuses                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_license_types                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_license_statuses                ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_tax_statuses                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_contact_roles                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_contact_departments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_address_types                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_document_types                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_document_statuses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_compliance_statuses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_approval_statuses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_blacklist_statuses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_risk_ratings                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_credit_ratings                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_note_types                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_methods                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_categories                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_statuses                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_methods                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_categories                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_ratings                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE subcontractor_categories              ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_categories                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_types                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultant_specializations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruitment_categories                ENABLE ROW LEVEL SECURITY;
ALTER TABLE authority_types                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_sectors                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_regions                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_service_categories_master       ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_relationship_types              ENABLE ROW LEVEL SECURITY;
ALTER TABLE parties                               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_type_assignments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_licenses                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_documents                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_tax_registrations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_finance_profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_contacts                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_addresses                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_bank_details                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_compliance_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_service_category_assignments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_relationships                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_notes                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_customer_profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_vendor_profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_subcontractor_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_consultant_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_recruitment_agency_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE party_government_authority_profiles   ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SECTION 10: RLS POLICIES — EXPLICIT FOR EVERY TABLE
-- Helper functions assumed: current_user_has_permission(text), current_user_has_role(text)
-- These must be verified in the live database before applying.
-- =============================================================================

-- ─────────────────────────────────────────────
-- 10.1 party_types
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_types_select_policy ON party_types;
CREATE POLICY party_types_select_policy ON party_types FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS party_types_insert_policy ON party_types;
CREATE POLICY party_types_insert_policy ON party_types FOR INSERT
  WITH CHECK (
    current_user_has_permission('master_data.parties.manage_types')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_types_update_policy ON party_types;
CREATE POLICY party_types_update_policy ON party_types FOR UPDATE
  USING (
    current_user_has_permission('master_data.parties.manage_types')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_types_delete_policy ON party_types;
CREATE POLICY party_types_delete_policy ON party_types FOR DELETE
  USING (
    current_user_has_role('system_admin')
    AND is_system = false
  );

-- ─────────────────────────────────────────────
-- 10.2–10.18 Standard lookup masters
-- Pattern: SELECT = any authenticated, INSERT/UPDATE = manage_types or system_admin, DELETE = system_admin + not system
-- ─────────────────────────────────────────────

-- party_natures
DROP POLICY IF EXISTS party_natures_select_policy ON party_natures;
CREATE POLICY party_natures_select_policy ON party_natures FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_natures_insert_policy ON party_natures;
CREATE POLICY party_natures_insert_policy ON party_natures FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_natures_update_policy ON party_natures;
CREATE POLICY party_natures_update_policy ON party_natures FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_natures_delete_policy ON party_natures;
CREATE POLICY party_natures_delete_policy ON party_natures FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_statuses
DROP POLICY IF EXISTS party_statuses_select_policy ON party_statuses;
CREATE POLICY party_statuses_select_policy ON party_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_statuses_insert_policy ON party_statuses;
CREATE POLICY party_statuses_insert_policy ON party_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_statuses_update_policy ON party_statuses;
CREATE POLICY party_statuses_update_policy ON party_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_statuses_delete_policy ON party_statuses;
CREATE POLICY party_statuses_delete_policy ON party_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_license_types
DROP POLICY IF EXISTS party_license_types_select_policy ON party_license_types;
CREATE POLICY party_license_types_select_policy ON party_license_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_license_types_insert_policy ON party_license_types;
CREATE POLICY party_license_types_insert_policy ON party_license_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_license_types_update_policy ON party_license_types;
CREATE POLICY party_license_types_update_policy ON party_license_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_license_types_delete_policy ON party_license_types;
CREATE POLICY party_license_types_delete_policy ON party_license_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_license_statuses
DROP POLICY IF EXISTS party_license_statuses_select_policy ON party_license_statuses;
CREATE POLICY party_license_statuses_select_policy ON party_license_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_license_statuses_insert_policy ON party_license_statuses;
CREATE POLICY party_license_statuses_insert_policy ON party_license_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_license_statuses_update_policy ON party_license_statuses;
CREATE POLICY party_license_statuses_update_policy ON party_license_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_license_statuses_delete_policy ON party_license_statuses;
CREATE POLICY party_license_statuses_delete_policy ON party_license_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_tax_statuses
DROP POLICY IF EXISTS party_tax_statuses_select_policy ON party_tax_statuses;
CREATE POLICY party_tax_statuses_select_policy ON party_tax_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_tax_statuses_insert_policy ON party_tax_statuses;
CREATE POLICY party_tax_statuses_insert_policy ON party_tax_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_tax') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_tax_statuses_update_policy ON party_tax_statuses;
CREATE POLICY party_tax_statuses_update_policy ON party_tax_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_tax') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_tax_statuses_delete_policy ON party_tax_statuses;
CREATE POLICY party_tax_statuses_delete_policy ON party_tax_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_contact_roles
DROP POLICY IF EXISTS party_contact_roles_select_policy ON party_contact_roles;
CREATE POLICY party_contact_roles_select_policy ON party_contact_roles FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_contact_roles_insert_policy ON party_contact_roles;
CREATE POLICY party_contact_roles_insert_policy ON party_contact_roles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_contact_roles_update_policy ON party_contact_roles;
CREATE POLICY party_contact_roles_update_policy ON party_contact_roles FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_contact_roles_delete_policy ON party_contact_roles;
CREATE POLICY party_contact_roles_delete_policy ON party_contact_roles FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_contact_departments
DROP POLICY IF EXISTS party_contact_depts_select_policy ON party_contact_departments;
CREATE POLICY party_contact_depts_select_policy ON party_contact_departments FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_contact_depts_insert_policy ON party_contact_departments;
CREATE POLICY party_contact_depts_insert_policy ON party_contact_departments FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_contact_depts_update_policy ON party_contact_departments;
CREATE POLICY party_contact_depts_update_policy ON party_contact_departments FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_contact_depts_delete_policy ON party_contact_departments;
CREATE POLICY party_contact_depts_delete_policy ON party_contact_departments FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_address_types
DROP POLICY IF EXISTS party_address_types_select_policy ON party_address_types;
CREATE POLICY party_address_types_select_policy ON party_address_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_address_types_insert_policy ON party_address_types;
CREATE POLICY party_address_types_insert_policy ON party_address_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_addresses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_address_types_update_policy ON party_address_types;
CREATE POLICY party_address_types_update_policy ON party_address_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_addresses') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_address_types_delete_policy ON party_address_types;
CREATE POLICY party_address_types_delete_policy ON party_address_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_document_types
DROP POLICY IF EXISTS party_document_types_select_policy ON party_document_types;
CREATE POLICY party_document_types_select_policy ON party_document_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_document_types_insert_policy ON party_document_types;
CREATE POLICY party_document_types_insert_policy ON party_document_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_document_types_update_policy ON party_document_types;
CREATE POLICY party_document_types_update_policy ON party_document_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_document_types_delete_policy ON party_document_types;
CREATE POLICY party_document_types_delete_policy ON party_document_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_document_statuses
DROP POLICY IF EXISTS party_document_statuses_select_policy ON party_document_statuses;
CREATE POLICY party_document_statuses_select_policy ON party_document_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_document_statuses_insert_policy ON party_document_statuses;
CREATE POLICY party_document_statuses_insert_policy ON party_document_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_document_statuses_update_policy ON party_document_statuses;
CREATE POLICY party_document_statuses_update_policy ON party_document_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_document_statuses_delete_policy ON party_document_statuses;
CREATE POLICY party_document_statuses_delete_policy ON party_document_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_compliance_statuses
DROP POLICY IF EXISTS party_compliance_statuses_select_policy ON party_compliance_statuses;
CREATE POLICY party_compliance_statuses_select_policy ON party_compliance_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_compliance_statuses_insert_policy ON party_compliance_statuses;
CREATE POLICY party_compliance_statuses_insert_policy ON party_compliance_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_compliance_statuses_update_policy ON party_compliance_statuses;
CREATE POLICY party_compliance_statuses_update_policy ON party_compliance_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_compliance_statuses_delete_policy ON party_compliance_statuses;
CREATE POLICY party_compliance_statuses_delete_policy ON party_compliance_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_approval_statuses
DROP POLICY IF EXISTS party_approval_statuses_select_policy ON party_approval_statuses;
CREATE POLICY party_approval_statuses_select_policy ON party_approval_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_approval_statuses_insert_policy ON party_approval_statuses;
CREATE POLICY party_approval_statuses_insert_policy ON party_approval_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.approve') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_approval_statuses_update_policy ON party_approval_statuses;
CREATE POLICY party_approval_statuses_update_policy ON party_approval_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.approve') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_approval_statuses_delete_policy ON party_approval_statuses;
CREATE POLICY party_approval_statuses_delete_policy ON party_approval_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_blacklist_statuses
DROP POLICY IF EXISTS party_blacklist_statuses_select_policy ON party_blacklist_statuses;
CREATE POLICY party_blacklist_statuses_select_policy ON party_blacklist_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_blacklist_statuses_insert_policy ON party_blacklist_statuses;
CREATE POLICY party_blacklist_statuses_insert_policy ON party_blacklist_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.blacklist') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_blacklist_statuses_update_policy ON party_blacklist_statuses;
CREATE POLICY party_blacklist_statuses_update_policy ON party_blacklist_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.blacklist') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_blacklist_statuses_delete_policy ON party_blacklist_statuses;
CREATE POLICY party_blacklist_statuses_delete_policy ON party_blacklist_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_risk_ratings
DROP POLICY IF EXISTS party_risk_ratings_select_policy ON party_risk_ratings;
CREATE POLICY party_risk_ratings_select_policy ON party_risk_ratings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_risk_ratings_insert_policy ON party_risk_ratings;
CREATE POLICY party_risk_ratings_insert_policy ON party_risk_ratings FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_risk_ratings_update_policy ON party_risk_ratings;
CREATE POLICY party_risk_ratings_update_policy ON party_risk_ratings FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_risk_ratings_delete_policy ON party_risk_ratings;
CREATE POLICY party_risk_ratings_delete_policy ON party_risk_ratings FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_credit_ratings
DROP POLICY IF EXISTS party_credit_ratings_select_policy ON party_credit_ratings;
CREATE POLICY party_credit_ratings_select_policy ON party_credit_ratings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_credit_ratings_insert_policy ON party_credit_ratings;
CREATE POLICY party_credit_ratings_insert_policy ON party_credit_ratings FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_credit_ratings_update_policy ON party_credit_ratings;
CREATE POLICY party_credit_ratings_update_policy ON party_credit_ratings FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_compliance') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_credit_ratings_delete_policy ON party_credit_ratings;
CREATE POLICY party_credit_ratings_delete_policy ON party_credit_ratings FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_note_types
DROP POLICY IF EXISTS party_note_types_select_policy ON party_note_types;
CREATE POLICY party_note_types_select_policy ON party_note_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_note_types_insert_policy ON party_note_types;
CREATE POLICY party_note_types_insert_policy ON party_note_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_note_types_update_policy ON party_note_types;
CREATE POLICY party_note_types_update_policy ON party_note_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_note_types_delete_policy ON party_note_types;
CREATE POLICY party_note_types_delete_policy ON party_note_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- payment_methods
DROP POLICY IF EXISTS payment_methods_select_policy ON payment_methods;
CREATE POLICY payment_methods_select_policy ON payment_methods FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS payment_methods_insert_policy ON payment_methods;
CREATE POLICY payment_methods_insert_policy ON payment_methods FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS payment_methods_update_policy ON payment_methods;
CREATE POLICY payment_methods_update_policy ON payment_methods FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS payment_methods_delete_policy ON payment_methods;
CREATE POLICY payment_methods_delete_policy ON payment_methods FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- ─────────────────────────────────────────────
-- Role-profile lookup masters (customer_categories through sales_regions)
-- Pattern: SELECT = authenticated, INSERT/UPDATE = manage_types or system_admin, DELETE = system_admin
-- ─────────────────────────────────────────────

-- customer_categories
DROP POLICY IF EXISTS customer_categories_select_policy ON customer_categories; CREATE POLICY customer_categories_select_policy ON customer_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS customer_categories_insert_policy ON customer_categories; CREATE POLICY customer_categories_insert_policy ON customer_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS customer_categories_update_policy ON customer_categories; CREATE POLICY customer_categories_update_policy ON customer_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS customer_categories_delete_policy ON customer_categories; CREATE POLICY customer_categories_delete_policy ON customer_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- customer_statuses
DROP POLICY IF EXISTS customer_statuses_select_policy ON customer_statuses; CREATE POLICY customer_statuses_select_policy ON customer_statuses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS customer_statuses_insert_policy ON customer_statuses; CREATE POLICY customer_statuses_insert_policy ON customer_statuses FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS customer_statuses_update_policy ON customer_statuses; CREATE POLICY customer_statuses_update_policy ON customer_statuses FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS customer_statuses_delete_policy ON customer_statuses; CREATE POLICY customer_statuses_delete_policy ON customer_statuses FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- invoice_methods
DROP POLICY IF EXISTS invoice_methods_select_policy ON invoice_methods; CREATE POLICY invoice_methods_select_policy ON invoice_methods FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS invoice_methods_insert_policy ON invoice_methods; CREATE POLICY invoice_methods_insert_policy ON invoice_methods FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS invoice_methods_update_policy ON invoice_methods; CREATE POLICY invoice_methods_update_policy ON invoice_methods FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS invoice_methods_delete_policy ON invoice_methods; CREATE POLICY invoice_methods_delete_policy ON invoice_methods FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- vendor_categories
DROP POLICY IF EXISTS vendor_categories_select_policy ON vendor_categories; CREATE POLICY vendor_categories_select_policy ON vendor_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS vendor_categories_insert_policy ON vendor_categories; CREATE POLICY vendor_categories_insert_policy ON vendor_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_categories_update_policy ON vendor_categories; CREATE POLICY vendor_categories_update_policy ON vendor_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_categories_delete_policy ON vendor_categories; CREATE POLICY vendor_categories_delete_policy ON vendor_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- vendor_ratings
DROP POLICY IF EXISTS vendor_ratings_select_policy ON vendor_ratings; CREATE POLICY vendor_ratings_select_policy ON vendor_ratings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS vendor_ratings_insert_policy ON vendor_ratings; CREATE POLICY vendor_ratings_insert_policy ON vendor_ratings FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_ratings_update_policy ON vendor_ratings; CREATE POLICY vendor_ratings_update_policy ON vendor_ratings FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_ratings_delete_policy ON vendor_ratings; CREATE POLICY vendor_ratings_delete_policy ON vendor_ratings FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- procurement_categories
DROP POLICY IF EXISTS procurement_cats_select_policy ON procurement_categories; CREATE POLICY procurement_cats_select_policy ON procurement_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS procurement_cats_insert_policy ON procurement_categories; CREATE POLICY procurement_cats_insert_policy ON procurement_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS procurement_cats_update_policy ON procurement_categories; CREATE POLICY procurement_cats_update_policy ON procurement_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS procurement_cats_delete_policy ON procurement_categories; CREATE POLICY procurement_cats_delete_policy ON procurement_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- subcontractor_categories
DROP POLICY IF EXISTS subcon_cats_select_policy ON subcontractor_categories; CREATE POLICY subcon_cats_select_policy ON subcontractor_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS subcon_cats_insert_policy ON subcontractor_categories; CREATE POLICY subcon_cats_insert_policy ON subcontractor_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS subcon_cats_update_policy ON subcontractor_categories; CREATE POLICY subcon_cats_update_policy ON subcontractor_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS subcon_cats_delete_policy ON subcontractor_categories; CREATE POLICY subcon_cats_delete_policy ON subcontractor_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- work_categories
DROP POLICY IF EXISTS work_categories_select_policy ON work_categories; CREATE POLICY work_categories_select_policy ON work_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS work_categories_insert_policy ON work_categories; CREATE POLICY work_categories_insert_policy ON work_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS work_categories_update_policy ON work_categories; CREATE POLICY work_categories_update_policy ON work_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS work_categories_delete_policy ON work_categories; CREATE POLICY work_categories_delete_policy ON work_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- consultant_types
DROP POLICY IF EXISTS consultant_types_select_policy ON consultant_types; CREATE POLICY consultant_types_select_policy ON consultant_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS consultant_types_insert_policy ON consultant_types; CREATE POLICY consultant_types_insert_policy ON consultant_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_types_update_policy ON consultant_types; CREATE POLICY consultant_types_update_policy ON consultant_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_types_delete_policy ON consultant_types; CREATE POLICY consultant_types_delete_policy ON consultant_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- consultant_specializations
DROP POLICY IF EXISTS consultant_specs_select_policy ON consultant_specializations; CREATE POLICY consultant_specs_select_policy ON consultant_specializations FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS consultant_specs_insert_policy ON consultant_specializations; CREATE POLICY consultant_specs_insert_policy ON consultant_specializations FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_specs_update_policy ON consultant_specializations; CREATE POLICY consultant_specs_update_policy ON consultant_specializations FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_specs_delete_policy ON consultant_specializations; CREATE POLICY consultant_specs_delete_policy ON consultant_specializations FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- recruitment_categories
DROP POLICY IF EXISTS recruit_cats_select_policy ON recruitment_categories; CREATE POLICY recruit_cats_select_policy ON recruitment_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS recruit_cats_insert_policy ON recruitment_categories; CREATE POLICY recruit_cats_insert_policy ON recruitment_categories FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS recruit_cats_update_policy ON recruitment_categories; CREATE POLICY recruit_cats_update_policy ON recruitment_categories FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS recruit_cats_delete_policy ON recruitment_categories; CREATE POLICY recruit_cats_delete_policy ON recruitment_categories FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- authority_types
DROP POLICY IF EXISTS authority_types_select_policy ON authority_types; CREATE POLICY authority_types_select_policy ON authority_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS authority_types_insert_policy ON authority_types; CREATE POLICY authority_types_insert_policy ON authority_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS authority_types_update_policy ON authority_types; CREATE POLICY authority_types_update_policy ON authority_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS authority_types_delete_policy ON authority_types; CREATE POLICY authority_types_delete_policy ON authority_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- industry_sectors
DROP POLICY IF EXISTS industry_sectors_select_policy ON industry_sectors; CREATE POLICY industry_sectors_select_policy ON industry_sectors FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS industry_sectors_insert_policy ON industry_sectors; CREATE POLICY industry_sectors_insert_policy ON industry_sectors FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS industry_sectors_update_policy ON industry_sectors; CREATE POLICY industry_sectors_update_policy ON industry_sectors FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS industry_sectors_delete_policy ON industry_sectors; CREATE POLICY industry_sectors_delete_policy ON industry_sectors FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- sales_regions
DROP POLICY IF EXISTS sales_regions_select_policy ON sales_regions; CREATE POLICY sales_regions_select_policy ON sales_regions FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS sales_regions_insert_policy ON sales_regions; CREATE POLICY sales_regions_insert_policy ON sales_regions FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS sales_regions_update_policy ON sales_regions; CREATE POLICY sales_regions_update_policy ON sales_regions FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS sales_regions_delete_policy ON sales_regions; CREATE POLICY sales_regions_delete_policy ON sales_regions FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_service_categories_master
DROP POLICY IF EXISTS party_svc_cats_select_policy ON party_service_categories_master; CREATE POLICY party_svc_cats_select_policy ON party_service_categories_master FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_svc_cats_insert_policy ON party_service_categories_master; CREATE POLICY party_svc_cats_insert_policy ON party_service_categories_master FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_services') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_svc_cats_update_policy ON party_service_categories_master; CREATE POLICY party_svc_cats_update_policy ON party_service_categories_master FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_services') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_svc_cats_delete_policy ON party_service_categories_master; CREATE POLICY party_svc_cats_delete_policy ON party_service_categories_master FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- party_relationship_types
DROP POLICY IF EXISTS party_rel_types_select_policy ON party_relationship_types; CREATE POLICY party_rel_types_select_policy ON party_relationship_types FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS party_rel_types_insert_policy ON party_relationship_types; CREATE POLICY party_rel_types_insert_policy ON party_relationship_types FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.manage_relationships') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_rel_types_update_policy ON party_relationship_types; CREATE POLICY party_rel_types_update_policy ON party_relationship_types FOR UPDATE USING (current_user_has_permission('master_data.parties.manage_relationships') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS party_rel_types_delete_policy ON party_relationship_types; CREATE POLICY party_rel_types_delete_policy ON party_relationship_types FOR DELETE USING (current_user_has_role('system_admin') AND is_system = false);

-- ─────────────────────────────────────────────
-- 10.3 parties (core)
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS parties_select_policy ON parties;
CREATE POLICY parties_select_policy ON parties FOR SELECT
  USING (
    current_user_has_permission('master_data.parties.view')
    OR current_user_has_permission('master_data.party_master.view')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS parties_insert_policy ON parties;
CREATE POLICY parties_insert_policy ON parties FOR INSERT
  WITH CHECK (
    current_user_has_permission('master_data.parties.create')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS parties_update_policy ON parties;
CREATE POLICY parties_update_policy ON parties FOR UPDATE
  USING (
    (
      current_user_has_permission('master_data.parties.edit')
      OR current_user_has_permission('master_data.party_master.manage')
      OR current_user_has_role('system_admin')
    )
    AND (is_locked = false OR current_user_has_role('system_admin'))
  );

DROP POLICY IF EXISTS parties_delete_policy ON parties;
CREATE POLICY parties_delete_policy ON parties FOR DELETE
  USING (
    current_user_has_permission('master_data.parties.delete')
    AND current_user_has_role('system_admin')
  );

-- ─────────────────────────────────────────────
-- 10.4 party_type_assignments
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_type_assign_select_policy ON party_type_assignments;
CREATE POLICY party_type_assign_select_policy ON party_type_assignments FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_type_assign_insert_policy ON party_type_assignments;
CREATE POLICY party_type_assign_insert_policy ON party_type_assignments FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_type_assign_update_policy ON party_type_assignments;
CREATE POLICY party_type_assign_update_policy ON party_type_assignments FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_types') OR current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_type_assign_delete_policy ON party_type_assignments;
CREATE POLICY party_type_assign_delete_policy ON party_type_assignments FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.5 party_licenses
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_licenses_select_policy ON party_licenses;
CREATE POLICY party_licenses_select_policy ON party_licenses FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_licenses_insert_policy ON party_licenses;
CREATE POLICY party_licenses_insert_policy ON party_licenses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_licenses_update_policy ON party_licenses;
CREATE POLICY party_licenses_update_policy ON party_licenses FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_licenses') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_licenses_delete_policy ON party_licenses;
CREATE POLICY party_licenses_delete_policy ON party_licenses FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.6 party_documents
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_documents_select_policy ON party_documents;
CREATE POLICY party_documents_select_policy ON party_documents FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_documents_insert_policy ON party_documents;
CREATE POLICY party_documents_insert_policy ON party_documents FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_documents_update_policy ON party_documents;
CREATE POLICY party_documents_update_policy ON party_documents FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_documents') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_documents_delete_policy ON party_documents;
CREATE POLICY party_documents_delete_policy ON party_documents FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.7 party_tax_registrations
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_tax_reg_select_policy ON party_tax_registrations;
CREATE POLICY party_tax_reg_select_policy ON party_tax_registrations FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_tax_reg_insert_policy ON party_tax_registrations;
CREATE POLICY party_tax_reg_insert_policy ON party_tax_registrations FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_tax') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_tax_reg_update_policy ON party_tax_registrations;
CREATE POLICY party_tax_reg_update_policy ON party_tax_registrations FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_tax') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_tax_reg_delete_policy ON party_tax_registrations;
CREATE POLICY party_tax_reg_delete_policy ON party_tax_registrations FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.8 party_finance_profiles
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_finance_select_policy ON party_finance_profiles;
CREATE POLICY party_finance_select_policy ON party_finance_profiles FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_finance_insert_policy ON party_finance_profiles;
CREATE POLICY party_finance_insert_policy ON party_finance_profiles FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_finance_update_policy ON party_finance_profiles;
CREATE POLICY party_finance_update_policy ON party_finance_profiles FOR UPDATE
  USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_finance_delete_policy ON party_finance_profiles;
CREATE POLICY party_finance_delete_policy ON party_finance_profiles FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.9 party_contacts
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_contacts_select_policy ON party_contacts;
CREATE POLICY party_contacts_select_policy ON party_contacts FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_contacts_insert_policy ON party_contacts;
CREATE POLICY party_contacts_insert_policy ON party_contacts FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_contacts_update_policy ON party_contacts;
CREATE POLICY party_contacts_update_policy ON party_contacts FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_contacts') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_contacts_delete_policy ON party_contacts;
CREATE POLICY party_contacts_delete_policy ON party_contacts FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.10 party_addresses
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_addresses_select_policy ON party_addresses;
CREATE POLICY party_addresses_select_policy ON party_addresses FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_addresses_insert_policy ON party_addresses;
CREATE POLICY party_addresses_insert_policy ON party_addresses FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_addresses') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_addresses_update_policy ON party_addresses;
CREATE POLICY party_addresses_update_policy ON party_addresses FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_addresses') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_addresses_delete_policy ON party_addresses;
CREATE POLICY party_addresses_delete_policy ON party_addresses FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.11 party_bank_details — ELEVATED / SENSITIVE
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_bank_select_policy ON party_bank_details;
CREATE POLICY party_bank_select_policy ON party_bank_details FOR SELECT
  USING (
    current_user_has_permission('master_data.parties.view_bank_details')
    OR current_user_has_permission('master_data.parties.manage_bank_details')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_bank_insert_policy ON party_bank_details;
CREATE POLICY party_bank_insert_policy ON party_bank_details FOR INSERT
  WITH CHECK (
    current_user_has_permission('master_data.parties.manage_bank_details')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_bank_update_policy ON party_bank_details;
CREATE POLICY party_bank_update_policy ON party_bank_details FOR UPDATE
  USING (
    current_user_has_permission('master_data.parties.manage_bank_details')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_bank_delete_policy ON party_bank_details;
CREATE POLICY party_bank_delete_policy ON party_bank_details FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.12 party_compliance_profiles — ELEVATED
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_compliance_select_policy ON party_compliance_profiles;
CREATE POLICY party_compliance_select_policy ON party_compliance_profiles FOR SELECT
  USING (
    current_user_has_permission('master_data.parties.view')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_compliance_insert_policy ON party_compliance_profiles;
CREATE POLICY party_compliance_insert_policy ON party_compliance_profiles FOR INSERT
  WITH CHECK (
    current_user_has_permission('master_data.parties.manage_compliance')
    OR current_user_has_permission('master_data.parties.approve')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_compliance_update_policy ON party_compliance_profiles;
CREATE POLICY party_compliance_update_policy ON party_compliance_profiles FOR UPDATE
  USING (
    current_user_has_permission('master_data.parties.manage_compliance')
    OR current_user_has_permission('master_data.parties.approve')
    OR current_user_has_permission('master_data.parties.blacklist')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_compliance_delete_policy ON party_compliance_profiles;
CREATE POLICY party_compliance_delete_policy ON party_compliance_profiles FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.13 party_service_category_assignments
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_svc_assign_select_policy ON party_service_category_assignments;
CREATE POLICY party_svc_assign_select_policy ON party_service_category_assignments FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_svc_assign_insert_policy ON party_service_category_assignments;
CREATE POLICY party_svc_assign_insert_policy ON party_service_category_assignments FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_services') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_svc_assign_update_policy ON party_service_category_assignments;
CREATE POLICY party_svc_assign_update_policy ON party_service_category_assignments FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_services') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_svc_assign_delete_policy ON party_service_category_assignments;
CREATE POLICY party_svc_assign_delete_policy ON party_service_category_assignments FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.14 party_relationships
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_relationships_select_policy ON party_relationships;
CREATE POLICY party_relationships_select_policy ON party_relationships FOR SELECT
  USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_relationships_insert_policy ON party_relationships;
CREATE POLICY party_relationships_insert_policy ON party_relationships FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.manage_relationships') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_relationships_update_policy ON party_relationships;
CREATE POLICY party_relationships_update_policy ON party_relationships FOR UPDATE
  USING (current_user_has_permission('master_data.parties.manage_relationships') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_relationships_delete_policy ON party_relationships;
CREATE POLICY party_relationships_delete_policy ON party_relationships FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.15 party_notes — Private note filter
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS party_notes_select_policy ON party_notes;
CREATE POLICY party_notes_select_policy ON party_notes FOR SELECT
  USING (
    (
      is_private = false
      AND (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'))
    )
    OR (
      is_private = true
      AND (
        created_by = current_user_profile_id()  -- SUPABASE_VERIFIED: using confirmed live function
        OR current_user_has_permission('master_data.parties.manage_compliance')
        OR current_user_has_role('system_admin')
      )
    )
  );

DROP POLICY IF EXISTS party_notes_insert_policy ON party_notes;
CREATE POLICY party_notes_insert_policy ON party_notes FOR INSERT
  WITH CHECK (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));

DROP POLICY IF EXISTS party_notes_update_policy ON party_notes;
CREATE POLICY party_notes_update_policy ON party_notes FOR UPDATE
  USING (
    created_by = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS party_notes_delete_policy ON party_notes;
CREATE POLICY party_notes_delete_policy ON party_notes FOR DELETE
  USING (current_user_has_role('system_admin'));

-- ─────────────────────────────────────────────
-- 10.16–10.21 Role profile tables (all same pattern)
-- SELECT = view, INSERT/UPDATE = edit, DELETE = system_admin
-- ─────────────────────────────────────────────

-- party_customer_profiles
DROP POLICY IF EXISTS cust_profile_select_policy ON party_customer_profiles; CREATE POLICY cust_profile_select_policy ON party_customer_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS cust_profile_insert_policy ON party_customer_profiles; CREATE POLICY cust_profile_insert_policy ON party_customer_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS cust_profile_update_policy ON party_customer_profiles; CREATE POLICY cust_profile_update_policy ON party_customer_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS cust_profile_delete_policy ON party_customer_profiles; CREATE POLICY cust_profile_delete_policy ON party_customer_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- party_vendor_profiles
DROP POLICY IF EXISTS vendor_profile_select_policy ON party_vendor_profiles; CREATE POLICY vendor_profile_select_policy ON party_vendor_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_profile_insert_policy ON party_vendor_profiles; CREATE POLICY vendor_profile_insert_policy ON party_vendor_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_profile_update_policy ON party_vendor_profiles; CREATE POLICY vendor_profile_update_policy ON party_vendor_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS vendor_profile_delete_policy ON party_vendor_profiles; CREATE POLICY vendor_profile_delete_policy ON party_vendor_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- party_subcontractor_profiles
DROP POLICY IF EXISTS subcon_profile_select_policy ON party_subcontractor_profiles; CREATE POLICY subcon_profile_select_policy ON party_subcontractor_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS subcon_profile_insert_policy ON party_subcontractor_profiles; CREATE POLICY subcon_profile_insert_policy ON party_subcontractor_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS subcon_profile_update_policy ON party_subcontractor_profiles; CREATE POLICY subcon_profile_update_policy ON party_subcontractor_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS subcon_profile_delete_policy ON party_subcontractor_profiles; CREATE POLICY subcon_profile_delete_policy ON party_subcontractor_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- party_consultant_profiles
DROP POLICY IF EXISTS consultant_profile_select_policy ON party_consultant_profiles; CREATE POLICY consultant_profile_select_policy ON party_consultant_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_profile_insert_policy ON party_consultant_profiles; CREATE POLICY consultant_profile_insert_policy ON party_consultant_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_profile_update_policy ON party_consultant_profiles; CREATE POLICY consultant_profile_update_policy ON party_consultant_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS consultant_profile_delete_policy ON party_consultant_profiles; CREATE POLICY consultant_profile_delete_policy ON party_consultant_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- party_recruitment_agency_profiles
DROP POLICY IF EXISTS recruit_profile_select_policy ON party_recruitment_agency_profiles; CREATE POLICY recruit_profile_select_policy ON party_recruitment_agency_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS recruit_profile_insert_policy ON party_recruitment_agency_profiles; CREATE POLICY recruit_profile_insert_policy ON party_recruitment_agency_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS recruit_profile_update_policy ON party_recruitment_agency_profiles; CREATE POLICY recruit_profile_update_policy ON party_recruitment_agency_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS recruit_profile_delete_policy ON party_recruitment_agency_profiles; CREATE POLICY recruit_profile_delete_policy ON party_recruitment_agency_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- party_government_authority_profiles
DROP POLICY IF EXISTS govt_profile_select_policy ON party_government_authority_profiles; CREATE POLICY govt_profile_select_policy ON party_government_authority_profiles FOR SELECT USING (current_user_has_permission('master_data.parties.view') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS govt_profile_insert_policy ON party_government_authority_profiles; CREATE POLICY govt_profile_insert_policy ON party_government_authority_profiles FOR INSERT WITH CHECK (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS govt_profile_update_policy ON party_government_authority_profiles; CREATE POLICY govt_profile_update_policy ON party_government_authority_profiles FOR UPDATE USING (current_user_has_permission('master_data.parties.edit') OR current_user_has_role('system_admin'));
DROP POLICY IF EXISTS govt_profile_delete_policy ON party_government_authority_profiles; CREATE POLICY govt_profile_delete_policy ON party_government_authority_profiles FOR DELETE USING (current_user_has_role('system_admin'));

-- =============================================================================
-- SECTION 11: SEED DATA
-- =============================================================================

-- 11.1 party_types
INSERT INTO party_types (type_code, type_name, type_name_ar, is_system, is_active, sort_order) VALUES
  ('CUSTOMER',              'Customer',                    'عميل',                   true,  true, 1),
  ('VENDOR',                'Vendor',                      'مورد',                   true,  true, 2),
  ('SUBCONTRACTOR',         'Subcontractor',               'مقاول من الباطن',         true,  true, 3),
  ('CONSULTANT',            'Consultant',                  'استشاري',                 true,  true, 4),
  ('RECRUITMENT_AGENCY',    'Recruitment Agency',          'وكالة توظيف',             true,  true, 5),
  ('GOVERNMENT_AUTHORITY',  'Government Authority',        'جهة حكومية',              true,  true, 6),
  ('BANK',                  'Bank',                        'بنك',                    true,  true, 7),
  ('INSURANCE_COMPANY',     'Insurance Company',           'شركة تأمين',              true,  true, 8),
  ('LICENSE_ISSUER',        'License Issuer',              'جهة إصدار الترخيص',       true,  true, 9),
  ('FREE_ZONE_AUTHORITY',   'Free Zone Authority',         'سلطة المنطقة الحرة',      true,  true, 10),
  ('SCRAP_BUYER',           'Scrap Buyer',                 'مشتري خردة',              false, true, 11),
  ('SCRAP_SELLER',          'Scrap Seller',                'بائع خردة',               false, true, 12),
  ('TRANSPORT_SUPPLIER',    'Transport Supplier',          'مورد نقل',                false, true, 13),
  ('EQUIPMENT_SUPPLIER',    'Equipment Supplier',          'مورد معدات',              false, true, 14),
  ('FUEL_SUPPLIER',         'Fuel Supplier',               'مورد وقود',               false, true, 15),
  ('WORKSHOP_SUPPLIER',     'Workshop Supplier',           'مورد ورشة',               false, true, 16),
  ('SPARE_PARTS_SUPPLIER',  'Spare Parts Supplier',        'مورد قطع غيار',           false, true, 17),
  ('LAB_TESTING_COMPANY',   'Lab Testing Company',         'شركة اختبارات مخبرية',    false, true, 18),
  ('WASTE_DISPOSAL_FACILITY','Waste Disposal Facility',   'منشأة معالجة نفايات',     false, true, 19),
  ('TRAINING_PROVIDER',     'Training Provider',           'مزود تدريب',              false, true, 20),
  ('MANPOWER_SUPPLIER',     'Manpower Supplier',           'مورد عمالة',              false, true, 21),
  ('OWNER_LANDLORD',        'Owner / Landlord',            'مالك / مؤجر',             false, true, 22),
  ('JOINT_VENTURE_PARTNER', 'Joint Venture Partner',       'شريك مشروع مشترك',        false, true, 23)
ON CONFLICT (type_code) DO UPDATE SET type_name = EXCLUDED.type_name, is_active = EXCLUDED.is_active, updated_at = now();

-- 11.2 party_natures
INSERT INTO party_natures (nature_code, name_en, name_ar, is_system, is_active, sort_order) VALUES
  ('LLC',                  'Limited Liability Company',    'شركة ذات مسؤولية محدودة',  true, true, 1),
  ('PLC',                  'Public Listed Company',        'شركة مدرجة في البورصة',    true, true, 2),
  ('INDIVIDUAL',           'Individual / Sole Person',     'فرد / شخص طبيعي',          true, true, 3),
  ('SOLE_PROPRIETORSHIP',  'Sole Proprietorship',          'مؤسسة فردية',              true, true, 4),
  ('PARTNERSHIP',          'Partnership',                  'شراكة',                    true, true, 5),
  ('GOVERNMENT',           'Government Entity',            'جهة حكومية',               true, true, 6),
  ('FREE_ZONE_ENTITY',     'Free Zone Entity',             'كيان منطقة حرة',           true, true, 7),
  ('BRANCH',               'Branch Office',                'فرع',                      true, true, 8),
  ('REPRESENTATIVE_OFFICE','Representative Office',        'مكتب تمثيل',               true, true, 9),
  ('JOINT_VENTURE',        'Joint Venture',                'مشروع مشترك',              true, true, 10),
  ('TRUST',                'Trust',                        'صندوق ائتماني',            true, true, 11),
  ('OTHER',                'Other',                        'أخرى',                     false,true, 99)
ON CONFLICT (nature_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.3 party_statuses
INSERT INTO party_statuses (status_code, name_en, is_system, sort_order) VALUES
  ('DRAFT',       'Draft',       true, 1),
  ('ACTIVE',      'Active',      true, 2),
  ('INACTIVE',    'Inactive',    true, 3),
  ('SUSPENDED',   'Suspended',   true, 4),
  ('BLACKLISTED', 'Blacklisted', true, 5),
  ('ARCHIVED',    'Archived',    true, 6)
ON CONFLICT (status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.4 party_license_types (12 types)
INSERT INTO party_license_types (license_type_code, name_en, is_system, sort_order) VALUES
  ('COMMERCIAL',      'Commercial License',           true, 1),
  ('PROFESSIONAL',    'Professional License',         true, 2),
  ('INDUSTRIAL',      'Industrial License',           true, 3),
  ('TOURISM',         'Tourism License',              false, 4),
  ('EDUCATIONAL',     'Educational License',          false, 5),
  ('HEALTHCARE',      'Healthcare License',           false, 6),
  ('TRANSPORT',       'Transport License',            false, 7),
  ('CONTRACTING',     'Contracting License',          true, 8),
  ('MANPOWER',        'Manpower Recruitment License', false, 9),
  ('FREE_ZONE',       'Free Zone License',            true, 10),
  ('IMPORT_EXPORT',   'Import / Export License',      false, 11),
  ('OTHER',           'Other',                        false, 99)
ON CONFLICT (license_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.5 party_license_statuses
INSERT INTO party_license_statuses (license_status_code, name_en, is_system, sort_order) VALUES
  ('ACTIVE',          'Active',           true, 1),
  ('EXPIRED',         'Expired',          true, 2),
  ('SUSPENDED',       'Suspended',        true, 3),
  ('CANCELLED',       'Cancelled',        true, 4),
  ('PENDING_RENEWAL', 'Pending Renewal',  true, 5),
  ('UNDER_REVIEW',    'Under Review',     false, 6)
ON CONFLICT (license_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.6 party_tax_statuses
INSERT INTO party_tax_statuses (tax_status_code, name_en, is_system, sort_order) VALUES
  ('REGISTERED',     'Registered',             true, 1),
  ('PENDING',        'Pending Registration',   false, 2),
  ('EXEMPTED',       'Exempted',               false, 3),
  ('DEREGISTERED',   'De-registered',          true, 4),
  ('NOT_APPLICABLE', 'Not Applicable',         true, 5)
ON CONFLICT (tax_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.7 party_contact_roles
INSERT INTO party_contact_roles (contact_role_code, name_en, is_system, sort_order) VALUES
  ('PRIMARY_CONTACT', 'Primary Contact',  true, 1),
  ('ACCOUNTS',        'Accounts Contact', true, 2),
  ('SALES',           'Sales Contact',    true, 3),
  ('OPERATIONS',      'Operations Contact',true, 4),
  ('HSE',             'HSE Contact',      true, 5),
  ('DOCUMENTS',       'Documents Contact',true, 6),
  ('TECHNICAL',       'Technical Contact',false, 7),
  ('MANAGEMENT',      'Management',       false, 8),
  ('OTHER',           'Other',            false, 99)
ON CONFLICT (contact_role_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.8 party_contact_departments
INSERT INTO party_contact_departments (contact_department_code, name_en, is_system, sort_order) VALUES
  ('FINANCE',     'Finance',              false, 1),
  ('ACCOUNTS',    'Accounts',             false, 2),
  ('SALES',       'Sales',               false, 3),
  ('OPERATIONS',  'Operations',          false, 4),
  ('HR',          'Human Resources',     false, 5),
  ('HSE',         'HSE',                 false, 6),
  ('LEGAL',       'Legal',               false, 7),
  ('IT',          'Information Technology', false, 8),
  ('MANAGEMENT',  'Management',          false, 9),
  ('PROCUREMENT', 'Procurement',         false, 10),
  ('PROJECTS',    'Projects',            false, 11),
  ('OTHER',       'Other',               false, 99)
ON CONFLICT (contact_department_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.9 party_address_types
INSERT INTO party_address_types (address_type_code, name_en, is_system, sort_order) VALUES
  ('REGISTERED',  'Registered Address', true, 1),
  ('HEAD_OFFICE', 'Head Office',        true, 2),
  ('BRANCH',      'Branch Office',      false, 3),
  ('BILLING',     'Billing Address',    true, 4),
  ('SHIPPING',    'Shipping Address',   true, 5),
  ('WAREHOUSE',   'Warehouse',          false, 6),
  ('SITE',        'Site Address',       false, 7),
  ('OTHER',       'Other',              false, 99)
ON CONFLICT (address_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.10 party_document_types
INSERT INTO party_document_types (document_type_code, name_en, is_system, sort_order) VALUES
  ('TRADE_LICENSE',         'Trade License',              true, 1),
  ('MOA',                   'Memorandum of Association',  true, 2),
  ('AOA',                   'Articles of Association',    false, 3),
  ('TRN_CERTIFICATE',       'TRN Certificate',            true, 4),
  ('VAT_CERTIFICATE',       'VAT Certificate',            false, 5),
  ('INSURANCE_CERTIFICATE', 'Insurance Certificate',      true, 6),
  ('BANK_GUARANTEE',        'Bank Guarantee',             false, 7),
  ('POWER_OF_ATTORNEY',     'Power of Attorney',          false, 8),
  ('PASSPORT_COPY',         'Passport Copy',              false, 9),
  ('EMIRATES_ID',           'Emirates ID',                false, 10),
  ('ISO_CERTIFICATE',       'ISO Certificate',            false, 11),
  ('PREQUALIFICATION',      'Prequalification Document',  false, 12),
  ('CONTRACT',              'Contract',                   false, 13),
  ('OTHER',                 'Other',                      false, 99)
ON CONFLICT (document_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.11 party_document_statuses
INSERT INTO party_document_statuses (document_status_code, name_en, is_system, sort_order) VALUES
  ('PENDING_UPLOAD', 'Pending Upload', true,  1),
  ('UPLOADED',       'Uploaded',       true,  2),
  ('UNDER_REVIEW',   'Under Review',   false, 3),
  ('APPROVED',       'Approved',       true,  4),
  ('REJECTED',       'Rejected',       true,  5),
  ('EXPIRED',        'Expired',        true,  6)
ON CONFLICT (document_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.12 party_compliance_statuses
INSERT INTO party_compliance_statuses (compliance_status_code, name_en, is_system, sort_order) VALUES
  ('NOT_REVIEWED', 'Not Reviewed',  true,  1),
  ('IN_PROGRESS',  'In Progress',   false, 2),
  ('APPROVED',     'Approved',      true,  3),
  ('REJECTED',     'Rejected',      true,  4),
  ('SUSPENDED',    'Suspended',     true,  5),
  ('EXPIRED',      'Expired',       true,  6)
ON CONFLICT (compliance_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.13 party_approval_statuses
INSERT INTO party_approval_statuses (approval_status_code, name_en, is_system, sort_order) VALUES
  ('PENDING',                 'Pending',                true, 1),
  ('APPROVED',                'Approved',               true, 2),
  ('CONDITIONALLY_APPROVED',  'Conditionally Approved', false, 3),
  ('REJECTED',                'Rejected',               true, 4),
  ('SUSPENDED',               'Suspended',              true, 5),
  ('EXPIRED',                 'Expired',                true, 6)
ON CONFLICT (approval_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.14 party_blacklist_statuses
INSERT INTO party_blacklist_statuses (blacklist_status_code, name_en, is_system, sort_order) VALUES
  ('NOT_BLACKLISTED',     'Not Blacklisted',            true, 1),
  ('UNDER_INVESTIGATION', 'Under Investigation',         false, 2),
  ('BLACKLISTED',         'Blacklisted',                 true, 3),
  ('REMOVED',             'Removed from Blacklist',      true, 4)
ON CONFLICT (blacklist_status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.15 party_risk_ratings
INSERT INTO party_risk_ratings (risk_rating_code, name_en, is_system, sort_order) VALUES
  ('LOW',       'Low Risk',       true, 1),
  ('MEDIUM',    'Medium Risk',    true, 2),
  ('HIGH',      'High Risk',      true, 3),
  ('VERY_HIGH', 'Very High Risk', true, 4),
  ('CRITICAL',  'Critical Risk',  true, 5)
ON CONFLICT (risk_rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.16 party_credit_ratings
INSERT INTO party_credit_ratings (credit_rating_code, name_en, is_system, sort_order) VALUES
  ('EXCELLENT',    'Excellent (AAA)', true, 1),
  ('GOOD',         'Good (AA)',       true, 2),
  ('SATISFACTORY', 'Satisfactory (A)',true, 3),
  ('ADEQUATE',     'Adequate (BBB)',  false,4),
  ('MARGINAL',     'Marginal (BB)',   false,5),
  ('POOR',         'Poor (B)',        true, 6),
  ('DEFAULT',      'Default',         true, 7),
  ('NOT_RATED',    'Not Rated',       true, 8)
ON CONFLICT (credit_rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.17 party_note_types
INSERT INTO party_note_types (note_type_code, name_en, is_system, sort_order) VALUES
  ('GENERAL',         'General Note',    true, 1),
  ('FOLLOW_UP',       'Follow-up',       true, 2),
  ('COMPLAINT',       'Complaint',       false,3),
  ('ESCALATION',      'Escalation',      false,4),
  ('FINANCIAL_NOTE',  'Financial Note',  false,5),
  ('COMPLIANCE_NOTE', 'Compliance Note', false,6),
  ('LEGAL_NOTE',      'Legal Note',      false,7),
  ('INTERNAL',        'Internal Note',   true, 8)
ON CONFLICT (note_type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.18 payment_methods
INSERT INTO payment_methods (method_code, name_en, is_system, sort_order) VALUES
  ('BANK_TRANSFER', 'Bank Transfer',          true,  1),
  ('CHEQUE',        'Cheque',                 true,  2),
  ('CASH',          'Cash',                   true,  3),
  ('CREDIT_CARD',   'Credit Card',            false, 4),
  ('DIRECT_DEBIT',  'Direct Debit',           false, 5),
  ('PDC',           'Post-Dated Cheque',      false, 6),
  ('LC',            'Letter of Credit',       false, 7),
  ('BG',            'Bank Guarantee',         false, 8),
  ('NETTING',       'Inter-company Netting',  false, 9),
  ('OTHER',         'Other',                  false, 99)
ON CONFLICT (method_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.19 customer_categories
INSERT INTO customer_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CORPORATE','Corporate',true,1),('SME','SME',true,2),('INDIVIDUAL','Individual',true,3),
  ('GOVERNMENT','Government',true,4),('NON_PROFIT','Non-Profit',false,5),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.20 customer_statuses
INSERT INTO customer_statuses (status_code, name_en, is_system, sort_order) VALUES
  ('PROSPECT','Prospect',true,1),('ACTIVE','Active',true,2),('DORMANT','Dormant',false,3),
  ('BLOCKED','Blocked',true,4),('CLOSED','Closed',true,5)
ON CONFLICT (status_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.21 invoice_methods
INSERT INTO invoice_methods (method_code, name_en, is_system, sort_order) VALUES
  ('EMAIL','Email',true,1),('PORTAL','Portal',false,2),('PRINTED_COPY','Printed Copy',false,3),
  ('EDI','EDI',false,4),('FAX','Fax',false,5),('COURIER','Courier',false,6),('HAND_DELIVERY','Hand Delivery',false,7)
ON CONFLICT (method_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.22 vendor_categories
INSERT INTO vendor_categories (category_code, name_en, is_system, sort_order) VALUES
  ('MATERIALS_SUPPLIER','Materials Supplier',true,1),('SERVICE_PROVIDER','Service Provider',true,2),
  ('EQUIPMENT_SUPPLIER','Equipment Supplier',true,3),('FUEL_SUPPLIER','Fuel Supplier',true,4),
  ('IT_SUPPLIER','IT Supplier',false,5),('TRANSPORT_SUPPLIER','Transport Supplier',false,6),
  ('FOOD_SUPPLIER','Food Supplier',false,7),('MANPOWER_AGENCY','Manpower Agency',false,8),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.23 vendor_ratings
INSERT INTO vendor_ratings (rating_code, name_en, is_system, sort_order) VALUES
  ('PREFERRED','Preferred',true,1),('APPROVED','Approved',true,2),
  ('CONDITIONAL','Conditional',true,3),('PROBATIONARY','Probationary',false,4),('BLACKLISTED','Blacklisted',true,5)
ON CONFLICT (rating_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.24 procurement_categories
INSERT INTO procurement_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CIVIL_WORKS','Civil Works',true,1),('MECHANICAL','Mechanical',true,2),('ELECTRICAL','Electrical',true,3),
  ('IT_SERVICES','IT Services',false,4),('PROFESSIONAL_SERVICES','Professional Services',false,5),
  ('TRANSPORT','Transport',false,6),('FUEL_LUBRICANTS','Fuel & Lubricants',true,7),
  ('SPARE_PARTS','Spare Parts',false,8),('SAFETY_EQUIPMENT','Safety Equipment',false,9),
  ('FOOD_CATERING','Food & Catering',false,10),('CLEANING_SERVICES','Cleaning Services',false,11),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.25 subcontractor_categories
INSERT INTO subcontractor_categories (category_code, name_en, is_system, sort_order) VALUES
  ('CIVIL_SUBCONTRACTOR','Civil Subcontractor',true,1),('MECHANICAL_SUBCONTRACTOR','Mechanical',true,2),
  ('ELECTRICAL_SUBCONTRACTOR','Electrical',true,3),('HVAC','HVAC',false,4),('PLUMBING','Plumbing',false,5),
  ('PAINTING','Painting',false,6),('CLEANING','Cleaning',false,7),('DEMOLITION','Demolition',false,8),
  ('SCAFFOLDING','Scaffolding',false,9),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.26 work_categories
INSERT INTO work_categories (category_code, name_en, is_system, sort_order) VALUES
  ('BUILDING_WORKS','Building Works',true,1),('INFRASTRUCTURE','Infrastructure',true,2),
  ('FIT_OUT','Fit-out',false,3),('MAINTENANCE','Maintenance',true,4),
  ('SPECIALIST_WORKS','Specialist Works',false,5),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.27 consultant_types
INSERT INTO consultant_types (type_code, name_en, is_system, sort_order) VALUES
  ('ENGINEERING_CONSULTANT','Engineering Consultant',true,1),('MANAGEMENT_CONSULTANT','Management Consultant',false,2),
  ('LEGAL_CONSULTANT','Legal Consultant',false,3),('FINANCIAL_CONSULTANT','Financial Consultant',false,4),
  ('IT_CONSULTANT','IT Consultant',false,5),('HSE_CONSULTANT','HSE Consultant',false,6),
  ('MEDICAL_CONSULTANT','Medical Consultant',false,7),('OTHER','Other',false,99)
ON CONFLICT (type_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.28 consultant_specializations
INSERT INTO consultant_specializations (specialization_code, name_en, is_system, sort_order) VALUES
  ('STRUCTURAL','Structural',true,1),('CIVIL','Civil',true,2),('MEP','MEP',true,3),
  ('ARCHITECTURE','Architecture',false,4),('COST_ESTIMATING','Cost Estimating',false,5),
  ('PROJECT_MANAGEMENT','Project Management',false,6),('ERP_IT','ERP / IT',false,7),
  ('LEGAL_CORPORATE','Legal – Corporate',false,8),('LEGAL_EMPLOYMENT','Legal – Employment',false,9),
  ('ENVIRONMENTAL','Environmental',false,10),('OTHER','Other',false,99)
ON CONFLICT (specialization_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.29 recruitment_categories
INSERT INTO recruitment_categories (category_code, name_en, is_system, sort_order) VALUES
  ('SKILLED_LABOR','Skilled Labor',true,1),('UNSKILLED_LABOR','Unskilled Labor',true,2),
  ('PROFESSIONAL','Professional',true,3),('TECHNICAL','Technical',false,4),
  ('MANAGEMENT','Management',false,5),('DOMESTIC_WORKER','Domestic Worker',false,6),('OTHER','Other',false,99)
ON CONFLICT (category_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.30 authority_types
INSERT INTO authority_types (authority_code, name_en, is_system, sort_order) VALUES
  ('MUNICIPALITY','Municipality',true,1),('FREE_ZONE_AUTHORITY','Free Zone Authority',true,2),
  ('FEDERAL_MINISTRY','Federal Ministry',true,3),('REGULATORY_BODY','Regulatory Body',false,4),
  ('CHAMBER_OF_COMMERCE','Chamber of Commerce',false,5),('LICENSE_DEPARTMENT','License Department',true,6),
  ('COURT_AUTHORITY','Court Authority',false,7),('CUSTOMS','Customs',false,8),
  ('IMMIGRATION','Immigration',false,9),('OTHER','Other',false,99)
ON CONFLICT (authority_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.31 industry_sectors
INSERT INTO industry_sectors (sector_code, name_en, is_system, sort_order) VALUES
  ('CONSTRUCTION','Construction',true,1),('OIL_GAS','Oil & Gas',true,2),
  ('MANUFACTURING','Manufacturing',false,3),('RETAIL','Retail',false,4),
  ('LOGISTICS','Logistics',false,5),('HEALTHCARE','Healthcare',false,6),
  ('EDUCATION','Education',false,7),('REAL_ESTATE','Real Estate',false,8),
  ('IT_TECHNOLOGY','IT & Technology',false,9),('FINANCIAL_SERVICES','Financial Services',false,10),
  ('HOSPITALITY','Hospitality',false,11),('MEDIA','Media',false,12),
  ('AUTOMOTIVE','Automotive',false,13),('AGRICULTURE','Agriculture',false,14),('OTHER','Other',false,99)
ON CONFLICT (sector_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.32 sales_regions
INSERT INTO sales_regions (region_code, name_en, is_system, sort_order) VALUES
  ('ABU_DHABI','Abu Dhabi',true,1),('DUBAI','Dubai',true,2),('SHARJAH','Sharjah',true,3),
  ('AJMAN','Ajman',true,4),('UMM_AL_QUWAIN','Umm Al Quwain',true,5),
  ('RAS_AL_KHAIMAH','Ras Al Khaimah',true,6),('FUJAIRAH','Fujairah',true,7),
  ('NORTHERN_EMIRATES','Northern Emirates',true,8),('ALL_UAE','All UAE',true,9),
  ('GCC','GCC',false,10),('INTERNATIONAL','International',false,11)
ON CONFLICT (region_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- 11.33 party_service_categories_master (42 categories)
INSERT INTO party_service_categories_master (category_code, category_name_en, is_system, sort_order) VALUES
  ('CIVIL_CONSTRUCTION','Civil Construction',true,1),('MECHANICAL_WORKS','Mechanical Works',true,2),
  ('ELECTRICAL_WORKS','Electrical Works',true,3),('HVAC_WORKS','HVAC Works',false,4),
  ('PLUMBING_WORKS','Plumbing Works',false,5),('PAINTING_WORKS','Painting Works',false,6),
  ('FLOORING_WORKS','Flooring Works',false,7),('JOINERY_WORKS','Joinery Works',false,8),
  ('GLAZING_WORKS','Glazing Works',false,9),('SCAFFOLDING','Scaffolding',false,10),
  ('DEMOLITION','Demolition',false,11),('ROAD_INFRASTRUCTURE','Road Infrastructure',true,12),
  ('WATERPROOFING','Waterproofing',false,13),('INSULATION_WORKS','Insulation Works',false,14),
  ('LANDSCAPING','Landscaping',false,15),('SWIMMING_POOL','Swimming Pool',false,16),
  ('DIESEL_SUPPLY','Diesel Supply',true,17),('PETROL_SUPPLY','Petrol Supply',true,18),
  ('LUBRICANTS_SUPPLY','Lubricants Supply',false,19),('FUEL_LOGISTICS','Fuel Logistics',false,20),
  ('SPARE_PARTS_SUPPLY','Spare Parts Supply',true,21),('EQUIPMENT_RENTAL','Equipment Rental',true,22),
  ('VEHICLE_RENTAL','Vehicle Rental',false,23),('WORKSHOP_REPAIR','Workshop & Repair',false,24),
  ('TRANSPORT_LOGISTICS','Transport & Logistics',true,25),('WASTE_DISPOSAL','Waste Disposal',true,26),
  ('SCRAP_BUYING','Scrap Buying',true,27),('SCRAP_SELLING','Scrap Selling',true,28),
  ('MANPOWER_SUPPLY','Manpower Supply',true,29),('CLEANING_SERVICES','Cleaning Services',false,30),
  ('SECURITY_SERVICES','Security Services',false,31),('CATERING_SERVICES','Catering Services',false,32),
  ('COURIER_SERVICES','Courier Services',false,33),('IT_HARDWARE','IT Hardware',false,34),
  ('IT_SOFTWARE','IT Software',false,35),('IT_SERVICES','IT Services',false,36),
  ('LAB_TESTING','Lab Testing',false,37),('SAFETY_EQUIPMENT','Safety Equipment',false,38),
  ('PROTECTIVE_CLOTHING','Protective Clothing',false,39),('MEDICAL_SUPPLIES','Medical Supplies',false,40),
  ('TRAINING_SERVICES','Training Services',false,41),('OTHER_SERVICES','Other Services',false,99)
ON CONFLICT (category_code) DO UPDATE SET category_name_en = EXCLUDED.category_name_en, updated_at = now();

-- 11.34 party_relationship_types (13 types)
INSERT INTO party_relationship_types (relationship_code, name_en, is_system, sort_order) VALUES
  ('SUBSIDIARY','Subsidiary',true,1),('PARENT_COMPANY','Parent Company',true,2),
  ('SISTER_COMPANY','Sister Company',true,3),('BRANCH_OF','Branch of',true,4),
  ('JOINT_VENTURE_PARTNER','Joint Venture Partner',true,5),('AGENT','Agent',false,6),
  ('DISTRIBUTOR','Distributor',false,7),('ASSOCIATED_COMPANY','Associated Company',false,8),
  ('SOLE_DISTRIBUTOR','Sole Distributor',false,9),('FRANCHISE','Franchise',false,10),
  ('STRATEGIC_PARTNER','Strategic Partner',false,11),('CLIENT_OF','Client of',false,12),
  ('SUPPLIER_OF','Supplier of',false,13)
ON CONFLICT (relationship_code) DO UPDATE SET name_en = EXCLUDED.name_en, updated_at = now();

-- =============================================================================
-- SECTION 12: NUMBERING RULES
-- =============================================================================

INSERT INTO global_numbering_rules
  (rule_code, rule_name, description, module_code, module_name, document_type_code,
   document_type_name, document_prefix, separator, format_template, sequence_length,
   padding_character, starting_sequence_number, current_sequence_number, next_sequence_number,
   reset_policy, reserve_on_draft, reserve_on_submit, allow_manual_override, allow_gaps,
   is_active, is_locked, notes)
VALUES
  ('MASTER_PARTY',         'Party Reference Number',         'Unified party master',       'MASTER_DATA','Master Data','PARTY',   'Party',   'PTY',      '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,'Replaces MASTER_CUSTOMER, MASTER_VENDOR etc.'),
  ('MASTER_PARTY_CONTACT', 'Party Contact Reference',        'Party contact record',       'MASTER_DATA','Master Data','CONTACT', 'Contact', 'PTY-CON',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_ADDRESS', 'Party Address Reference',        'Party address record',       'MASTER_DATA','Master Data','ADDRESS', 'Address', 'PTY-ADDR', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_BANK',    'Party Bank Detail Reference',    'Party bank detail',          'MASTER_DATA','Master Data','BANK',    'Bank',    'PTY-BANK', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_LICENSE', 'Party License Reference',        'Party license record',       'MASTER_DATA','Master Data','LICENSE', 'License', 'PTY-LIC',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_TAX',     'Party Tax Registration Ref.',    'Party tax registration',     'MASTER_DATA','Master Data','TAX',     'Tax Reg', 'PTY-TAX',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_DOCUMENT','Party Document Reference',       'Party document record',      'MASTER_DATA','Master Data','DOCUMENT','Document','PTY-DOC',  '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL),
  ('MASTER_PARTY_NOTE',    'Party Note Reference',           'Party note record',          'MASTER_DATA','Master Data','NOTE',    'Note',    'PTY-NOTE', '-','{DOC}-{SEQ6}',6,'0',1,0,1,'NEVER',false,true,false,true,true,false,NULL)
ON CONFLICT (rule_code) DO UPDATE SET
  document_prefix       = EXCLUDED.document_prefix,
  format_template       = EXCLUDED.format_template,
  is_active             = EXCLUDED.is_active,
  updated_at            = now();

-- =============================================================================
-- SECTION 13: PERMISSIONS (24 codes)
-- =============================================================================

-- SUPABASE_VERIFIED FIX: added action_code column (NOT NULL in live permissions table)
-- action_code = last segment of permission_code
INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('master_data.parties.view',               'View Parties',                   'View party records',                       'MASTER_DATA', 'view',               true),
  ('master_data.parties.create',             'Create Parties',                 'Create new party records',                 'MASTER_DATA', 'create',             true),
  ('master_data.parties.edit',               'Edit Parties',                   'Edit existing party records',              'MASTER_DATA', 'edit',               true),
  ('master_data.parties.delete',             'Delete Parties',                 'Delete party records',                     'MASTER_DATA', 'delete',             true),
  ('master_data.parties.deactivate',         'Deactivate Parties',             'Deactivate/reactivate parties',            'MASTER_DATA', 'deactivate',         true),
  ('master_data.parties.export',             'Export Parties',                 'Export party data to CSV/Excel',           'MASTER_DATA', 'export',             true),
  ('master_data.parties.manage_types',       'Manage Party Types',             'Create/edit party type master records',    'MASTER_DATA', 'manage_types',       true),
  ('master_data.parties.manage_services',    'Manage Party Services',          'Manage service category assignments',      'MASTER_DATA', 'manage_services',    true),
  ('master_data.parties.manage_relationships','Manage Relationships',          'Create/edit party relationships',          'MASTER_DATA', 'manage_relationships',true),
  ('master_data.parties.manage_licenses',    'Manage Licenses',                'Create/edit party licenses',               'MASTER_DATA', 'manage_licenses',    true),
  ('master_data.parties.manage_tax',         'Manage Tax Registrations',       'Create/edit tax registrations',            'MASTER_DATA', 'manage_tax',         true),
  ('master_data.parties.manage_contacts',    'Manage Contacts',                'Create/edit party contacts',               'MASTER_DATA', 'manage_contacts',    true),
  ('master_data.parties.manage_addresses',   'Manage Addresses',               'Create/edit party addresses',              'MASTER_DATA', 'manage_addresses',   true),
  ('master_data.parties.manage_bank_details','Manage Bank Details',            'Create/edit/view party bank details',      'MASTER_DATA', 'manage_bank_details',true),
  ('master_data.parties.view_bank_details',  'View Bank Details',              'View bank details (read-only)',            'MASTER_DATA', 'view_bank_details',  true),
  ('master_data.parties.verify_bank_details','Verify Bank Details',            'Verify/approve bank details',              'MASTER_DATA', 'verify_bank_details',true),
  ('master_data.parties.manage_documents',   'Manage Documents',               'Upload/edit party documents',              'MASTER_DATA', 'manage_documents',   true),
  ('master_data.parties.manage_compliance',  'Manage Compliance',              'Edit compliance profile and holds',        'MASTER_DATA', 'manage_compliance',  true),
  ('master_data.parties.approve',            'Approve Parties',                'Approve party vendor/customer status',     'MASTER_DATA', 'approve',            true),
  ('master_data.parties.blacklist',          'Blacklist Parties',              'Set blacklist status',                     'MASTER_DATA', 'blacklist',          true),
  ('master_data.parties.override_duplicate', 'Override Duplicate Warning',     'Override duplicate detection block',       'MASTER_DATA', 'override_duplicate', true),
  ('master_data.parties.lock',               'Lock Party Record',              'Lock/unlock party for editing',            'MASTER_DATA', 'lock',               true),
  ('master_data.parties.view_audit',         'View Party Audit Log',           'View audit trail for parties',             'MASTER_DATA', 'view_audit',         true),
  ('master_data.parties.print',              'Print Party Record',             'Print party details',                      'MASTER_DATA', 'print',              true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = now();

-- =============================================================================
-- SECTION 14: ROLE-PERMISSION MAPPING
-- Note: sales_manager role may not yet exist — treated as planned.
-- Verify role existence before inserting.
-- =============================================================================

-- system_admin: ALL 24 permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'master_data.parties.%'
ON CONFLICT DO NOTHING;

-- group_admin: all except delete, lock
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_types',
  'master_data.parties.manage_services','master_data.parties.manage_relationships',
  'master_data.parties.manage_licenses','master_data.parties.manage_tax','master_data.parties.manage_contacts',
  'master_data.parties.manage_addresses','master_data.parties.manage_bank_details',
  'master_data.parties.view_bank_details','master_data.parties.verify_bank_details',
  'master_data.parties.manage_documents','master_data.parties.manage_compliance',
  'master_data.parties.approve','master_data.parties.blacklist','master_data.parties.override_duplicate',
  'master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'group_admin'
ON CONFLICT DO NOTHING;

-- company_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_types',
  'master_data.parties.manage_services','master_data.parties.manage_licenses',
  'master_data.parties.manage_tax','master_data.parties.manage_contacts','master_data.parties.manage_addresses',
  'master_data.parties.manage_bank_details','master_data.parties.view_bank_details',
  'master_data.parties.manage_documents','master_data.parties.manage_compliance',
  'master_data.parties.approve','master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'company_admin'
ON CONFLICT DO NOTHING;

-- branch_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.deactivate','master_data.parties.export','master_data.parties.manage_contacts',
  'master_data.parties.manage_addresses','master_data.parties.view_audit','master_data.parties.print'
)
WHERE r.role_code = 'branch_admin'
ON CONFLICT DO NOTHING;

-- finance_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_tax','master_data.parties.manage_bank_details',
  'master_data.parties.view_bank_details','master_data.parties.verify_bank_details',
  'master_data.parties.manage_compliance','master_data.parties.approve','master_data.parties.export',
  'master_data.parties.view_audit'
)
WHERE r.role_code = 'finance_manager'
ON CONFLICT DO NOTHING;

-- procurement_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
  'master_data.parties.manage_contacts','master_data.parties.manage_addresses',
  'master_data.parties.manage_licenses','master_data.parties.manage_documents',
  'master_data.parties.export','master_data.parties.print','master_data.parties.view_audit'
)
WHERE r.role_code = 'procurement_manager'
ON CONFLICT DO NOTHING;

-- sales_manager (INSERT ONLY IF ROLE EXISTS — verify first)
-- REVIEW: Uncomment when sales_manager role is created.
-- INSERT INTO role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
-- FROM roles r JOIN permissions p ON p.permission_code IN (
--   'master_data.parties.view','master_data.parties.create','master_data.parties.edit',
--   'master_data.parties.manage_contacts','master_data.parties.manage_addresses',
--   'master_data.parties.export','master_data.parties.print'
-- )
-- WHERE r.role_code = 'sales_manager'
-- ON CONFLICT DO NOTHING;

-- hr_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_contacts',
  'master_data.parties.manage_documents','master_data.parties.export'
)
WHERE r.role_code = 'hr_manager'
ON CONFLICT DO NOTHING;

-- hse_manager
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.manage_compliance',
  'master_data.parties.manage_documents','master_data.parties.manage_licenses'
)
WHERE r.role_code = 'hse_manager'
ON CONFLICT DO NOTHING;

-- read_only_user (SUPABASE_VERIFIED fix: live role code is 'read_only_user', not 'viewer')
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r JOIN permissions p ON p.permission_code IN (
  'master_data.parties.view','master_data.parties.export','master_data.parties.print'
)
WHERE r.role_code = 'read_only_user'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- SECTION 15: DUPLICATE DETECTION FUNCTION (review only)
-- =============================================================================

CREATE OR REPLACE FUNCTION detect_possible_party_duplicates(
  p_legal_name_en     TEXT    DEFAULT NULL,
  p_trade_name_en     TEXT    DEFAULT NULL,
  p_main_email        TEXT    DEFAULT NULL,
  p_main_mobile       TEXT    DEFAULT NULL,
  p_main_phone        TEXT    DEFAULT NULL,
  p_trn               TEXT    DEFAULT NULL,
  p_license_number    TEXT    DEFAULT NULL,
  p_iban              TEXT    DEFAULT NULL,
  p_website           TEXT    DEFAULT NULL,
  p_exclude_party_id  BIGINT  DEFAULT NULL
)
RETURNS TABLE (
  party_id        BIGINT,
  party_code      TEXT,
  display_name    TEXT,
  match_type      TEXT,
  match_score     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Exact TRN match (blocking level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_TRN' AS match_type, 1.0 AS match_score
  FROM parties p
  JOIN party_tax_registrations tr ON tr.party_id = p.id
  WHERE tr.tax_registration_number = p_trn
    AND tr.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_trn IS NOT NULL

  UNION ALL

  -- Exact license number match (blocking level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_LICENSE' AS match_type, 1.0 AS match_score
  FROM parties p
  JOIN party_licenses lic ON lic.party_id = p.id
  WHERE lic.license_number = p_license_number
    AND lic.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_license_number IS NOT NULL

  UNION ALL

  -- Exact IBAN (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_IBAN' AS match_type, 0.9 AS match_score
  FROM parties p
  JOIN party_bank_details bd ON bd.party_id = p.id
  WHERE bd.iban = p_iban
    AND bd.is_active = true
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_iban IS NOT NULL

  UNION ALL

  -- Exact email (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_EMAIL' AS match_type, 0.85 AS match_score
  FROM parties p
  WHERE lower(p.main_email) = lower(p_main_email)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_email IS NOT NULL

  UNION ALL

  -- Exact mobile (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_MOBILE' AS match_type, 0.85 AS match_score
  FROM parties p
  WHERE p.main_mobile = p_main_mobile
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_mobile IS NOT NULL

  UNION ALL

  -- Exact phone (warning level)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_PHONE' AS match_type, 0.8 AS match_score
  FROM parties p
  WHERE p.main_phone = p_main_phone
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_main_phone IS NOT NULL

  UNION ALL

  -- Similar legal name using pg_trgm — REVIEW ONLY: requires extension
  -- Uncomment after pg_trgm is enabled:
  -- SELECT p.id, p.party_code, p.display_name,
  --        'SIMILAR_LEGAL_NAME' AS match_type,
  --        similarity(lower(p.legal_name_en), lower(p_legal_name_en)) AS match_score
  -- FROM parties p
  -- WHERE similarity(lower(p.legal_name_en), lower(p_legal_name_en)) > 0.45
  --   AND p.is_active = true
  --   AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
  --   AND p_legal_name_en IS NOT NULL

  -- Exact legal name fallback (no extension needed)
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_LEGAL_NAME' AS match_type, 1.0 AS match_score
  FROM parties p
  WHERE lower(p.legal_name_en) = lower(p_legal_name_en)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_legal_name_en IS NOT NULL

  UNION ALL

  -- Exact trade name fallback
  SELECT p.id, p.party_code, p.display_name,
         'EXACT_TRADE_NAME' AS match_type, 0.9 AS match_score
  FROM parties p
  WHERE lower(p.trade_name_en) = lower(p_trade_name_en)
    AND p.is_active = true
    AND (p_exclude_party_id IS NULL OR p.id != p_exclude_party_id)
    AND p_trade_name_en IS NOT NULL;
$$;

-- =============================================================================
-- SECTION 16: ROLLBACK REVIEW NOTES
-- =============================================================================
-- To rollback all changes from this migration (in reverse table dependency order):
--
-- DROP TABLE IF EXISTS party_government_authority_profiles;
-- DROP TABLE IF EXISTS party_recruitment_agency_profiles;
-- DROP TABLE IF EXISTS party_consultant_profiles;
-- DROP TABLE IF EXISTS party_subcontractor_profiles;
-- DROP TABLE IF EXISTS party_vendor_profiles;
-- DROP TABLE IF EXISTS party_customer_profiles;
-- DROP TABLE IF EXISTS party_notes;
-- DROP TABLE IF EXISTS party_relationships;
-- DROP TABLE IF EXISTS party_service_category_assignments;
-- DROP TABLE IF EXISTS party_compliance_profiles;
-- DROP TABLE IF EXISTS party_bank_details;
-- DROP TABLE IF EXISTS party_addresses;
-- DROP TABLE IF EXISTS party_contacts;
-- DROP TABLE IF EXISTS party_finance_profiles;
-- DROP TABLE IF EXISTS party_tax_registrations;
-- DROP TABLE IF EXISTS party_documents;
-- DROP TABLE IF EXISTS party_licenses;
-- DROP TABLE IF EXISTS party_type_assignments;
-- DROP TABLE IF EXISTS parties;
-- DROP TABLE IF EXISTS party_service_categories_master;
-- DROP TABLE IF EXISTS party_relationship_types;
-- DROP TABLE IF EXISTS sales_regions;
-- DROP TABLE IF EXISTS industry_sectors;
-- DROP TABLE IF EXISTS authority_types;
-- DROP TABLE IF EXISTS recruitment_categories;
-- DROP TABLE IF EXISTS consultant_specializations;
-- DROP TABLE IF EXISTS consultant_types;
-- DROP TABLE IF EXISTS work_categories;
-- DROP TABLE IF EXISTS subcontractor_categories;
-- DROP TABLE IF EXISTS procurement_categories;
-- DROP TABLE IF EXISTS vendor_ratings;
-- DROP TABLE IF EXISTS vendor_categories;
-- DROP TABLE IF EXISTS invoice_methods;
-- DROP TABLE IF EXISTS customer_statuses;
-- DROP TABLE IF EXISTS customer_categories;
-- DROP TABLE IF EXISTS payment_methods;
-- DROP TABLE IF EXISTS party_note_types;
-- DROP TABLE IF EXISTS party_credit_ratings;
-- DROP TABLE IF EXISTS party_risk_ratings;
-- DROP TABLE IF EXISTS party_blacklist_statuses;
-- DROP TABLE IF EXISTS party_approval_statuses;
-- DROP TABLE IF EXISTS party_compliance_statuses;
-- DROP TABLE IF EXISTS party_document_statuses;
-- DROP TABLE IF EXISTS party_document_types;
-- DROP TABLE IF EXISTS party_address_types;
-- DROP TABLE IF EXISTS party_contact_departments;
-- DROP TABLE IF EXISTS party_contact_roles;
-- DROP TABLE IF EXISTS party_tax_statuses;
-- DROP TABLE IF EXISTS party_license_statuses;
-- DROP TABLE IF EXISTS party_license_types;
-- DROP TABLE IF EXISTS party_statuses;
-- DROP TABLE IF EXISTS party_natures;
-- DROP TABLE IF EXISTS party_types;
-- DROP FUNCTION IF EXISTS detect_possible_party_duplicates;
--
-- DO NOT DROP:
--   customers, customer_contacts, customer_addresses, customer_bank_details,
--   customer_documents, or any other legacy tables.
-- =============================================================================
-- END OF REVIEW-ONLY MIGRATION
-- DO NOT APPLY
-- =============================================================================
