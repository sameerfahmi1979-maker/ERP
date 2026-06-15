-- ERP BASE 002F.5A.1 — Party Master Database Foundation
-- Part 2 of 3: RLS Policies for all 53 tables
-- Source: ERP_BASE_002F_5A_V3_PARTY_MASTER_DRAFT_MIGRATION_REVIEW_ONLY_SUPABASE_VERIFIED.sql
-- Applied: 2026-06-14

-- =============================================================================
-- SECTION 10: RLS POLICIES â€” EXPLICIT FOR EVERY TABLE
-- Helper functions assumed: current_user_has_permission(text), current_user_has_role(text)
-- These must be verified in the live database before applying.
-- =============================================================================

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.1 party_types
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.2â€“10.18 Standard lookup masters
-- Pattern: SELECT = any authenticated, INSERT/UPDATE = manage_types or system_admin, DELETE = system_admin + not system
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- Role-profile lookup masters (customer_categories through sales_regions)
-- Pattern: SELECT = authenticated, INSERT/UPDATE = manage_types or system_admin, DELETE = system_admin
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.3 parties (core)
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.4 party_type_assignments
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.5 party_licenses
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.6 party_documents
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.7 party_tax_registrations
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.8 party_finance_profiles
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.9 party_contacts
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.10 party_addresses
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.11 party_bank_details â€” ELEVATED / SENSITIVE
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.12 party_compliance_profiles â€” ELEVATED
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.13 party_service_category_assignments
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.14 party_relationships
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.15 party_notes â€” Private note filter
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- 10.16â€“10.21 Role profile tables (all same pattern)
-- SELECT = view, INSERT/UPDATE = edit, DELETE = system_admin
-- â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
