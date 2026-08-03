ALTER TABLE safety_events
  ADD COLUMN ppe_check_id BIGINT NULL AFTER detection_id,
  ADD CONSTRAINT fk_safety_events_ppe_check_id
    FOREIGN KEY (ppe_check_id) REFERENCES personal_ppe_checks(id) ON DELETE SET NULL,
  ADD UNIQUE INDEX uk_safety_events_ppe_check_id (ppe_check_id);
