# Phase 002D: Manual Testing Guide

**Version:** 1.0  
**Date:** 2026-05-27  
**Environment:** localhost:3000 (dev server)  
**User Role Required:** Admin with `users.manage`, `roles.view`, `roles.manage` permissions

---

## PREREQUISITES

### 1. Dev Server Running
```bash
# Check if running on port 3000
curl http://localhost:3000
# Or open in browser: http://localhost:3000
```

### 2. Login Credentials
- **Email:** (your admin user email)
- **Password:** (your admin password)
- **Required Permissions:** users.manage, roles.view, roles.manage, organizations.manage, branches.manage

### 3. Test Data Preparation
Before testing, ensure you have:
- At least 1 existing Owner Company
- At least 1 existing Branch
- At least 2 existing Roles (for role assignment testing)

---

## TEST SUITE 1: OWNER COMPANY FORM UPGRADE

### Test 1.1: Open Organization Form
**Steps:**
1. Navigate to `/admin/organizations`
2. Click "Create Organization" button (top right)
3. Verify dialog opens with title "Create Organization"

**Expected Result:**
- ✅ Dialog opens
- ✅ Shows 5 tabs: Basic, Address, Legal, Tax, Notes
- ✅ "Basic" tab is active by default

---

### Test 1.2: Navigate Tabs
**Steps:**
1. Click each tab sequentially: Address → Legal → Tax → Notes → Basic
2. Verify tab content changes without closing dialog

**Expected Result:**
- ✅ Tab content switches correctly
- ✅ No console errors
- ✅ Form state persists across tab switches

---

### Test 1.3: Fill Basic Information
**Steps:**
1. Go to "Basic" tab
2. Fill fields:
   - Legal Name (English): `Test Company LLC`
   - Legal Name (Arabic): `شركة اختبار`
   - Company Code: `TEST-001`
   - Short Name: `TestCo`
   - Legal Form: `LLC`
   - Country: `United Arab Emirates` (default)
   - Currency: `AED` (default)
   - Status: `Active` (default)

**Expected Result:**
- ✅ All fields accept input
- ✅ Company Code enforces uppercase
- ✅ Company Code cannot be edited if editing existing org

---

### Test 1.4: Fill Address & Contact
**Steps:**
1. Go to "Address" tab
2. Fill fields:
   - Emirate: Select `Dubai` from dropdown
   - City: `Dubai`
   - Area: `Business Bay`
   - Address Line 1: `Building 123, Floor 4`
   - Address Line 2: `Office 401`
   - PO Box: `12345`
   - Makani Number: `1234567890`
   - Primary Email: `test@testcompany.ae`
   - Primary Phone: `+971 4 123 4567`
   - Website: `https://testcompany.ae`

**Expected Result:**
- ✅ Emirate dropdown shows all 7 UAE emirates
- ✅ Email field validates email format
- ✅ Website field validates URL format

---

### Test 1.5: Fill Legal & Licensing
**Steps:**
1. Go to "Legal" tab
2. Fill fields:
   - Trade License Number: `CN-1234567`
   - Licensing Authority: `DED`
   - License Issue Date: `2024-01-01`
   - License Expiry Date: `2025-01-01`
   - Chamber Membership No: `CH-123456`
   - Chamber Expiry Date: `2025-12-31`

**Expected Result:**
- ✅ Date pickers work correctly
- ✅ Dates can be selected via calendar UI
- ✅ Dates display in correct format

---

### Test 1.6: Fill Tax & Compliance
**Steps:**
1. Go to "Tax" tab
2. Fill/check fields:
   - TRN: `100123456789012`
   - VAT Registered: ☑ (checked by default)
   - Corporate Tax Number: `CT-123456`
   - Corporate Tax Registered: ☑
   - ICV Certificate Number: `ICV-123456`
   - ICV Score: `75.5`
   - ICV Issue Date: `2024-06-01`
   - ICV Expiry Date: `2025-06-01`
   - ADNOC Supplier Number: `ADNOC-987654`

**Expected Result:**
- ✅ Checkboxes toggle correctly
- ✅ ICV Score accepts decimal (0-100 range)
- ✅ ICV Score rejects values < 0 or > 100

