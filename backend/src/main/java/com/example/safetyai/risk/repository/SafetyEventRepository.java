package com.example.safetyai.risk.repository;

import com.example.safetyai.common.util.JdbcInsert;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SafetyEventRepository {
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

    public List<Map<String, Object>> findWorkerReports(String status) {
        String statusCondition = status == null || status.isBlank() ? "" : " AND se.status = ?";
        String sql = """
            SELECT se.id,
                   CONCAT('SR-', DATE_FORMAT(se.event_time, '%Y'), '-', LPAD(se.id, 6, '0')) AS reportNo,
                   se.event_type AS eventType,
                   se.title,
                   se.description,
                   se.status,
                   se.severity,
                   se.event_time AS eventTime,
                   u.name AS reporterName,
                   u.employee_no AS employeeNo,
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
                   JSON_UNQUOTE(JSON_EXTRACT(se.payload, '$.analyzedAt')) AS analyzedAt
            FROM safety_events se
            JOIN users u ON u.id = se.reporter_id
            LEFT JOIN files f ON f.id = se.file_id
            WHERE se.source_type = 'user_report'
            """ + statusCondition + " ORDER BY se.event_time DESC";
        return statusCondition.isEmpty()
            ? jdbcTemplate.queryForList(sql)
            : jdbcTemplate.queryForList(sql, status);
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

    public boolean updateReportStatus(long eventId, long actorId, String status, String comment) {
        int updated = jdbcTemplate.update(
            "UPDATE safety_events SET status = ? WHERE id = ? AND source_type = 'user_report'",
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
}
