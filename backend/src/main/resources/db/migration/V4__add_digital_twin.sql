CREATE TABLE twin_facilities (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  site_id BIGINT NOT NULL,
  facility_code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  facility_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'normal',
  risk_level VARCHAR(30) NOT NULL DEFAULT 'low',
  progress_percent INT NOT NULL DEFAULT 0,
  map_x DECIMAL(6, 2) NOT NULL,
  map_y DECIMAL(6, 2) NOT NULL,
  map_width DECIMAL(6, 2) NOT NULL,
  map_height DECIMAL(6, 2) NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ux_twin_facility_code UNIQUE (facility_code),
  CONSTRAINT fk_twin_facilities_site FOREIGN KEY (site_id) REFERENCES sites(id)
);

CREATE TABLE twin_assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  facility_id BIGINT NOT NULL,
  asset_code VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  model_name VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'standby',
  position_x DECIMAL(8, 3) NOT NULL DEFAULT 0,
  position_y DECIMAL(8, 3) NOT NULL DEFAULT 0,
  position_z DECIMAL(8, 3) NOT NULL DEFAULT 0,
  metadata JSON NOT NULL DEFAULT (JSON_OBJECT()),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT ux_twin_asset_code UNIQUE (asset_code),
  CONSTRAINT fk_twin_assets_facility FOREIGN KEY (facility_id) REFERENCES twin_facilities(id)
);

CREATE TABLE twin_scenario_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  facility_id BIGINT NOT NULL,
  scenario_type VARCHAR(50) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  duration_seconds INT NOT NULL,
  requested_by BIGINT,
  started_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  ends_at TIMESTAMP(6) NOT NULL,
  completed_at TIMESTAMP(6),
  CONSTRAINT fk_twin_scenarios_facility FOREIGN KEY (facility_id) REFERENCES twin_facilities(id),
  CONSTRAINT fk_twin_scenarios_user FOREIGN KEY (requested_by) REFERENCES users(id)
);

CREATE TABLE twin_telemetry_history (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  asset_id BIGINT NOT NULL,
  scenario_type VARCHAR(50) NOT NULL DEFAULT 'NORMAL',
  operating_state VARCHAR(30) NOT NULL,
  progress_percent DECIMAL(6, 2) NOT NULL,
  voltage DECIMAL(8, 2) NOT NULL,
  current_amp DECIMAL(8, 2) NOT NULL,
  wire_feed DECIMAL(8, 2) NOT NULL,
  travel_speed DECIMAL(8, 2) NOT NULL,
  torque_percent DECIMAL(8, 2) NOT NULL,
  temperature_c DECIMAL(8, 2) NOT NULL,
  gas_flow DECIMAL(8, 2) NOT NULL,
  axis_s DECIMAL(8, 2) NOT NULL,
  axis_l DECIMAL(8, 2) NOT NULL,
  axis_u DECIMAL(8, 2) NOT NULL,
  axis_r DECIMAL(8, 2) NOT NULL,
  axis_b DECIMAL(8, 2) NOT NULL,
  axis_t DECIMAL(8, 2) NOT NULL,
  risk_level VARCHAR(30) NOT NULL,
  recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_twin_telemetry_asset FOREIGN KEY (asset_id) REFERENCES twin_assets(id)
);

CREATE TABLE twin_alarm_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  facility_id BIGINT NOT NULL,
  asset_id BIGINT,
  scenario_run_id BIGINT,
  alarm_code VARCHAR(60) NOT NULL,
  severity VARCHAR(30) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  occurred_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  acknowledged_at TIMESTAMP(6),
  CONSTRAINT fk_twin_alarms_facility FOREIGN KEY (facility_id) REFERENCES twin_facilities(id),
  CONSTRAINT fk_twin_alarms_asset FOREIGN KEY (asset_id) REFERENCES twin_assets(id),
  CONSTRAINT fk_twin_alarms_scenario FOREIGN KEY (scenario_run_id) REFERENCES twin_scenario_runs(id)
);

CREATE INDEX idx_twin_history_asset_time ON twin_telemetry_history(asset_id, recorded_at DESC);
CREATE INDEX idx_twin_alarm_status_time ON twin_alarm_events(status, occurred_at DESC);
CREATE INDEX idx_twin_scenario_status_time ON twin_scenario_runs(status, started_at DESC);

INSERT INTO sites (site_code, name, address, status)
VALUES ('GEOJE-YARD', '거제 스마트 조선소', '경상남도 거제시', 'active')
ON DUPLICATE KEY UPDATE name = VALUES(name), status = VALUES(status);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'T-BAR-SHOP', 'T-BAR 자동용접 SHOP', 'WELDING_SHOP', 'running', 'low', 67, 10, 18, 25, 22
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'ASSEMBLY-01', '블록 조립 1공장', 'ASSEMBLY', 'running', 'low', 82, 42, 16, 22, 25
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'PAINT-02', '도장 2공장', 'PAINTING', 'warning', 'medium', 43, 68, 19, 18, 21
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_facilities
  (site_id, facility_code, name, facility_type, status, risk_level, progress_percent, map_x, map_y, map_width, map_height)
SELECT id, 'DOCK-01', '제1 건조 도크', 'DOCK', 'running', 'low', 58, 25, 58, 48, 25
FROM sites WHERE site_code = 'GEOJE-YARD'
ON DUPLICATE KEY UPDATE name = VALUES(name), facility_type = VALUES(facility_type);

INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-01', '용접 로봇 1호기', 'WELDING_ROBOT', 'AR2010 representative', 'running', 36, 42, 3,
       JSON_OBJECT('controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name);

INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'RB-WELD-02', '용접 로봇 2호기', 'WELDING_ROBOT', 'AR2010 representative', 'standby', 58, 42, 3,
       JSON_OBJECT('controller', 'YRC1000-compatible adapter', 'dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name), model_name = VALUES(model_name);

INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'CV-IN-01', '블록 반입 컨베이어', 'CONVEYOR', 'Virtual conveyor', 'running', 12, 50, 0,
       JSON_OBJECT('dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO twin_assets
  (facility_id, asset_code, name, asset_type, model_name, status, position_x, position_y, position_z, metadata)
SELECT id, 'CV-OUT-01', '블록 반출 컨베이어', 'CONVEYOR', 'Virtual conveyor', 'standby', 86, 50, 0,
       JSON_OBJECT('dataMode', 'SIMULATOR')
FROM twin_facilities WHERE facility_code = 'T-BAR-SHOP'
ON DUPLICATE KEY UPDATE name = VALUES(name);
