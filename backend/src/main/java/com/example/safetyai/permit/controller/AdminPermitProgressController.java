package com.example.safetyai.permit.controller;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.permit.service.PermitFieldGuidanceService;
import com.example.safetyai.risk.service.PermitRiskScoringService;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// 승인된 작업허가서가 승인 이후 실제로 어떤 과정(TBM, 보호구 점검, 안전 이벤트, 위험 점수)을
// 거치고 있는지 관리자 화면에서 permit 단위로 모아 보여주기 위한 조회 전용 엔드포인트.
// /api/admin/** 는 SecurityConfig에서 이미 ADMIN 권한으로 제한된다.
@RestController
@RequestMapping("/api/admin/work-permits")
public class AdminPermitProgressController {
    private final JdbcTemplate jdbcTemplate;
    private final PermitFieldGuidanceService fieldGuidanceService;
    private final PermitRiskScoringService riskScoringService;

    public AdminPermitProgressController(
        JdbcTemplate jdbcTemplate,
        PermitFieldGuidanceService fieldGuidanceService,
        PermitRiskScoringService riskScoringService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.fieldGuidanceService = fieldGuidanceService;
        this.riskScoringService = riskScoringService;
    }

    // PPE 점검·허가서 분석·안전 이벤트가 새로 생길 때 자동으로도 재계산되지만(각 서비스에서
    // 트리거), 관리자가 그 사이에 수동으로 다시 계산하고 싶을 때 쓰는 버튼용 엔드포인트.
    @PostMapping("/{permitId}/risk-score/recompute")
    public Map<String, Object> recomputeRiskScore(@PathVariable long permitId) {
        riskScoringService.recompute(permitId);
        return progress(permitId);
    }

    // 관리자가 "지금 바로" OpenAI 현장 안내(TBM 요약·단계별 행동요령)를 생성하고,
    // 그 결과로 오늘자 tbm_sessions/tbm_materials를 만들어(이미 있으면 재사용) 이 화면
    // 자체에서 바로 확인할 수 있게 한다. 원래는 승인 시점 백그라운드 생성 → 워커가
    // TBM을 확인해야만 세션이 생겼는데, 그 두 단계를 관리자가 한 번에 트리거하는 것.
    @PostMapping("/{permitId}/tbm/generate")
    @Transactional
    public Map<String, Object> generateTbm(@PathVariable long permitId) {
        Map<String, Object> guidance = fieldGuidanceService.generate(permitId);
        long sessionId = ensureTodaySession(permitId, guidance);
        saveMaterial(sessionId, guidance);
        return progress(permitId);
    }

    private long ensureTodaySession(long permitId, Map<String, Object> guidance) {
        List<Long> existing = jdbcTemplate.query(
            """
                SELECT id FROM tbm_sessions
                 WHERE permit_id = ? AND session_date = CURRENT_DATE
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
            (resultSet, rowNumber) -> resultSet.getLong("id"),
            permitId
        );
        if (!existing.isEmpty()) {
            return existing.get(0);
        }
        String title = String.valueOf(guidance.getOrDefault("tbmTitle", "TBM 브리핑"));
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO tbm_sessions (permit_id, title, session_date, status)
                SELECT id, ?, CURRENT_DATE, 'completed'
                  FROM work_permits
                 WHERE id = ? AND status NOT IN ('rejected', 'deleted')
                """,
            Arrays.asList(title, permitId)
        );
    }

    @SuppressWarnings("unchecked")
    private void saveMaterial(long sessionId, Map<String, Object> guidance) {
        StringBuilder content = new StringBuilder();
        Object summary = guidance.get("tbmSummary");
        if (summary != null && !String.valueOf(summary).isBlank()) {
            content.append(summary).append("\n");
        }
        List<Map<String, Object>> items = guidance.get("tbmItems") instanceof List<?> list
            ? (List<Map<String, Object>>) list
            : List.of();
        appendPhase(content, items, "before", "\n[작업 전]");
        appendPhase(content, items, "during", "\n[작업 중]");
        appendPhase(content, items, "emergency", "\n[비상시]");

        jdbcTemplate.update(
            """
                INSERT INTO tbm_materials (tbm_session_id, material_type, language, content, model_name)
                VALUES (?, 'script', 'ko', ?, 'openai-field-guidance')
                """,
            sessionId,
            content.toString().trim()
        );
    }

    private void appendPhase(StringBuilder text, List<Map<String, Object>> items, String phase, String label) {
        List<String> lines = items.stream()
            .filter(item -> phase.equals(item.get("phase")))
            .map(item -> ("critical".equals(item.get("priority")) ? "⚠ " : "· ") + item.get("text"))
            .toList();
        if (lines.isEmpty()) {
            return;
        }
        text.append(label).append("\n");
        lines.forEach(line -> text.append(line).append("\n"));
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
                       COUNT(ta.user_id) AS attendance_count,
                       SUM(CASE WHEN ta.confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS confirmed_count,
                       (
                           SELECT tm.content
                             FROM tbm_materials tm
                            WHERE tm.tbm_session_id = ts.id
                              AND tm.content IS NOT NULL AND tm.content <> ''
                            ORDER BY tm.created_at DESC
                            LIMIT 1
                       ) AS content
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
                row.put("content", resultSet.getString("content"));
                return row;
            },
            permitId
        );
    }

    private List<Map<String, Object>> ppeChecks(long permitId) {
        return jdbcTemplate.query(
            """
                SELECT p.id, wpw.user_id, u.name AS worker_name,
                       COALESCE(u.employee_no, u.username) AS employee_no,
                       p.status, p.helmet_on, p.harness_on, p.welding_mask_on,
                       p.safety_shoes_confirmed, p.workwear_confirmed, p.checked_at
                  FROM work_permit_workers wpw
                  JOIN users u ON u.id = wpw.user_id
             LEFT JOIN personal_ppe_checks p
                    ON p.id = (
                       SELECT latest.id
                         FROM personal_ppe_checks latest
                        WHERE latest.permit_id = wpw.permit_id
                          AND latest.user_id = wpw.user_id
                        ORDER BY latest.checked_at DESC
                        LIMIT 1
                    )
                 WHERE wpw.permit_id = ?
                 ORDER BY CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,
                          p.checked_at DESC,
                          u.name
                """,
            (resultSet, rowNumber) -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", nullableLong(resultSet, "id"));
                row.put("userId", resultSet.getLong("user_id"));
                row.put("submitted", resultSet.getObject("id") != null);
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

    private Long nullableLong(ResultSet row, String column) throws SQLException {
        long value = row.getLong(column);
        return row.wasNull() ? null : value;
    }
}
