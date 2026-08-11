package com.example.safetyai.worker.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.permit.service.PermitFieldGuidanceService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
    private final PermitFieldGuidanceService fieldGuidanceService;

    public WorkerTbmController(JdbcTemplate jdbcTemplate, PermitFieldGuidanceService fieldGuidanceService) {
        this.jdbcTemplate = jdbcTemplate;
        this.fieldGuidanceService = fieldGuidanceService;
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
            return response(sessions.get(0), user, language);
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
        return permits.isEmpty() ? Map.of() : response(permits.get(0), user, language);
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

    private Map<String, Object> response(
        Map<String, Object> row,
        AuthService.AuthenticatedUser user,
        String language
    ) {
        Optional<Map<String, Object>> guidance = cachedGuidance(row);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("permitId", row.get("permit_id"));
        response.put("title", localizedValue(guidance, language, "title")
            .orElse(String.valueOf(row.get("title"))));
        response.put("content", enrichedContent(row, user, language, guidance));
        response.put("confirmed", Boolean.TRUE.equals(row.get("confirmed"))
            || row.get("confirmed") instanceof Number number && number.intValue() != 0);
        return response;
    }

    // 승인 시점에 미리 생성해 둔 OpenAI 현장 안내(TBM 요약·단계별 행동요령·개인 보호구·확인사항)가
    // 캐시돼 있으면 그걸로 대체하고, 없으면(아직 생성 전, 실패, API 키 미설정 등) 기존 방식으로
    // 채워진 row.content(작업 내용 요약)를 그대로 쓴다. 여기서는 새로 생성을 트리거하지 않는다 —
    // 그러면 작업자의 "오늘 작업" 로딩이 OpenAI 응답 시간만큼 느려지기 때문이다.
    private Optional<Map<String, Object>> cachedGuidance(Map<String, Object> row) {
        Object permitIdValue = row.get("permit_id");
        if (permitIdValue instanceof Number permitIdNumber) {
            try {
                return fieldGuidanceService.peekCached(permitIdNumber.longValue());
            } catch (Exception ignored) {
                // 캐시 조회 자체가 실패해도 워커 화면은 DB 자료로 정상 동작해야 한다.
            }
        }
        return Optional.empty();
    }

    private String enrichedContent(
        Map<String, Object> row,
        AuthService.AuthenticatedUser user,
        String language,
        Optional<Map<String, Object>> guidance
    ) {
        String base = localizedValue(guidance, language, "content")
            .orElseGet(() -> String.valueOf(row.get("content")));
        if (guidance.isEmpty()) {
            return base;
        }

        if (base.isBlank() || "null".equals(base)) {
            base = formatGuidance(guidance.get());
        }
        StringBuilder text = new StringBuilder(base.trim());
        appendMyGuidance(text, guidance.get(), user.id(), language);
        return text.toString().trim();
    }

    @SuppressWarnings("unchecked")
    private String formatGuidance(Map<String, Object> guidance) {
        StringBuilder text = new StringBuilder();
        String summary = trimToNull(guidance.get("tbmSummary"));
        if (summary != null) {
            text.append(summary).append("\n");
        }

        List<Map<String, Object>> items = guidance.get("tbmItems") instanceof List<?> list
            ? (List<Map<String, Object>>) list
            : List.of();
        appendPhase(text, items, "before", "\n[작업 전]");
        appendPhase(text, items, "during", "\n[작업 중]");
        appendPhase(text, items, "emergency", "\n[비상시]");

        return text.toString().trim();
    }

    @SuppressWarnings("unchecked")
    private void appendMyGuidance(
        StringBuilder text,
        Map<String, Object> guidance,
        long userId,
        String language
    ) {
        List<Map<String, Object>> workerGuidance = guidance.get("workerGuidance") instanceof List<?> list
            ? (List<Map<String, Object>>) list
            : List.of();
        workerGuidance.stream()
            .filter(worker -> worker.get("workerId") instanceof Number number && number.longValue() == userId)
            .filter(worker -> language.equals(worker.get("language")))
            .findFirst()
            .ifPresent(mine -> appendWorkerGuidance(text, mine, language));
    }

    @SuppressWarnings("unchecked")
    private Optional<String> localizedValue(
        Optional<Map<String, Object>> guidance,
        String requestedLanguage,
        String field
    ) {
        if (guidance.isEmpty()) {
            return Optional.empty();
        }
        List<Map<String, Object>> localized = guidance.get().get("localizedTbm") instanceof List<?> list
            ? (List<Map<String, Object>>) list
            : List.of();
        return localized.stream()
            .filter(item -> requestedLanguage.equals(item.get("language")))
            .findFirst()
            .or(() -> localized.stream().filter(item -> "ko".equals(item.get("language"))).findFirst())
            .map(item -> trimToNull(item.get(field)))
            .filter(value -> value != null);
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

    @SuppressWarnings("unchecked")
    private void appendWorkerGuidance(StringBuilder text, Map<String, Object> mine, String language) {
        boolean korean = "ko".equals(language);
        List<Map<String, Object>> ppe = mine.get("requiredPpe") instanceof List<?> list
            ? (List<Map<String, Object>>) list
            : List.of();
        if (!ppe.isEmpty()) {
            text.append(korean ? "\n[개인 보호구]\n" : "\n[PPE]\n");
            ppe.forEach(item -> text.append("· ").append(item.get("name")).append("\n"));
        }
        List<?> checks = mine.get("checks") instanceof List<?> list ? list : List.of();
        if (!checks.isEmpty()) {
            text.append(korean ? "\n[확인 사항]\n" : "\n[CHECK]\n");
            checks.forEach(check -> text.append("· ").append(check).append("\n"));
        }
        List<?> warnings = mine.get("warnings") instanceof List<?> list ? list : List.of();
        if (!warnings.isEmpty()) {
            text.append(korean ? "\n[주의]\n" : "\n[WARNING]\n");
            warnings.forEach(warning -> text.append("⚠ ").append(warning).append("\n"));
        }
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
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
