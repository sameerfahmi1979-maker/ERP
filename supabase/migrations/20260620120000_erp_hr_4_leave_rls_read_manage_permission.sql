-- ERP HR.4 — Leave RLS read fix
-- Allow hr.leave.manage (not only hr.leave.view) to SELECT leave requests/balances.
-- Aligns DB policy with app RBAC where manage roles can create and must read back.

DROP POLICY IF EXISTS emp_leave_req_select ON employee_leave_requests;
CREATE POLICY emp_leave_req_select
  ON employee_leave_requests FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND (
      current_user_has_permission('hr.leave.view')
      OR current_user_has_permission('hr.leave.manage')
    )
  );

DROP POLICY IF EXISTS emp_leave_bal_select ON employee_leave_balances;
CREATE POLICY emp_leave_bal_select
  ON employee_leave_balances FOR SELECT
  USING (
    current_user_can_view_employee(employee_id)
    AND (
      current_user_has_permission('hr.leave.view')
      OR current_user_has_permission('hr.leave.manage')
    )
  );
