package com.example.safetyai.worker.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/worker/tbm")
public class WorkerTbmController {
    private final JdbcTemplate jdbcTemplate;

    public WorkerTbmController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/today")
    public Map<String, Object> today(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @RequestParam(defaultValue = "ko") String language
    ) {
        requireUser(user);
        int admin = user.roles().contains("ADMIN") ? 1 : 0;
        List<Map<String, Object>> sessions = jdbcTemplate.queryForList(
            """
                SELECT ts.permit_id,
                       COALESCE(NULLIF(ts.title, ''), CONCAT(wp.work_title, ' TBM')) AS title,
                       COALESCE(
                           (
                               SELECT tm.content
                                 FROM tbm_materials tm
                                WHERE tm.tbm_session_id = ts.id
                                  AND tm.content IS NOT NULL
                                  AND tm.content <> ''
                                ORDER BY (tm.language = ?) DESC,
                                         (tm.language = 'ko') DESC,
                                         CASE tm.material_type
                                             WHEN 'script' THEN 0
                                             WHEN 'briefing' THEN 1
                                             WHEN 'summary' THEN 2
                                             ELSE 3
                                         END,
                                         tm.created_at DESC
                                LIMIT 1
                           ),
                           NULLIF(wp.work_content, ''),
                           (
                               SELECT NULLIF(par.summary, '')
                                 FROM permit_analysis_results par
                                WHERE par.permit_id = wp.id
                                ORDER BY par.created_at DESC
                                LIMIT 1
                           ),
                           '등록된 TBM 안내 내용이 없습니다.'
                       ) AS content,
                       EXISTS(
                           SELECT 1
                             FROM tbm_attendance ta
                            WHERE ta.tbm_session_id = ts.id
                              AND ta.user_id = ?
                              AND ta.confirmed_at IS NOT NULL
                       ) AS confirmed
                  FROM tbm_sessions ts
                  JOIN work_permits wp ON wp.id = ts.permit_id
                 WHERE ts.session_date = CURRENT_DATE
                   AND wp.status NOT IN ('rejected', 'deleted')
                   AND (
                       ? = 1
                       OR EXISTS(
                           SELECT 1
                             FROM work_permit_workers wpw
                            WHERE wpw.permit_id = wp.id
                              AND wpw.user_id = ?
                       )
                   )
                 ORDER BY ts.created_at DESC
                 LIMIT 1
                """,
            language,
            user.id(),
            admin,
            user.id()
        );
        if (!sessions.isEmpty()) {
            return response(sessions.get(0));
        }

        List<Map<String, Object>> permits = jdbcTemplate.queryForList(
            """
                SELECT wp.id AS permit_id,
                       CONCAT(COALESCE(NULLIF(wp.work_title, ''), '오늘의 작업'), ' TBM') AS title,
                       COALESCE(
                           NULLIF(wp.work_content, ''),
                           (
                               SELECT NULLIF(par.summary, '')
                                 FROM permit_analysis_results par
                                WHERE par.permit_id = wp.id
                                ORDER BY par.created_at DESC
                                LIMIT 1
                           ),
                           '등록된 TBM 안내 내용이 없습니다.'
                       ) AS content,
                       FALSE AS confirmed
                  FROM work_permits wp
                 WHERE wp.status NOT IN ('rejected', 'deleted')
                   AND (
                       DATE(wp.created_at) = CURRENT_DATE
                       OR (wp.start_time < CURRENT_DATE + INTERVAL 1 DAY
                           AND COALESCE(wp.end_time, wp.start_time) >= CURRENT_DATE)
                   )
                   AND (
                       ? = 1
                       OR EXISTS(
                           SELECT 1
                             FROM work_permit_workers wpw
                            WHERE wpw.permit_id = wp.id
                              AND wpw.user_id = ?
                       )
                   )
                 ORDER BY CASE WHEN wp.start_time IS NULL THEN 1 ELSE 0 END,
                          wp.start_time DESC,
                          wp.created_at DESC
                 LIMIT 1
                """,
            admin,
            user.id()
        );
        return permits.isEmpty() ? Map.of() : response(permits.get(0));
    }

    @PostMapping("/confirm")
    @Transactional
    public Map<String, Object> confirm(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @Valid @RequestBody ConfirmRequest request
    ) {
        requireUser(user);
        requirePermitAccess(user, request.permitId());
        List<Long> sessionIds = jdbcTemplate.query(
            """
                SELECT id
                  FROM tbm_sessions
                 WHERE permit_id = ?
                   AND session_date = CURRENT_DATE
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
            (resultSet, rowNum) -> resultSet.getLong("id"),
            request.permitId()
        );
        long sessionId = sessionsOrCreate(sessionIds, request.permitId());
        jdbcTemplate.update(
            """
                INSERT INTO tbm_attendance (tbm_session_id, user_id, confirmed_at)
                VALUES (?, ?, CURRENT_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE confirmed_at = CURRENT_TIMESTAMP(6)
                """,
            sessionId,
            user.id()
        );
        return Map.of(
            "permitId", request.permitId(),
            "sessionId", sessionId,
            "confirmed", true
        );
    }

    private long sessionsOrCreate(List<Long> sessionIds, long permitId) {
        return sessionIds.isEmpty() ? createSession(permitId) : sessionIds.get(0);
    }

    private Map<String, Object> response(Map<String, Object> row) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("permitId", row.get("permit_id"));
        response.put("title", row.get("title"));
        response.put("content", row.get("content"));
        response.put("confirmed", Boolean.TRUE.equals(row.get("confirmed"))
            || row.get("confirmed") instanceof Number number && number.intValue() != 0);
        return response;
    }

    private long createSession(long permitId) {
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO tbm_sessions (permit_id, title, session_date, status)
                SELECT id, CONCAT(COALESCE(NULLIF(work_title, ''), '오늘의 작업'), ' TBM'),
                       CURRENT_DATE, 'completed'
                  FROM work_permits
                 WHERE id = ?
                   AND status NOT IN ('rejected', 'deleted')
                """,
            Arrays.asList(permitId)
        );
    }

    private void requirePermitAccess(AuthService.AuthenticatedUser user, long permitId) {
        Integer permitted = jdbcTemplate.queryForObject(
            """
                SELECT COUNT(*)
                  FROM work_permits wp
                 WHERE wp.id = ?
                   AND wp.status NOT IN ('rejected', 'deleted')
                   AND (
                       ? = 1
                       OR EXISTS(
                           SELECT 1
                             FROM work_permit_workers wpw
                            WHERE wpw.permit_id = wp.id
                              AND wpw.user_id = ?
                       )
                   )
                """,
            Integer.class,
            permitId,
            user.roles().contains("ADMIN") ? 1 : 0,
            user.id()
        );
        if (permitted == null || permitted == 0) {
            throw new ApiException(HttpStatus.FORBIDDEN, "이 작업허가서의 TBM에 참여할 권한이 없습니다.");
        }
    }

    private void requireUser(AuthService.AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
    }

    public record ConfirmRequest(@NotNull Long permitId) {
    }
}
