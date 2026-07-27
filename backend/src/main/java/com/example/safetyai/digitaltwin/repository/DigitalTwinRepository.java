package com.example.safetyai.digitaltwin.repository;

import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Alarm;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Asset;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.Facility;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.HistoryPoint;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.RobotTelemetry;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.ScenarioState;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class DigitalTwinRepository {
    private final JdbcTemplate jdbcTemplate;

    public DigitalTwinRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<Facility> findFacilities() {
        return jdbcTemplate.query("""
            SELECT id, facility_code, name, facility_type, status, risk_level, progress_percent,
                   map_x, map_y, map_width, map_height
            FROM twin_facilities ORDER BY id
            """, (rs, rowNum) -> new Facility(
                rs.getLong("id"), rs.getString("facility_code"), rs.getString("name"),
                rs.getString("facility_type"), rs.getString("status"), rs.getString("risk_level"),
                rs.getInt("progress_percent"), rs.getDouble("map_x"), rs.getDouble("map_y"),
                rs.getDouble("map_width"), rs.getDouble("map_height")
            ));
    }

    public Optional<Facility> findFacility(String facilityCode) {
        return findFacilities().stream().filter(f -> f.code().equalsIgnoreCase(facilityCode)).findFirst();
    }

    public List<Asset> findAssets(long facilityId) {
        return jdbcTemplate.query("""
            SELECT id, asset_code, name, asset_type, model_name, status,
                   position_x, position_y, position_z
            FROM twin_assets WHERE facility_id = ? ORDER BY id
            """, (rs, rowNum) -> new Asset(
                rs.getLong("id"), rs.getString("asset_code"), rs.getString("name"),
                rs.getString("asset_type"), rs.getString("model_name"), rs.getString("status"),
                rs.getDouble("position_x"), rs.getDouble("position_y"), rs.getDouble("position_z")
            ), facilityId);
    }

    public Optional<ScenarioState> findActiveScenario(long facilityId) {
        completeExpiredScenarios();
        List<ScenarioState> rows = jdbcTemplate.query("""
            SELECT id, scenario_type, started_at, ends_at
            FROM twin_scenario_runs
            WHERE facility_id = ? AND status = 'active' AND ends_at > CURRENT_TIMESTAMP(6)
            ORDER BY started_at DESC LIMIT 1
            """, (rs, rowNum) -> new ScenarioState(
                rs.getLong("id"), rs.getString("scenario_type"),
                rs.getTimestamp("started_at").toLocalDateTime(),
                rs.getTimestamp("ends_at").toLocalDateTime()
            ), facilityId);
        return rows.stream().findFirst();
    }

    public long startScenario(long facilityId, String type, int durationSeconds, long requestedBy) {
        return JdbcInsert.insert(jdbcTemplate, """
            INSERT INTO twin_scenario_runs
            (facility_id, scenario_type, status, duration_seconds, requested_by, ends_at)
            VALUES (?, ?, 'active', ?, ?, ?)
            """, Arrays.asList(facilityId, type, durationSeconds, requestedBy,
                Timestamp.valueOf(LocalDateTime.now().plusSeconds(durationSeconds))));
    }

    public void completeActiveScenarios(long facilityId) {
        jdbcTemplate.update("""
            UPDATE twin_scenario_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP(6)
            WHERE facility_id = ? AND status = 'active'
            """, facilityId);
    }

    public void completeExpiredScenarios() {
        jdbcTemplate.update("""
            UPDATE twin_scenario_runs SET status = 'completed', completed_at = CURRENT_TIMESTAMP(6)
            WHERE status = 'active' AND ends_at <= CURRENT_TIMESTAMP(6)
            """);
    }

    public long createAlarm(long facilityId, Long assetId, long scenarioId, String code,
                            String severity, String title, String description) {
        return JdbcInsert.insert(jdbcTemplate, """
            INSERT INTO twin_alarm_events
            (facility_id, asset_id, scenario_run_id, alarm_code, severity, title, description)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, Arrays.asList(facilityId, assetId, scenarioId, code, severity, title, description));
    }

    public List<Alarm> findLatestAlarms(long facilityId) {
        return jdbcTemplate.query("""
            SELECT a.id, ta.asset_code, a.alarm_code, a.severity, a.title, a.description,
                   a.status, a.occurred_at, a.acknowledged_at
            FROM twin_alarm_events a
            LEFT JOIN twin_assets ta ON ta.id = a.asset_id
            WHERE a.facility_id = ? ORDER BY a.occurred_at DESC LIMIT 20
            """, (rs, rowNum) -> new Alarm(
                rs.getLong("id"), rs.getString("asset_code"), rs.getString("alarm_code"),
                rs.getString("severity"), rs.getString("title"), rs.getString("description"),
                rs.getString("status"), rs.getTimestamp("occurred_at").toLocalDateTime(),
                rs.getTimestamp("acknowledged_at") == null ? null
                    : rs.getTimestamp("acknowledged_at").toLocalDateTime()
            ), facilityId);
    }

    public int countOpenAlarms() {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM twin_alarm_events WHERE status = 'open'", Integer.class);
        return count == null ? 0 : count;
    }

    public void acknowledgeAlarm(long alarmId) {
        jdbcTemplate.update("""
            UPDATE twin_alarm_events SET status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP(6)
            WHERE id = ? AND status = 'open'
            """, alarmId);
    }

    public void saveTelemetry(RobotTelemetry value) {
        jdbcTemplate.update("""
            INSERT INTO twin_telemetry_history
            (asset_id, scenario_type, operating_state, progress_percent, voltage, current_amp,
             wire_feed, travel_speed, torque_percent, temperature_c, gas_flow,
             axis_s, axis_l, axis_u, axis_r, axis_b, axis_t, risk_level, recorded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, value.assetId(), value.scenarioType(), value.operatingState(), value.progressPercent(),
            value.voltage(), value.currentAmp(), value.wireFeed(), value.travelSpeed(),
            value.torquePercent(), value.temperatureC(), value.gasFlow(), value.axes().s(),
            value.axes().l(), value.axes().u(), value.axes().r(), value.axes().b(), value.axes().t(),
            value.riskLevel(), Timestamp.valueOf(value.recordedAt()));
    }

    public List<HistoryPoint> findHistory(long facilityId, int limit) {
        return jdbcTemplate.query("""
            SELECT a.asset_code, h.scenario_type, h.operating_state, h.current_amp, h.voltage,
                   h.torque_percent, h.temperature_c, h.gas_flow, h.risk_level, h.recorded_at
            FROM twin_telemetry_history h
            JOIN twin_assets a ON a.id = h.asset_id
            WHERE a.facility_id = ? ORDER BY h.recorded_at DESC LIMIT ?
            """, (rs, rowNum) -> new HistoryPoint(
                rs.getString("asset_code"), rs.getString("scenario_type"), rs.getString("operating_state"),
                rs.getDouble("current_amp"), rs.getDouble("voltage"), rs.getDouble("torque_percent"),
                rs.getDouble("temperature_c"), rs.getDouble("gas_flow"), rs.getString("risk_level"),
                rs.getTimestamp("recorded_at").toLocalDateTime()
            ), facilityId, Math.min(Math.max(limit, 10), 500));
    }

    public void updateFacilityState(long facilityId, String status, String riskLevel, int progressPercent) {
        jdbcTemplate.update(
            "UPDATE twin_facilities SET status = ?, risk_level = ?, progress_percent = ? WHERE id = ?",
            status, riskLevel, progressPercent, facilityId);
    }
}
