ALTER TABLE notifications
  ADD COLUMN notification_type VARCHAR(50) NOT NULL DEFAULT 'general' AFTER channel,
  ADD COLUMN dedupe_key VARCHAR(180) NULL AFTER notification_type,
  ADD COLUMN actor_id BIGINT NULL AFTER user_id,
  ADD COLUMN target_url VARCHAR(500) NULL AFTER message,
  ADD COLUMN push_status VARCHAR(30) NOT NULL DEFAULT 'not_attempted' AFTER status,
  ADD COLUMN push_sent_count INT NOT NULL DEFAULT 0 AFTER push_status,
  ADD COLUMN push_failed_count INT NOT NULL DEFAULT 0 AFTER push_sent_count,
  ADD CONSTRAINT fk_notifications_actor_id
    FOREIGN KEY (actor_id) REFERENCES users(id),
  ADD UNIQUE KEY uq_notifications_dedupe_key (dedupe_key),
  ADD INDEX ix_notifications_user_created (user_id, created_at DESC);
