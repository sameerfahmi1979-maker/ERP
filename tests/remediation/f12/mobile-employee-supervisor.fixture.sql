-- The two employee self-FKs deliberately refer to different people.
CREATE TABLE countries(id bigint PRIMARY KEY, name_en text);
CREATE TABLE hr_employee_categories(id bigint PRIMARY KEY, name_en text);
CREATE TABLE hr_employment_types(id bigint PRIMARY KEY, name_en text);
CREATE TABLE owner_companies(id bigint PRIMARY KEY, legal_name_en text);
CREATE TABLE hr_mohre_establishments(id bigint PRIMARY KEY, establishment_name text);
CREATE TABLE hr_relationship_types(id bigint PRIMARY KEY, name_en text);
CREATE TABLE employees(
  id bigint PRIMARY KEY, workspace_revision bigint, employee_code text,
  full_name_en text, full_name_ar text, known_name text, gender text,
  nationality_id bigint REFERENCES countries, date_of_birth date, marital_status text,
  mobile_number text, personal_email text, uae_address text, home_country_address text,
  photo_dms_document_id bigint, photo_framing jsonb, owner_company_id bigint REFERENCES owner_companies,
  branch_id bigint, department_id bigint, designation_id bigint,
  employee_category_id bigint REFERENCES hr_employee_categories,
  employment_type_id bigint REFERENCES hr_employment_types,
  joining_date date, actual_joining_date date, employee_status text,
  reporting_manager_id bigint REFERENCES employees, supervisor_id bigint REFERENCES employees,
  primary_work_site_id bigint, sponsor_company_id bigint REFERENCES owner_companies,
  mohre_establishment_id bigint REFERENCES hr_mohre_establishments,
  probation_start_date date, probation_end_date date, contract_type text,
  contract_start_date date, contract_end_date date, notice_period_days integer,
  inactive_date date, inactive_reason text, emergency_contact_name text, emergency_contact_mobile text,
  emergency_contact_relationship_type_id bigint REFERENCES hr_relationship_types,
  created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid,
  deleted_at timestamptz, deleted_by uuid
);
INSERT INTO employees(id, full_name_en, supervisor_id, reporting_manager_id) VALUES
  (1, 'Supervisor', NULL, NULL), (2, 'Report', 1, 3), (3, 'Manager', 1, NULL),
  (4, 'Out of scope', NULL, NULL), (5, 'Second report', 4, 2);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY visible_employees ON employees FOR SELECT USING (id <> 4);
