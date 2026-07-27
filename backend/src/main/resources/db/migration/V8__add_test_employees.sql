-- Test employee registry entries for exercising the web registration flow.
-- INSERT IGNORE keeps this migration safe when an employee number already exists.
INSERT IGNORE INTO employees (employee_no, name, status) VALUES
  ('TEST-0001', '김테스트', 'active'),
  ('TEST-0002', '이테스트', 'active'),
  ('TEST-0003', '박테스트', 'active'),
  ('TEST-0004', '최테스트', 'active'),
  ('TEST-0005', '정테스트', 'active');
