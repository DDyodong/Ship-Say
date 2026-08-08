package com.example.safetyai.worker.controller;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
    private static final Set<String> SUPPORTED_PPE = Set.of("helmet", "harness", "welding_mask");

    private final JdbcTemplate jdbcTemplate;
    private final SafetyEventRepository safetyEventRepository;
    private final NotificationService notificationService;
    private final ObjectMapper objectMapper;

    public PersonalCheckAiController(
        JdbcTemplate jdbcTemplate,
        SafetyEventRepository safetyEventRepository,
        NotificationService notificationService,
        ObjectMapper objectMapper
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.safetyEventRepository = safetyEventRepository;
        this.notificationService = notificationService;
        this.objectMapper = objectMapper;
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
        List<String> missingItems = normalizeMissingItems(request.missingItems());
        Long eventId = null;
        if ("retry_required".equals(request.status())
            && "PPE_MISSING".equals(request.reasonCode())
            && !missingItems.isEmpty()) {
            eventId = safetyEventRepository.createAiPpeEvent(
                id,
                missingDescription(missingItems),
                eventPayload(id, request, missingItems)
            );
            Long notificationEventId = eventId;
            notificationService.afterCommit(
                () -> notificationService.notifyPpeRetry(id, notificationEventId, missingItems)
            );
        }

        Map<String, Object> response = findById(id);
        if (eventId != null) {
            response.put("safetyEventId", eventId);
        }
        return response;
    }

    private List<String> normalizeMissingItems(List<String> items) {
        if (items == null) {
            return List.of();
        }
        return items.stream()
            .filter(item -> item != null && SUPPORTED_PPE.contains(item.trim().toLowerCase()))
            .map(item -> item.trim().toLowerCase())
            .distinct()
            .toList();
    }

    private String missingDescription(List<String> missingItems) {
        String labels = missingItems.stream()
            .map(item -> switch (item) {
                case "helmet" -> "안전모";
                case "harness" -> "안전 하네스";
                case "welding_mask" -> "용접면";
                default -> item;
            })
            .reduce((left, right) -> left + ", " + right)
            .orElse("보호구");
        return "AI 보호구 검사에서 " + labels + " 미착용이 감지되었습니다.";
    }

    private String eventPayload(
        long ppeCheckId,
        AnalysisResultRequest request,
        List<String> missingItems
    ) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("analysisStatus", "completed");
        payload.put("ppeCheckId", ppeCheckId);
        payload.put("reasonCode", request.reasonCode());
        payload.put("missingItems", missingItems);
        payload.put("helmetOn", request.helmetOn());
        payload.put("helmetConfidence", request.helmetConfidence());
        payload.put("harnessOn", request.harnessOn());
        payload.put("weldingMaskOn", request.weldingMaskOn());
        payload.put("modelVersion", request.model());
        payload.put("summary", request.message());
        return objectMapper.valueToTree(payload).toString();
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
        @NotBlank String message,
        String reasonCode,
        List<String> missingItems
    ) {
    }
}
