CREATE TABLE fcm_installations (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  fid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  platform VARCHAR(30) NOT NULL DEFAULT 'web',
  device_name VARCHAR(160),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT ux_fcm_installations_fid UNIQUE (fid),
  CONSTRAINT fk_fcm_installations_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX ix_fcm_installations_user_active (user_id, active)
);