---

### Test 1.7: Fill Notes & Submit
**Steps:**
1. Go to "Notes" tab
2. Fill fields:
   - Logo URL: `https://testcompany.ae/logo.png`
   - Notes: `Test organization for Phase 002D validation`
3. Click "Create" button

**Expected Result:**
- ✅ Submit button shows loading spinner
- ✅ Toast success message: "Organization created"
- ✅ Dialog closes automatically
- ✅ New organization appears in table
- ✅ Page data refreshes

---

### Test 1.8: Edit Existing Organization
**Steps:**
1. Find the newly created organization in table
2. Click "..." menu → "Edit"
3. Verify all tabs show previously entered data
4. Modify one field (e.g., change City to "Sharjah")
5. Click "Update"

**Expected Result:**
- ✅ All previously entered data is pre-filled
- ✅ Data persists across tabs
- ✅ Update saves successfully
- ✅ Toast: "Organization updated"

---

### Test 1.9: Verify Database Persistence
**Steps:**
1. Refresh the page (F5)
2. Edit the organization again
3. Verify all UAE-specific fields are still populated

**Expected Result:**
- ✅ All 19 new fields persist in database
- ✅ No data loss after page refresh

---

## TEST SUITE 2: BRANCH FORM UPGRADE

### Test 2.1: Open Branch Form
**Steps:**
1. Navigate to `/admin/branches`
2. Click "Create Branch" button
3. Verify dialog opens with 5 tabs: Basic, Location, Contact, Operations, Notes

**Expected Result:**
- ✅ Dialog opens correctly
- ✅ Organization dropdown is populated
- ✅ Branch Code field is editable

---

### Test 2.2: Fill Basic Information
**Steps:**
1. Go to "Basic" tab
2. Fill fields:
   - Organization: Select an existing company
   - Branch Code: `BR-001`
   - Branch Name (English): `Main Office Dubai`
   - Branch Name (Arabic): `المكتب الرئيسي دبي`
   - Branch Type: Select `Head Office`
   - Is Main Branch: ☑
   - Status: `Active`
   - Operating Status: `Active`

**Expected Result:**
- ✅ Branch Type dropdown shows 9 options
- ✅ Operating Status dropdown shows 4 options (active/maintenance/suspended/closed)
- ✅ Is Main Branch checkbox works

---

### Test 2.3: Fill Location
**Steps:**
1. Go to "Location" tab
2. Fill fields:
   - Emirate: `Dubai`
   - City: `Dubai`
   - Area: `Business Bay`
   - PO Box: `54321`
   - Address Line 1: `Tower A, Floor 10`
   - Address Line 2: `Office 1001-1005`
   - Makani Number: `9876543210`
   - Latitude: `25.276987`
   - Longitude: `55.296249`

**Expected Result:**
- ✅ Latitude accepts values -90 to 90
- ✅ Longitude accepts values -180 to 180
- ✅ Decimal precision allowed

---

### Test 2.4: Fill Contact
**Steps:**
1. Go to "Contact" tab
2. Fill fields:
   - Branch Phone: `+971 4 987 6543`
   - Branch Email: `dubai@testcompany.ae`
   - Contact Person Name: `Ahmed Al Mansoori`
   - Contact Person Phone: `+971 50 123 4567`
   - Contact Person Email: `ahmed@testcompany.ae`

**Expected Result:**
- ✅ Email fields validate format
- ✅ All fields accept input

---

### Test 2.5: Set Operational Flags
**Steps:**
1. Go to "Operations" tab
2. Check all 4 operational flags:
   - ☑ Has Workshop
   - ☑ Has Warehouse
   - ☑ Has Yard
   - ☑ Has Weighbridge

**Expected Result:**
- ✅ All 4 checkboxes work independently
- ✅ Helper text explains each flag

---

### Test 2.6: Fill Notes & Submit
**Steps:**
1. Go to "Notes" tab
2. Fill: `Head office branch with full operational capabilities`
3. Click "Create"

**Expected Result:**
- ✅ Branch created successfully
- ✅ Toast: "Branch created"
- ✅ New branch appears in table

---

