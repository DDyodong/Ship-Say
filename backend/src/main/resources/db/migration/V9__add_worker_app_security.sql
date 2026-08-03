CREATE TABLE admin_role_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  reviewed_by BIGINT,
  reviewed_at TIMESTAMP(6),
  review_comment VARCHAR(500),
  CONSTRAINT fk_admin_role_requests_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_admin_role_requests_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id),
  INDEX idx_admin_role_requests_status (status, requested_at),
  INDEX idx_admin_role_requests_user (user_id, status)
);

CREATE TABLE work_permit_workers (
  permit_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  assigned_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (permit_id, user_id),
  CONSTRAINT fk_work_permit_workers_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_work_permit_workers_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_work_permit_workers_user (user_id, assigned_at)
);

CREATE TABLE personal_ppe_checks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  permit_id BIGINT,
  file_id BIGINT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_analysis',
  passed BOOLEAN NOT NULL DEFAULT FALSE,
  helmet_on BOOLEAN,
  helmet_confidence DECIMAL(7,6),
  harness_on BOOLEAN,
  welding_mask_on BOOLEAN,
  safety_shoes_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  gloves_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  workwear_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  model_name VARCHAR(120),
  message VARCHAR(500),
  checked_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  analyzed_at TIMESTAMP(6),
  CONSTRAINT fk_personal_ppe_checks_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_personal_ppe_checks_permit_id FOREIGN KEY (permit_id) REFERENCES work_permits(id),
  CONSTRAINT fk_personal_ppe_checks_file_id FOREIGN KEY (file_id) REFERENCES files(id),
  INDEX idx_personal_ppe_checks_user_time (user_id, checked_at DESC),
  INDEX idx_personal_ppe_checks_status (status, checked_at)
);
