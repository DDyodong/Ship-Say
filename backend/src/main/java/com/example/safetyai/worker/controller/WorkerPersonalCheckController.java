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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/worker/personal-checks")
public class WorkerPersonalCheckController {
    private final JdbcTemplate jdbcTemplate;

    public WorkerPersonalCheckController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping("/today")
    public Map<String, Object> today(@AuthenticationPrincipal AuthService.AuthenticatedUser user) {
        requireUser(user);
        List<Map<String, Object>> checks = jdbcTemplate.queryForList(
            """
                SELECT id, permit_id, file_id, status, safety_shoes_confirmed,
                       workwear_confirmed, message, checked_at
                  FROM personal_ppe_checks
                 WHERE user_id = ?
                   AND DATE(checked_at) = CURRENT_DATE
                 ORDER BY checked_at DESC
                 LIMIT 1
                """,
            user.id()
        );
        return checks.isEmpty() ? Map.of() : response(checks.get(0));
    }

    @PostMapping
    @Transactional
    public ResponseEntity<Map<String, Object>> create(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @Valid @RequestBody PersonalCheckRequest request
    ) {
        requireUser(user);
        requireManualEquipment(request);
        requireOwnedPpeImage(user.id(), request.fileId());
        if (request.permitId() != null) {
            requirePermitAccess(user, request.permitId());
        }

        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO personal_ppe_checks (
                    user_id, permit_id, file_id, status, passed,
                    safety_shoes_confirmed, gloves_confirmed, workwear_confirmed, message
                )
                VALUES (?, ?, ?, 'pending_analysis', FALSE, ?, FALSE, ?,
                        '안전관리자에게 전달되었습니다.')
                """,
            Arrays.asList(
                user.id(),
                request.permitId(),
                request.fileId(),
                request.safetyShoesConfirmed(),
                request.workwearConfirmed()
            )
        );
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(findById(id));
    }

    private void requireOwnedPpeImage(long userId, long fileId) {
        Integer fileCount = jdbcTemplate.queryForObject(
            """
                SELECT COUNT(*)
                  FROM files
                 WHERE id = ?
                   AND uploaded_by = ?
                   AND file_type = 'ppe_check'
                """,
            Integer.class,
            fileId,
            userId
        );
        if (fileCount == null || fileCount == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "본인이 업로드한 보호구 점검 사진이 필요합니다.");
        }
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
            throw new ApiException(HttpStatus.FORBIDDEN, "배정되지 않은 작업의 보호구 점검은 제출할 수 없습니다.");
        }
    }

    private void requireManualEquipment(PersonalCheckRequest request) {
        if (!Boolean.TRUE.equals(request.safetyShoesConfirmed())
            || !Boolean.TRUE.equals(request.workwearConfirmed())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "안전화와 안전복 착용 여부를 모두 확인해 주세요.");
        }
    }

    private Map<String, Object> findById(long id) {
        Map<String, Object> row = jdbcTemplate.queryForMap(
            """
                SELECT id, permit_id, file_id, status, safety_shoes_confirmed,
                       workwear_confirmed, message, checked_at
                  FROM personal_ppe_checks
                 WHERE id = ?
                """,
            id
        );
        return response(row);
    }

    private Map<String, Object> response(Map<String, Object> row) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", row.get("id"));
        response.put("permitId", row.get("permit_id"));
        response.put("fileId", row.get("file_id"));
        response.put("status", row.get("status"));
        response.put("safetyShoesConfirmed", asBoolean(row.get("safety_shoes_confirmed")));
        response.put("workwearConfirmed", asBoolean(row.get("workwear_confirmed")));
        response.put("message", "안전관리자에게 전달되었습니다.");
        response.put("checkedAt", row.get("checked_at"));
        return response;
    }

    private boolean asBoolean(Object value) {
        return Boolean.TRUE.equals(value) || value instanceof Number number && number.intValue() != 0;
    }

    private void requireUser(AuthService.AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
    }

    public record PersonalCheckRequest(
        Long permitId,
        @NotNull Long fileId,
        @NotNull Boolean safetyShoesConfirmed,
        @NotNull Boolean workwearConfirmed
    ) {
    }
}
