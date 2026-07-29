CREATE TABLE twin_ai_analysis_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    asset_id BIGINT NOT NULL,
    model_version VARCHAR(40) NOT NULL,
    anomaly_type VARCHAR(60) NOT NULL,
    detection_source VARCHAR(40) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    is_anomaly BOOLEAN NOT NULL,
    candidate BOOLEAN NOT NULL,
    confirmed BOOLEAN NOT NULL,
    anomaly_score DECIMAL(14, 8) NOT NULL,
    anomaly_threshold DECIMAL(14, 8) NOT NULL,
    consecutive_count INT NOT NULL,
    reason_sensor VARCHAR(120),
    recorded_at DATETIME(6) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    CONSTRAINT fk_twin_ai_analysis_asset
        FOREIGN KEY (asset_id) REFERENCES twin_assets(id),
    INDEX idx_twin_ai_analysis_asset_recorded (asset_id, recorded_at),
    INDEX idx_twin_ai_analysis_type_recorded (anomaly_type, recorded_at)
);