### Test 2.7: Edit & Verify Persistence
**Steps:**
1. Edit the newly created branch
2. Verify all 15 new fields are populated
3. Change Operating Status to "Maintenance"
4. Uncheck "Has Weighbridge"
5. Click "Update"

**Expected Result:**
- ✅ Changes saved successfully
- ✅ Operating Status badge updates
- ✅ Operational flags persist correctly

---

## TEST SUITE 3: ADD USER FEATURE

### Test 3.1: Check Add User Button Visibility
**Steps:**
1. Navigate to `/admin/users`
2. Look for "Add User" button in page header (top right)

**Expected Result:**
- ✅ Button visible if user has `users.manage` permission
- ✅ Button hidden if permission not granted

---

### Test 3.2: Open Add User Dialog
**Steps:**
1. Click "Add User" button
2. Verify dialog opens with 4 sections:
   - Authentication
   - Profile Information
   - Organization Assignment
   - Initial Role Assignment

**Expected Result:**
- ✅ Dialog opens with title "Add New User"
- ✅ "Send invite email" checkbox checked by default
- ✅ Temporary password field hidden

---

### Test 3.3: Toggle Invite vs. Password
**Steps:**
1. Uncheck "Send invite email"
2. Verify "Temporary Password" field appears with `required` attribute
3. Re-check "Send invite email"
4. Verify password field disappears

**Expected Result:**
- ✅ Password field shows/hides correctly
- ✅ Required validation works

---

### Test 3.4: Add User - Temporary Password Method
**Steps:**
1. Uncheck "Send invite email"
2. Fill fields:
   - Email: `testuser1@testcompany.ae`
   - Temporary Password: `Test1234!`
   - Full Name: `Mohammed Ahmed`
   - Display Name: `Mohammed`
   - Phone: `+971 50 999 8888`
   - Status: `Active`
   - Job Title: `Operations Manager`
   - Department: `Operations`
3. Select Organization Assignment:
   - Company: Select your test company
   - Branch: Select your test branch
4. Select Initial Role Assignment:
   - Role: Select an active role
   - Role Scope (Company): Select same company
   - Role Scope (Branch): Leave as "All branches"
5. Click "Create User"

**Expected Result:**
- ✅ Loading spinner shows
- ✅ Toast success: "User created successfully"
- ✅ Dialog closes
- ✅ New user appears in users table
- ✅ User email is confirmed (no verification required)
- ✅ Audit log created (check `audit_logs` table)

---

### Test 3.5: Verify User in Database
**Steps:**
1. Check Supabase Auth dashboard → Users
2. Find `testuser1@testcompany.ae`
3. Verify:
   - Email confirmed: ✅
   - User metadata includes `full_name`

**Expected Result:**
- ✅ Auth user exists
- ✅ Email is confirmed
- ✅ Metadata populated

---

### Test 3.6: Verify User Profile Created
**Steps:**
1. Check `user_profiles` table in Supabase
2. Find record where `auth_user_id` matches the new user
3. Verify all fields populated:
   - full_name, display_name, phone
   - job_title, department
   - owner_company_id, branch_id
   - status = 'active'

**Expected Result:**
- ✅ Profile record exists
- ✅ All fields match form input
- ✅ Foreign keys link correctly

---

### Test 3.7: Verify Initial Role Assignment
**Steps:**
1. Check `user_roles` table
2. Find record where `user_profile_id` matches new user
3. Verify:
   - role_id matches selected role
   - owner_company_id matches selected scope
   - is_active = true

**Expected Result:**
- ✅ Role assignment exists
- ✅ Scope set correctly
- ✅ Assignment is active

---

### Test 3.8: Add User - Invite Email Method (Optional)
**Steps:**
1. Click "Add User" again
2. Check "Send invite email" (default)
3. Fill:
   - Email: `testuser2@testcompany.ae`
   - Full Name: `Sara Hassan`
   - (other fields as before)
4. Click "Create User"

**Expected Result (if SMTP configured):**
- ✅ User created successfully
- ✅ Invite email sent to `testuser2@testcompany.ae`
- ✅ User email is NOT confirmed (pending email click)
- ✅ User appears in Auth dashboard with "Pending" status

