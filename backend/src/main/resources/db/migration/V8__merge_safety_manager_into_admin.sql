-- Preserve existing SAFETY_MANAGER assignments by converting them to ADMIN
-- at the same site scope. INSERT IGNORE handles users who already have ADMIN.
INSERT IGNORE INTO user_roles (user_id, role_id, site_id)
SELECT ur.user_id, admin_role.id, ur.site_id
FROM user_roles ur
JOIN roles safety_role ON safety_role.id = ur.role_id
JOIN roles admin_role ON admin_role.role_code = 'ADMIN'
WHERE safety_role.role_code = 'SAFETY_MANAGER';

DELETE ur
FROM user_roles ur
JOIN roles role ON role.id = ur.role_id
WHERE role.role_code = 'SAFETY_MANAGER';

DELETE FROM roles WHERE role_code = 'SAFETY_MANAGER';

UPDATE roles
SET name = '관리자',
    description = '관제, 작업허가, 위험 분석, 기준정보와 운영 기능을 관리합니다.'
WHERE role_code = 'ADMIN';
