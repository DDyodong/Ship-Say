-- Registration-only employee records for verifying the deployed signup flow.
-- No user accounts or passwords are created by this migration.
INSERT IGNORE INTO employees (employee_no, name, status) VALUES
  ('DEMO-W-001', '데모작업자01', 'active'),
  ('DEMO-W-002', '데모작업자02', 'active'),
  ('DEMO-W-003', '데모작업자03', 'active'),
  ('DEMO-W-004', '데모작업자04', 'active'),
  ('DEMO-W-005', '데모작업자05', 'active'),
  ('DEMO-W-006', '데모작업자06', 'active'),
  ('DEMO-W-007', '데모작업자07', 'active'),
  ('DEMO-W-008', '데모작업자08', 'active'),
  ('DEMO-A-001', '데모관리자01', 'active'),
  ('DEMO-A-002', '데모관리자02', 'active');

INSERT IGNORE INTO employee_role_assignments (employee_id, role_id)
SELECT e.id, r.id
FROM employees e
JOIN roles r ON r.role_code = 'WORKER'
WHERE e.employee_no IN (
  'DEMO-W-001', 'DEMO-W-002', 'DEMO-W-003', 'DEMO-W-004',
  'DEMO-W-005', 'DEMO-W-006', 'DEMO-W-007', 'DEMO-W-008'
);

INSERT IGNORE INTO employee_role_assignments (employee_id, role_id)
SELECT e.id, r.id
FROM employees e
JOIN roles r ON r.role_code = 'ADMIN'
WHERE e.employee_no IN ('DEMO-A-001', 'DEMO-A-002');
