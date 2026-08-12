package com.example.safetyai.risk.repository;

import com.example.safetyai.common.util.JdbcInsert;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SafetyEventRepository {
    public record DeletionTarget(String status, Long permitId) {}

    private final JdbcTemplate jdbcTemplate;

    public SafetyEventRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public long createUserReport(
        long reporterId,
        String eventType,
        long fileId,
        String title,
        String description
    ) {
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO safety_events
                (event_type, source_type, reporter_id, file_id, severity, title, description, payload, status)
                VALUES (?, 'user_report', ?, ?, 'unclassified', ?, ?, JSON_OBJECT('analysisStatus', 'pending'), 'received')
                """,
            Arrays.asList(eventType, reporterId, fileId, title, description)
        );
    }

    public Long createAiPpeEvent(
        long ppeCheckId,
        String description,
        String payload
    ) {
        jdbcTemplate.update(
            """
                INSERT IGNORE INTO safety_events
                    (event_type, source_type, reporter_id, permit_id, ppe_check_id, file_id,
                     severity, title, description, payload, status)
                SELECT 'PPE_MISSING', 'ai_ppe', p.user_id, p.permit_id, p.id, p.file_id,
                       'high', 'AI 보호구 미착용 감지', ?, ?, 'received'
                  FROM personal_ppe_checks p
                 WHERE p.id = ?
                """,
            description,
            payload,
            ppeCheckId
        );
        List<Long> eventIds = jdbcTemplate.queryForList(
            "SELECT id FROM safety_events WHERE ppe_check_id = ?",
            Long.class,
            ppeCheckId
        );
        return eventIds.isEmpty() ? null : eventIds.get(0);
    }

    public boolean isOwnedSafetyReportFile(long fileId, long userId) {
        Integer count = jdbcTemplate.queryForObject(
            """
                SELECT COUNT(*)
                FROM files
                WHERE id = ? AND uploaded_by = ? AND file_type = 'safety_report'
                """,
            Integer.class,
            fileId,
            userId
        );
        return count != null && count > 0;
    }

    public List<Map<String, Object>> findMyReports(long reporterId) {
        return jdbcTemplate.queryForList(
            """
                SELECT se.id,
                       CONCAT('SR-', DATE_FORMAT(se.event_time, '%Y'), '-', LPAD(se.id, 6, '0')) AS reportNo,
                       se.event_type AS eventType,
                       se.title,
                       se.description,
                       se.status,
                       se.severity,
                       se.event_time AS eventTime,
                       f.id AS fileId,
                       f.original_name AS originalName,
                       f.mime_type AS mimeType,
                       (SELECT ea.action_type
                          FROM event_actions ea
                         WHERE ea.event_id = se.id
                         ORDER BY ea.created_at DESC, ea.id DESC
                         LIMIT 1) AS latestActionType,
                       (SELECT NULLIF(ea.comment, '')
                          FROM event_actions ea
                         WHERE ea.event_id = se.id
                         ORDER BY ea.created_at DESC, ea.id DESC
                         LIMIT 1) AS latestActionComment,
                       (SELECT ea.created_at
                          FROM event_actions ea
                         WHERE ea.event_id = se.id
                         ORDER BY ea.created_at DESC, ea.id DESC
                         LIMIT 1) AS latestActionAt,
                       (SELECT actor.name
                          FROM event_actions ea
                          LEFT JOIN users actor ON actor.id = ea.actor_id
                         WHERE ea.event_id = se.id
                         ORDER BY ea.created_at DESC, ea.id DESC
                         LIMIT 1) AS latestActionBy
                FROM safety_events se
                LEFT JOIN files f ON f.id = se.file_id
                WHERE se.reporter_id = ? AND se.source_type = 'user_report'
                ORDER BY se.event_time DESC
                LIMIT 20
                """,
            reporterId
        );
    }

    public List<Map<String, Object>> findAll(String status) {
        if (status == null || status.isBlank()) {
            return jdbcTemplate.queryForList("SELECT * FROM safety_events ORDER BY event_time DESC");
        }
        return jdbcTemplate.queryForList(
            "SELECT * FROM safety_events WHERE status = ? ORDER BY event_time DESC",
            status
        );
    }

    public List<Map<String, Object>> findWorkerReports(String status, String sourceType) {
        String statusCondition = status == null || status.isBlank() ? "" : " AND se.status = ?";
        String sourceCondition = sourceType == null || sourceType.isBlank() ? "" : " AND se.source_type = ?";
        String sql = """
            SELECT se.id,
                   CASE WHEN se.source_type = 'ai_ppe'
                        THEN CONCAT('AI-PPE-', DATE_FORMAT(se.event_time, '%Y'), '-', LPAD(se.id, 6, '0'))
                        ELSE CONCAT('SR-', DATE_FORMAT(se.event_time, '%Y'), '-', LPAD(se.id, 6, '0'))
                   END AS reportNo,
                   se.event_type AS eventType,
                   se.source_type AS sourceType,
                   se.ppe_check_id AS ppeCheckId,
                   se.title,
                   se.description,
                   se.status,
                   se.severity,
                   se.event_time AS eventTime,
                   COALESCE(se.reporter_id, se.target_user_id) AS targetUserId,
                   COALESCE(u.name, target.name) AS reporterName,
                   COALESCE(u.employee_no, target.employee_no) AS employeeNo,
                   f.id AS fileId,
                   f.original_name AS originalName,
                   f.mime_type AS mimeType,
                   COALESCE(JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.analysisStatus')), 'pending') AS analysisStatus,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.estimatedLocation')) AS estimatedLocation,
                   JSON_EXTRACT(se.payload, '$.riskScore') AS riskScore,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.summary')) AS analysisSummary,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.recommendedAction')) AS recommendedAction,
                   JSON_EXTRACT(se.payload, '$.confidence') AS confidence,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.modelVersion')) AS modelVersion,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.priority')) AS priority,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.policyVersion')) AS policyVersion,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.analysisError')) AS analysisError,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.analyzedAt')) AS analyzedAt,
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.reasonCode')) AS reasonCode,
                   JSON_EXTRACT(se.payload, '$.missingItems') AS missingItems,
                   JSON_EXTRACT(se.payload, '$.helmetOn') AS helmetOn,
                   JSON_EXTRACT(se.payload, '$.harnessOn') AS harnessOn,
                   JSON_EXTRACT(se.payload, '$.weldingMaskOn') AS weldingMaskOn
            FROM safety_events se
            LEFT JOIN users u ON u.id = se.reporter_id
            LEFT JOIN users target ON target.id = se.target_user_id
            LEFT JOIN files f ON f.id = se.file_id
            WHERE se.source_type IN ('user_report', 'ai_ppe', 'system_alert')
            """ + statusCondition + sourceCondition + " ORDER BY se.event_time DESC";
        if (!statusCondition.isEmpty() && !sourceCondition.isEmpty()) {
            return jdbcTemplate.queryForList(sql, status, sourceType);
        }
        if (!statusCondition.isEmpty()) {
            return jdbcTemplate.queryForList(sql, status);
        }
        if (!sourceCondition.isEmpty()) {
            return jdbcTemplate.queryForList(sql, sourceType);
        }
        return jdbcTemplate.queryForList(sql);
    }

    public boolean saveAiAnalysis(
        long eventId,
        String severity,
        String estimatedLocation,
        int riskScore,
        String summary,
        String recommendedAction,
        double confidence,
        String modelVersion
    ) {
        return jdbcTemplate.update(
            """
                UPDATE safety_events
                SET severity = ?,
                    payload = JSON_SET(
                        COALESCE(payload, JSON_OBJECT()),
                        '$.analysisStatus', 'completed',
                        '$.estimatedLocation', ?,
                        '$.riskScore', ?,
                        '$.summary', ?,
                        '$.recommendedAction', ?,
                        '$.confidence', ?,
                        '$.modelVersion', ?,
                        '$.analyzedAt', DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ')
                    )
                WHERE id = ? AND source_type = 'user_report'
                """,
            severity,
            estimatedLocation,
            riskScore,
            summary,
            recommendedAction,
            confidence,
            modelVersion,
            eventId
        ) > 0;
    }

    public Map<String, Object> findUserReportForAnalysis(long eventId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT se.event_type, se.description, f.storage_key, f.mime_type
                  FROM safety_events se
                  JOIN files f ON f.id = se.file_id
                 WHERE se.id = ? AND se.source_type = 'user_report'
                """,
            eventId
        );
        if (rows.isEmpty()) {
            throw new IllegalStateException("Safety report or image was not found.");
        }
        return rows.get(0);
    }

    public void markAnalysisRunning(long eventId) {
        jdbcTemplate.update(
            """
                UPDATE safety_events
                   SET payload = JSON_SET(
                       COALESCE(payload, JSON_OBJECT()),
                       '$.analysisStatus', 'analyzing',
                       '$.analysisError', NULL
                   )
                 WHERE id = ? AND source_type = 'user_report'
                """,
            eventId
        );
    }

    public void resetAnalysis(long eventId) {
        int updated = jdbcTemplate.update(
            """
                UPDATE safety_events
                   SET payload = JSON_SET(
                       COALESCE(payload, JSON_OBJECT()),
                       '$.analysisStatus', 'pending',
                       '$.analysisError', NULL
                   )
                 WHERE id = ? AND source_type = 'user_report'
                """,
            eventId
        );
        if (updated == 0) {
            throw new IllegalStateException("Safety report was not found.");
        }
    }

    public void saveAutomatedAnalysis(
        long eventId,
        String severity,
        String estimatedLocation,
        int riskScore,
        String summary,
        String recommendedAction,
        double confidence,
        String modelVersion,
        String priority,
        String policyVersion,
        String factorsJson,
        String observedHazardsJson
    ) {
        jdbcTemplate.update(
            """
                UPDATE safety_events
                   SET severity = ?,
                       payload = JSON_SET(
                           COALESCE(payload, JSON_OBJECT()),
                           '$.analysisStatus', 'completed',
                           '$.estimatedLocation', ?,
                           '$.riskScore', ?,
                           '$.summary', ?,
                           '$.recommendedAction', ?,
                           '$.confidence', ?,
                           '$.modelVersion', ?,
                           '$.priority', ?,
                           '$.policyVersion', ?,
                           '$.factors', CAST(? AS JSON),
                           '$.observedHazards', CAST(? AS JSON),
                           '$.analysisError', NULL,
                           '$.analyzedAt', DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ')
                       )
                 WHERE id = ? AND source_type = 'user_report'
                """,
            severity, estimatedLocation, riskScore, summary, recommendedAction,
            confidence, modelVersion, priority, policyVersion, factorsJson,
            observedHazardsJson, eventId
        );
    }

    public void markAnalysisFailed(long eventId, String message) {
        jdbcTemplate.update(
            """
                UPDATE safety_events
                   SET payload = JSON_SET(
                       COALESCE(payload, JSON_OBJECT()),
                       '$.analysisStatus', 'failed',
                       '$.analysisError', ?,
                       '$.analyzedAt', DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%dT%H:%i:%s.%fZ')
                   )
                 WHERE id = ? AND source_type = 'user_report'
                """,
            message,
            eventId
        );
    }

    public boolean updateReportStatus(long eventId, long actorId, String status, String comment) {
        int updated = jdbcTemplate.update(
            "UPDATE safety_events SET status = ? WHERE id = ? AND source_type IN ('user_report', 'ai_ppe')",
            status,
            eventId
        );
        if (updated == 0) {
            return false;
        }
        jdbcTemplate.update(
            "INSERT INTO event_actions (event_id, actor_id, action_type, comment) VALUES (?, ?, ?, ?)",
            eventId,
            actorId,
            status,
            comment
        );
        return true;
    }

    public WorkflowTarget findWorkflowTargetForUpdate(long eventId) {
        List<WorkflowTarget> targets = jdbcTemplate.query(
            "SELECT status, source_type FROM safety_events WHERE id = ? FOR UPDATE",
            (resultSet, rowNum) -> new WorkflowTarget(
                resultSet.getString("status"),
                resultSet.getString("source_type")
            ),
            eventId
        );
        return targets.isEmpty() ? null : targets.get(0);
    }

    public boolean reportWorkerCompletion(long eventId, long reporterId, String comment) {
        int updated = jdbcTemplate.update(
            """
                UPDATE safety_events
                   SET status = 'completion_reported'
                 WHERE id = ?
                   AND reporter_id = ?
                   AND source_type = 'user_report'
                   AND status = 'action_requested'
                """,
            eventId,
            reporterId
        );
        if (updated == 0) {
            return false;
        }
        jdbcTemplate.update(
            "INSERT INTO event_actions (event_id, actor_id, action_type, comment) VALUES (?, ?, 'completion_reported', ?)",
            eventId,
            reporterId,
            comment
        );
        return true;
    }

    public DeletionTarget findDeletionTargetForUpdate(long eventId) {
        List<DeletionTarget> targets = jdbcTemplate.query(
            "SELECT status, permit_id FROM safety_events WHERE id = ? FOR UPDATE",
            (resultSet, rowNum) -> new DeletionTarget(
                resultSet.getString("status"),
                resultSet.getObject("permit_id", Long.class)
            ),
            eventId
        );
        return targets.isEmpty() ? null : targets.get(0);
    }

    public boolean deleteResolved(long eventId) {
        // 알림과 산출된 위험점수는 감사 이력으로 남기되 삭제된 이벤트와의 연결만 해제한다.
        jdbcTemplate.update("UPDATE notifications SET event_id = NULL WHERE event_id = ?", eventId);
        jdbcTemplate.update("UPDATE risk_scores SET event_id = NULL WHERE event_id = ?", eventId);
        return jdbcTemplate.update(
            "DELETE FROM safety_events WHERE id = ? AND status = 'resolved'",
            eventId
        ) > 0;
    }

    public record WorkflowTarget(String status, String sourceType) {
    }
}