**Expected Result (if SMTP NOT configured):**
- ❌ Error toast: "Failed to send invite: SMTP not configured"
- ❌ User NOT created
- Workaround: Use temporary password method

---

### Test 3.9: Test Validation Errors
**Steps:**
1. Click "Add User"
2. Try to submit with:
   - Empty email → Should fail
   - Invalid email (no @) → Should fail
   - Password < 8 chars (if password method) → Should fail
   - Empty full name → Should fail
3. Fill all required fields and submit

**Expected Result:**
- ✅ Browser HTML5 validation triggers
- ✅ Error messages shown
- ✅ Form does not submit until valid

---

### Test 3.10: Test Branch Filtering
**Steps:**
1. Click "Add User"
2. Do NOT select a company
3. Verify Branch dropdown is disabled
4. Select a company
5. Verify Branch dropdown enables and shows only branches from that company
6. Select a different company
7. Verify Branch dropdown updates to show new company's branches

**Expected Result:**
- ✅ Branch dropdown disabled until company selected
- ✅ Branch list filters by selected company
- ✅ Branch list updates when company changes

---

### Test 3.11: Test Duplicate Email
**Steps:**
1. Try to create a user with email that already exists
2. Click "Create User"

**Expected Result:**
- ❌ Error toast: "Failed to create user: Email already registered" (or similar)
- ❌ User NOT created
- ✅ Dialog remains open for correction

---

### Test 3.12: Test Cleanup on Failure (Advanced)
**Steps:**
This test requires manually simulating a failure. Skip if not confident.

1. Temporarily break the `user_profiles` insert (e.g., remove a required field in the server action)
2. Try to create a user
3. Verify:
   - Error toast shown
   - Auth user is NOT created (or is deleted after failure)
   - No orphan Auth users in dashboard

**Expected Result:**
- ✅ Cleanup logic works (Auth user deleted if profile fails)
- ✅ No partial data left in database

---

## TEST SUITE 4: ROLE DETAIL VIEW

### Test 4.1: Open Role Detail Drawer
**Steps:**
1. Navigate to `/admin/roles`
2. Find a role that has users assigned (e.g., "Admin" or "Manager")
3. Click "..." menu → "View Details"

**Expected Result:**
- ✅ Drawer slides in from right side
- ✅ Drawer does NOT block entire screen (non-modal)
- ✅ Loading skeleton shows briefly

---

### Test 4.2: Verify Role Information Display
**Steps:**
1. Check the Role Information card shows:
   - Role Code (e.g., `admin`)
   - Type badge (System/Custom)
   - Status badge (Active/Inactive)
   - Category (if set)
   - Level (if set)
   - Assignable (Yes/No)

**Expected Result:**
- ✅ All fields display correctly
- ✅ Badges colored appropriately
- ✅ Role icon (Shield) visible

---

### Test 4.3: Verify Assigned Users List
**Steps:**
1. Check "Assigned Users" section shows count (e.g., "(3)")
2. Verify list shows:
   - User full name
   - Job title (if set)
   - Department (if set)
   - Scope indicator (Global/Company/Branch with icon)
   - Assignment date

**Expected Result:**
- ✅ All assigned users displayed
- ✅ Profile details accurate
- ✅ Scope indicators show correct icons:
  - Building2 icon for company-level
  - MapPin icon for branch-level
  - "Global" badge for global scope

---

### Test 4.4: Test Role with No Assigned Users
**Steps:**
1. Find a role with 0 assigned users (create one if needed)
2. Click "View Details"
3. Check "Assigned Users (0)" section

**Expected Result:**
- ✅ Shows empty state:
  - Users icon (dimmed)
  - Text: "No users assigned to this role"
  - Bordered dashed box

---

### Test 4.5: Test Drawer Close
**Steps:**
1. With drawer open, click outside the drawer (on dimmed background)
2. Verify drawer closes
3. Re-open drawer
4. Click X button (if present) or press ESC key

**Expected Result:**
- ✅ Drawer closes when clicking backdrop
- ✅ Drawer closes with ESC key
- ✅ No console errors

---

