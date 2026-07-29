package com.example.safetyai.worker.controller;

import com.example.safetyai.common.exception.ApiException;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/personal-checks")
public class PersonalCheckAiController {
    private final JdbcTemplate jdbcTemplate;

    public PersonalCheckAiController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping("/{id}/result")
    @Transactional
    public Map<String, Object> applyResult(
        @PathVariable long id,
        @Valid @RequestBody AnalysisResultRequest request
    ) {
        int updated = jdbcTemplate.update(
            """
                UPDATE personal_ppe_checks
                   SET status = ?,
                       passed = ?,
                       helmet_on = ?,
                       helmet_confidence = ?,
                       harness_on = ?,
                       welding_mask_on = ?,
                       model_name = ?,
                       message = ?,
                       analyzed_at = CURRENT_TIMESTAMP(6)
                 WHERE id = ?
                """,
            request.status(),
            "passed".equals(request.status()),
            request.helmetOn(),
            request.helmetConfidence(),
            request.harnessOn(),
            request.weldingMaskOn(),
            request.model(),
            request.message(),
            id
        );
        if (updated == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "보호구 점검 요청을 찾을 수 없습니다.");
        }
        return findById(id);
    }

    private Map<String, Object> findById(long id) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT id, status, passed, helmet_on, helmet_confidence, harness_on,
                       welding_mask_on, model_name, message, analyzed_at
                  FROM personal_ppe_checks
                 WHERE id = ?
                """,
            id
        );
        Map<String, Object> row = rows.get(0);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", row.get("id"));
        response.put("status", row.get("status"));
        response.put("passed", Boolean.TRUE.equals(row.get("passed"))
            || row.get("passed") instanceof Number number && number.intValue() != 0);
        response.put("helmetOn", row.get("helmet_on"));
        response.put("helmetConfidence", row.get("helmet_confidence"));
        response.put("harnessOn", row.get("harness_on"));
        response.put("weldingMaskOn", row.get("welding_mask_on"));
        response.put("model", row.get("model_name"));
        response.put("message", row.get("message"));
        response.put("analyzedAt", row.get("analyzed_at"));
        return response;
    }

    public record AnalysisResultRequest(
        @NotBlank
        @Pattern(regexp = "passed|retry_required|failed")
        String status,
        Boolean helmetOn,
        Double helmetConfidence,
        Boolean harnessOn,
        Boolean weldingMaskOn,
        @NotBlank String model,
        @NotBlank String message
    ) {
    }
}
