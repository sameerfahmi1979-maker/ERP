-- ERP BASE 002F.5A.1 — Party Master Database Foundation
-- Part 1 of 3: Table DDL, Indexes, and RLS Enable
-- Source: ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_SUPABASE_VERIFIED.sql
-- Applied: 2026-06-14
-- Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co

--   4. Test in staging environment first.
--   5. Run inside a transaction with ROLLBACK SAVEPOINT strategy.
-- =============================================================================

-- =============================================================================
-- SECTION 0: EXTENSIONS (review only â€” verify with Supabase support)
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
-- SECTION 5: CORE â€” parties
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
  license_document_id         BIGINT,  -- FK to party_documents added via ALTER TABLE below (party_documents created later)
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

-- Now that party_documents exists, add the FK from party_licenses:
ALTER TABLE party_licenses ADD CONSTRAINT fk_party_licenses_document
  FOREIGN KEY (license_document_id) REFERENCES party_documents(id) ON DELETE SET NULL;

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
-- SECTION 9: ENABLE ROW LEVEL SECURITY â€” ALL NEW TABLES
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

