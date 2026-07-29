# OUTPUT.3A Template Studio — Demo Evidence

- 01-short-certificate-en: schema OK, validation OK, variables=[employee.full_name_en, employee.employee_code, employee.owner_company, employee.designation, employee.joining_date], PDF: 30278 bytes in 712ms (gotenberg@dev)
- 02-long-letter-multipage-en: schema OK, validation OK, variables=[employee.full_name_en, employee.employee_code, employee.designation, employee.department, employee.joining_date], PDF: 35582 bytes in 468ms (gotenberg@dev)
- 03-arabic-certificate-rtl: schema OK, validation OK, variables=[employee.full_name_ar, employee.employee_code, company.legal_name_ar], PDF: 68307 bytes in 493ms (gotenberg@dev)
- 04-ppe-table-form: schema OK, validation OK, variables=[employee.full_name_en, employee.employee_code, employee.work_site], PDF: 32257 bytes in 483ms (gotenberg@dev)

## Validation-error demo (expected rejections)

- blocks[1] (paragraph): node type 'htmlBlock' is not allowed.
- blocks[1] (paragraph): font size 96 outside approved range 8–36.
- blocks[1] (paragraph): color 'red' is not a safe 6-digit hex value.
- Variable 'payroll.secret_salary' is not in the approved field registry.
