CREATE TABLE employee_role_assignments (
  employee_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (employee_id),
  CONSTRAINT fk_employee_role_employee
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_employee_role_role
    FOREIGN KEY (role_id) REFERENCES roles(id)
);

CREATE INDEX ix_employee_role_role_id
  ON employee_role_assignments(role_id);

-- Development accounts for testing both registration paths.
INSERT IGNORE INTO employees (employee_no, name, status) VALUES
  ('A-0002', '홍길동', 'active');

INSERT INTO employee_role_assignments (employee_id, role_id)
SELECT e.id, r.id
FROM employees e
JOIN roles r ON r.role_code = 'ADMIN'
WHERE e.employee_no = 'A-0001';

INSERT INTO employee_role_assignments (employee_id, role_id)
SELECT e.id, r.id
FROM employees e
JOIN roles r ON r.role_code = 'WORKER'
WHERE e.employee_no = 'A-0002';
