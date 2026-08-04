ALTER TABLE safety_events
  ADD COLUMN target_user_id BIGINT NULL AFTER reporter_id,
  ADD CONSTRAINT fk_safety_events_target_user_id
    FOREIGN KEY (target_user_id) REFERENCES users(id),
  ADD INDEX ix_safety_events_target_user_time (target_user_id, event_time DESC);

ALTER TABLE notifications
  ADD COLUMN acknowledged_at TIMESTAMP(6) NULL AFTER sent_at;

UPDATE safety_events
SET target_user_id = reporter_id,
    reporter_id = NULL,
    source_type = 'system_alert'
WHERE JSON_UNQUOTE(JSON_EXTRACT(payload, '$.sampleKey')) = 'testworker-push-demo';
