CREATE TABLE permit_simops_conflicts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  permit_a_id BIGINT NOT NULL,
  permit_b_id BIGINT NOT NULL,
  rule_code VARCHAR(80) NOT NULL,
  risk VARCHAR(30) NOT NULL,
  reason TEXT NOT NULL,
  legal_ref TEXT,
  work_types JSON NOT NULL DEFAULT (JSON_ARRAY()),
  zone_relation VARCHAR(50),
  detected_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uk_permit_simops_pair_rule (permit_a_id, permit_b_id, rule_code),
  CONSTRAINT fk_permit_simops_conflicts_a FOREIGN KEY (permit_a_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT fk_permit_simops_conflicts_b FOREIGN KEY (permit_b_id) REFERENCES work_permits(id) ON DELETE CASCADE,
  CONSTRAINT chk_permit_simops_order CHECK (permit_a_id < permit_b_id)
);

CREATE INDEX idx_permit_simops_conflicts_b ON permit_simops_conflicts(permit_b_id);