### Test 4.6: Test Multiple Role Views
**Steps:**
1. Open role detail for Role A
2. Close drawer
3. Open role detail for Role B
4. Verify different data shows (not cached)

**Expected Result:**
- ✅ Data refreshes for each role
- ✅ No stale data displayed
- ✅ useEffect cleanup works

---

### Test 4.7: Test Permission Check
**Steps:**
1. Log in as a user WITHOUT `roles.view` permission
2. Navigate to `/admin/roles`
3. Try to click "View Details"

**Expected Result:**
- ❌ Drawer should show error: "You do not have permission to view roles"
- OR
- ✅ "View Details" menu item hidden

---

### Test 4.8: Test Role with Notes
**Steps:**
1. Find/create a role with notes populated
2. Click "View Details"
3. Scroll to bottom

**Expected Result:**
- ✅ "Notes" section visible
- ✅ Notes text displayed with preserved formatting (whitespace-pre-wrap)

---

### Test 4.9: Test Role without Notes
**Steps:**
1. Find a role with no notes
2. Click "View Details"

**Expected Result:**
- ✅ "Notes" section NOT displayed
- ✅ No empty notes card shown

---

### Test 4.10: Test Scope Indicator Logic
**Steps:**
1. Find a role with users assigned at different scopes:
   - Global scope (no company, no branch)
   - Company-level scope (company set, no branch)
   - Branch-level scope (both company and branch set)
2. Click "View Details"
3. Verify each user shows correct scope indicator

**Expected Result:**
- ✅ Global: "Global" badge
- ✅ Company: Building2 icon + company name
- ✅ Branch: MapPin icon + branch name

---

### Test 4.11: Test Inactive User Assignments
**Steps:**
1. Find a role with an inactive user assignment (is_active = false)
2. Click "View Details"

**Expected Result:**
- ✅ User shows "Inactive" badge
- ✅ User still listed (not hidden)

---

### Test 4.12: Test Assignment Date Display
**Steps:**
1. Open role detail
2. Check assignment dates for multiple users

**Expected Result:**
- ✅ Dates displayed in locale format (e.g., "5/27/2026" or "27/05/2026")
- ✅ Most recent assignments at top (descending order)

---

## TEST SUITE 5: INTEGRATION TESTS

### Test 5.1: Create Organization → Create Branch → Add User
**Steps:**
1. Create a new organization with all UAE fields
2. Create a branch under that organization with operational flags
3. Add a user assigned to that organization and branch
4. Verify user appears in users table with correct company/branch

**Expected Result:**
- ✅ Full flow works end-to-end
- ✅ Data links correctly (FKs)

---

### Test 5.2: Assign Role → View Role Detail
**Steps:**
1. Go to `/admin/users` and assign a new role to an existing user
2. Go to `/admin/roles` and view details for that role
3. Verify the user appears in the assigned users list

**Expected Result:**
- ✅ Role assignment reflects immediately (or after page refresh)
- ✅ User profile details accurate in role detail

---

### Test 5.3: Update User Company → Check Role Scope
**Steps:**
1. Edit a user and change their assigned company
2. View role details for a role assigned to that user
3. Verify scope still displays correctly

**Expected Result:**
- ✅ Scope updates reflect in role detail view
- ✅ No broken links or null references

---

### Test 5.4: Deactivate User → Check Role Detail
**Steps:**
1. Edit a user and change status to "Inactive"
2. View role details for a role assigned to that user
3. Verify user shows "Inactive" badge

**Expected Result:**
- ✅ Status badge updates
- ✅ User still visible in list

---

## TEST SUITE 6: AUDIT LOG VERIFICATION

