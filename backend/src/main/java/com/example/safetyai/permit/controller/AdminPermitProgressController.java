package com.example.safetyai.permit.controller;

import com.example.safetyai.common.exception.ApiException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 승인된 작업허가서가 승인 이후 실제로 어떤 과정(TBM, 보호구 점검, 안전 이벤트, 위험 점수)을
// 거치고 있는지 관리자 화면에서 permit 단위로 모아 보여주기 위한 조회 전용 엔드포인트.
// /api/admin/** 는 SecurityConfig에서 이미 ADMIN 권한으로 제한된다.
@RestController
@RequestMapping("/api/admin/work-permits")
public class AdminPermitProgressController {
    private final JdbcTemplate jdbcTemplate;

    public AdminPermitProgressController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/{permitId}/progress")
    public Map<String, Object> progress(@PathVariable long permitId) {
        Map<String, Object> permit = jdbcTemplate.query(
            "SELECT id, permit_no, work_title, status FROM work_permits WHERE id = ?",
            resultSet -> resultSet.next() ? permitSummary(resultSet) : null,
            permitId
        );
        if (permit == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "작업허가서를 찾을 수 없습니다.");
        }

        Map<String, Object> result = new LinkedHashMap<>(permit);
        result.put("assignedWorkerCount", assignedWorkerCount(permitId));
        result.put("tbmSessions", tbmSessions(permitId));
        result.put("ppeChecks", ppeChecks(permitId));
        result.put("safetyEvents", safetyEvents(permitId));
        result.put("riskScores", riskScores(permitId));
        return result;
    }

    private Map<String, Object> permitSummary(ResultSet row) throws SQLException {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("permitId", row.getLong("id"));
        summary.put("permitNo", row.getString("permit_no"));
        summary.put("workTitle", row.getString("work_title"));
        summary.put("status", row.getString("status"));
        return summary;
    }

    private int assignedWorkerCount(long permitId) {
        Integer count = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM work_permit_workers WHERE permit_id = ?",
            Integer.class,
            permitId
        );
        return count == null ? 0 : count;
    }

    private List<Map<String, Object>> tbmSessions(long permitId) {
        return jdbcTemplate.query(
            """
                SELECT ts.id,
                       ts.title,
                       ts.session_date,
                       ts.status,
                       COUNT(ta.id) AS attendance_count,
                       SUM(CASE WHEN ta.confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed_count
                  FROM tbm_sessions ts
             LEFT JOIN tbm_attendance ta ON ta.tbm_session_id = ts.id
                 WHERE ts.permit_id = ?
              GROUP BY ts.id, ts.title, ts.session_date, ts.status
              ORDER BY ts.session_date DESC, ts.created_at DESC
                """,
            (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", resultSet.getLong("id"));
                row.put("title", resultSet.getString("title"));
                row.put("sessionDate", resultSet.getObject("session_date"));
                row.put("status", resultSet.getString("status"));
                row.put("attendanceCount", resultSet.getInt("attendance_count"));
                row.put("confirmedCount", resultSet.getInt("confirmed_count"));
                return row;
            },
            permitId
        );
    }

    private List<Map<String, Object>> ppeChecks(long permitId) {
        return jdbcTemplate.query(
            """
                SELECT p.id, u.name AS worker_name, COALESCE(u.employee_no, u.username) AS employee_no,
                       p.status, p.helmet_on, p.harness_on, p.welding_mask_on,
                       p.safety_shoes_confirmed, p.workwear_confirmed, p.checked_at
                  FROM personal_ppe_checks p
                  JOIN users u ON u.id = p.user_id
                 WHERE p.permit_id = ?
                 ORDER BY p.checked_at DESC
                """,
            (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", resultSet.getLong("id"));
                row.put("workerName", resultSet.getString("worker_name"));
                row.put("employeeNo", resultSet.getString("employee_no"));
                row.put("status", resultSet.getString("status"));
                row.put("helmetOn", nullableBoolean(resultSet, "helmet_on"));
                row.put("harnessOn", nullableBoolean(resultSet, "harness_on"));
                row.put("weldingMaskOn", nullableBoolean(resultSet, "welding_mask_on"));
                row.put("safetyShoesConfirmed", resultSet.getBoolean("safety_shoes_confirmed"));
                row.put("workwearConfirmed", resultSet.getBoolean("workwear_confirmed"));
                row.put("checkedAt", resultSet.getObject("checked_at"));
                return row;
            },
            permitId
        );
    }

    private List<Map<String, Object>> safetyEvents(long permitId) {
        return jdbcTemplate.query(
            """
                SELECT id, event_type, source_type, severity, title, status, event_time
                  FROM safety_events
                 WHERE permit_id = ?
                 ORDER BY event_time DESC
                """,
            (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", resultSet.getLong("id"));
                row.put("eventType", resultSet.getString("event_type"));
                row.put("sourceType", resultSet.getString("source_type"));
                row.put("severity", resultSet.getString("severity"));
                row.put("title", resultSet.getString("title"));
                row.put("status", resultSet.getString("status"));
                row.put("eventTime", resultSet.getObject("event_time"));
                return row;
            },
            permitId
        );
    }

    private List<Map<String, Object>> riskScores(long permitId) {
        return jdbcTemplate.query(
            """
                SELECT id, score, risk_level, model_name, created_at
                  FROM risk_scores
                 WHERE permit_id = ?
                 ORDER BY created_at DESC
                 LIMIT 20
                """,
            (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", resultSet.getLong("id"));
                row.put("score", resultSet.getObject("score"));
                row.put("riskLevel", resultSet.getString("risk_level"));
                row.put("modelName", resultSet.getString("model_name"));
                row.put("createdAt", resultSet.getObject("created_at"));
                return row;
            },
            permitId
        );
    }

    private Boolean nullableBoolean(ResultSet row, String column) throws SQLException {
        boolean value = row.getBoolean(column);
        return row.wasNull() ? null : value;
    }
}