### Test 6.1: Check User Creation Audit
**Steps:**
1. Create a new user
2. Go to `/admin/audit` (if audit page exists)
3. OR Query `audit_logs` table directly:
   ```sql
   SELECT * FROM audit_logs 
   WHERE entity_name = 'user_profiles'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

**Expected Result:**
- ✅ Audit log entry exists
- ✅ `action` = 'create'
- ✅ `new_values` contains email, full_name, status, auth_method
- ✅ `module_code` = 'users'

---

### Test 6.2: Check Organization Update Audit
**Steps:**
1. Edit an organization (change one UAE field, e.g., TRN)
2. Query `audit_logs` table

**Expected Result:**
- ✅ Audit log entry exists
- ✅ `action` = 'update'
- ✅ `old_values` and `new_values` show diff
- ✅ `module_code` = 'organizations'

---

## TEST SUITE 7: ERROR HANDLING

### Test 7.1: Network Error Simulation
**Steps:**
1. Open browser DevTools → Network tab
2. Set throttling to "Offline"
3. Try to create an organization
4. Re-enable network

**Expected Result:**
- ❌ Error toast: "An unexpected error occurred" (or network error)
- ✅ Form stays open
- ✅ User can retry

---

### Test 7.2: Permission Denied
**Steps:**
1. Log in as a user without `users.manage`
2. Try to access `/admin/users`
3. Verify "Add User" button not visible

**Expected Result:**
- ✅ Button hidden
- ✅ Direct server action call would fail with permission error

---

### Test 7.3: Invalid Role ID
**Steps:**
1. Manually trigger `getRoleWithUsersAction(99999)` (role ID that doesn't exist)
2. Check response

**Expected Result:**
- ❌ `success: false`
- ❌ `error: "Role not found"`
- ✅ No uncaught exceptions

---

## TEST SUITE 8: PERFORMANCE & UI

### Test 8.1: Large Form Performance
**Steps:**
1. Open organization form with 38 fields
2. Navigate through all 5 tabs rapidly
3. Check for lag or UI freezing

**Expected Result:**
- ✅ Tab switches are instant (< 100ms)
- ✅ No visible lag
- ✅ No React warnings in console

---

### Test 8.2: Drawer Scroll Performance
**Steps:**
1. Open role detail for a role with 20+ assigned users
2. Scroll up and down in drawer

**Expected Result:**
- ✅ Smooth scrolling
- ✅ No layout shifts

---

### Test 8.3: Responsive Design (Mobile)
**Steps:**
1. Open browser DevTools → Toggle device toolbar (Ctrl+Shift+M)
2. Set to iPhone 12 Pro (390x844)
3. Test:
   - Organization form (all tabs)
   - Branch form (all tabs)
   - Add User dialog
   - Role detail drawer

**Expected Result:**
- ✅ Tabs wrap or scroll horizontally
- ✅ Forms remain usable (not cut off)
- ✅ Drawer takes full width on mobile

---

## TEST SUITE 9: ACCESSIBILITY (Optional)

### Test 9.1: Keyboard Navigation
**Steps:**
1. Open organization form
2. Use TAB key to navigate through all fields
3. Use SHIFT+TAB to navigate backwards

**Expected Result:**
- ✅ Focus moves to each field in logical order
- ✅ Focus visible (outline or ring)

---

### Test 9.2: Screen Reader Test (if available)
**Steps:**
1. Enable screen reader (NVDA, JAWS, or macOS VoiceOver)
2. Navigate through Add User dialog

**Expected Result:**
- ✅ Labels read correctly
- ✅ Required fields announced
- ✅ Error messages read aloud

---

## SUMMARY CHECKLIST

After completing all tests, verify:

- [ ] All 9 test suites passed
- [ ] No critical errors in browser console
- [ ] No TypeScript errors (`npm run typecheck`)
- [ ] Build succeeds (`npm run build`)
- [ ] Database migrations applied successfully
- [ ] New columns visible in Supabase dashboard
- [ ] Audit logs capturing all create/update actions
- [ ] No RLS errors in Supabase logs
- [ ] Forms are responsive on desktop and mobile
- [ ] All user permissions enforced correctly

---

## REPORTING ISSUES

If any test fails, document:

1. **Test Number:** (e.g., Test 3.4)
2. **Steps Taken:** (what you did)
3. **Expected Result:** (what should happen)
4. **Actual Result:** (what actually happened)
5. **Error Messages:** (console errors, toast messages)
6. **Screenshots:** (if applicable)
7. **Browser/Device:** (Chrome 120, Firefox 121, etc.)

Submit report to development team for triage.

---

**Testing Guide Version:** 1.0  
**Last Updated:** 2026-05-27  
**Estimated Testing Time:** 60-90 minutes (for full suite)
