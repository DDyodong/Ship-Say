package com.example.safetyai.permit.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class OpenAiPermitFieldGuidanceService implements PermitFieldGuidanceService {
    private static final String GUIDANCE_VERSION_PREFIX = "field-guidance-v2";

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final RestClient restClient;
    private final String apiKey;
    private final String model;
    private final String reasoningEffort;
    private final int maxOutputTokens;
    private final String systemPrompt;
    private final String guidanceVersion;

    public OpenAiPermitFieldGuidanceService(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        RestClient.Builder restClientBuilder,
        @Value("${app.ai.openai.api-key:}") String apiKey,
        @Value("${app.ai.openai.base-url:https://api.openai.com/v1}") String baseUrl,
        @Value("${app.ai.openai.model:gpt-5.4-nano}") String model,
        @Value("${app.ai.openai.reasoning-effort:none}") String reasoningEffort,
        @Value("${app.ai.openai.max-output-tokens:16000}") int maxOutputTokens,
        @Value("${app.ai.openai.connect-timeout-ms:5000}") long connectTimeoutMs,
        @Value("${app.ai.openai.read-timeout-ms:120000}") long readTimeoutMs,
        @Value("classpath:prompts/work-permit-field-guidance.txt") Resource promptResource
    ) throws IOException {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.restClient = restClientBuilder.baseUrl(baseUrl).requestFactory(requestFactory).build();
        this.apiKey = apiKey;
        this.model = model;
        this.reasoningEffort = reasoningEffort;
        this.maxOutputTokens = maxOutputTokens;
        this.systemPrompt = promptResource.getContentAsString(StandardCharsets.UTF_8);
        this.guidanceVersion = computeGuidanceVersion(objectMapper, systemPrompt, outputSchema());
    }

    @Override
    public Map<String, Object> generate(long permitId) {
        List<Map<String, Object>> workers = loadWorkers(permitId);
        Map<String, Object> cached = loadCachedGuidance(permitId, workers);
        if (cached != null) return cached;

        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OPENAI_API_KEY가 설정되지 않았습니다.");
        }

        Map<String, Object> permit = loadPermit(permitId);
        Map<String, Object> ruleDecision = loadRuleDecision(permitId);
        long runId = createRun(permitId);

        try {
            Map<String, Object> context = new LinkedHashMap<>();
            context.put("permit", permit);
            context.put("ruleDecision", ruleDecision);
            context.put("assignedWorkers", workers);
            JsonNode response = callOpenAi(objectMapper.writeValueAsString(context));
            JsonNode guidance = objectMapper.readTree(extractOutputText(response));
            validateGuidance(guidance, loadWorkers(permitId));
            finishRun(runId, guidance);
            return objectMapper.convertValue(guidance, new TypeReference<>() {});
        } catch (RestClientResponseException exception) {
            String message = openAiErrorMessage(exception);
            failRun(runId, message);
            throw new ApiException(HttpStatus.BAD_GATEWAY, message);
        } catch (IOException | RuntimeException exception) {
            String message = "현장 적용 안내 생성에 실패했습니다: " + safeMessage(exception);
            failRun(runId, message);
            if (exception instanceof ApiException apiException) throw apiException;
            throw new ApiException(HttpStatus.BAD_GATEWAY, message);
        }
    }

    private Map<String, Object> loadPermit(long permitId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT wp.id, wp.permit_no, wp.work_type, wp.work_title, wp.work_content,
                       wp.worker_count, wp.equipment, wp.start_time, wp.end_time,
                       wp.is_high_risk, wp.status, s.name AS site_name, b.block_code
                  FROM work_permits wp
                  JOIN sites s ON s.id = wp.site_id
             LEFT JOIN blocks b ON b.id = wp.block_id
                 WHERE wp.id = ? AND wp.status <> 'deleted'
                """,
            permitId
        );
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "작업허가서를 찾을 수 없습니다.");
        }
        return rows.get(0);
    }

    private Map<String, Object> loadRuleDecision(long permitId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT id, analysis_type, model_name, summary, extracted_data,
                       risk_factors, recommended_conditions, confidence, created_at
                  FROM permit_analysis_results
                 WHERE permit_id = ?
                   AND analysis_type = 'permit_rule_simops'
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
            permitId
        );
        if (rows.isEmpty()) {
            throw new ApiException(
                HttpStatus.CONFLICT,
                "팀 규칙 모델의 허가서 판정 결과가 먼저 필요합니다."
            );
        }
        Map<String, Object> decision = new LinkedHashMap<>(rows.get(0));
        normalizeJsonColumn(decision, "extracted_data");
        normalizeJsonColumn(decision, "risk_factors");
        normalizeJsonColumn(decision, "recommended_conditions");
        return decision;
    }

    private List<Map<String, Object>> loadWorkers(long permitId) {
        return jdbcTemplate.queryForList(
            """
                SELECT u.id AS worker_id, u.name,
                       COALESCE(NULLIF(u.language, ''), 'ko') AS language
                  FROM work_permit_workers wpw
                  JOIN users u ON u.id = wpw.user_id
                 WHERE wpw.permit_id = ?
                 ORDER BY u.id
                """,
            permitId
        );
    }

    private void normalizeJsonColumn(Map<String, Object> row, String key) {
        Object value = row.get(key);
        if (!(value instanceof String json) || json.isBlank()) return;
        try {
            row.put(key, objectMapper.readTree(json));
        } catch (IOException ignored) {
            // 구형/외부 모델이 JSON이 아닌 값을 저장한 경우 원문을 그대로 전달합니다.
        }
    }

    private JsonNode callOpenAi(String contextJson) {
        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("instructions", systemPrompt);
        request.put("input", List.of(Map.of(
            "role", "user",
            "content", List.of(Map.of(
                "type", "input_text",
                "text", "다음 JSON을 현장 적용 안내로 변환하세요.\n" + contextJson
            ))
        )));
        request.put("reasoning", Map.of("effort", reasoningEffort));
        request.put("max_output_tokens", maxOutputTokens);
        request.put("text", Map.of(
            "verbosity", "low",
            "format", Map.of(
                "type", "json_schema",
                "name", "permit_field_guidance",
                "strict", true,
                "schema", outputSchema()
            )
        ));

        return restClient.post()
            .uri("/responses")
            .contentType(MediaType.APPLICATION_JSON)
            .headers(headers -> headers.setBearerAuth(apiKey))
            .body(request)
            .retrieve()
            .body(JsonNode.class);
    }

    /**
     * 프론트/번역 모듈과 공유할 OpenAI 출력 계약입니다.
     * 팀 모델의 판정 필드는 의도적으로 출력에 넣지 않아 LLM이 판정을 덮어쓸 수 없게 합니다.
     */
    static Map<String, Object> outputSchema() {
        Map<String, Object> tbmItem = objectSchema(
            Map.of(
                "phase", Map.of("type", "string", "enum", List.of("before", "during", "emergency")),
                "priority", Map.of("type", "string", "enum", List.of("critical", "normal")),
                "text", Map.of("type", "string"),
                "sourceEvidence", Map.of("type", "string")
            ),
            List.of("phase", "priority", "text", "sourceEvidence")
        );
        Map<String, Object> ppeItem = objectSchema(
            Map.of(
                "code", Map.of("type", "string"),
                "name", Map.of("type", "string"),
                "reason", Map.of("type", "string")
            ),
            List.of("code", "name", "reason")
        );
        Map<String, Object> workerItem = objectSchema(
            Map.of(
                "workerId", Map.of("type", "integer"),
                "workerName", Map.of("type", "string"),
                "language", Map.of("type", "string"),
                "taskAssumption", Map.of("type", "string"),
                "requiresTaskConfirmation", Map.of("type", "boolean"),
                "requiredPpe", boundedArraySchema(ppeItem, 6),
                "checks", boundedArraySchema(Map.of("type", "string"), 4),
                "warnings", boundedArraySchema(Map.of("type", "string"), 2)
            ),
            List.of(
                "workerId", "workerName", "language", "taskAssumption",
                "requiresTaskConfirmation", "requiredPpe", "checks", "warnings"
            )
        );
        return objectSchema(
            Map.of(
                "tbmTitle", Map.of("type", "string"),
                "tbmSummary", Map.of("type", "string"),
                "tbmItems", boundedArraySchema(tbmItem, 8),
                "commonPpe", boundedArraySchema(ppeItem, 6),
                "workerGuidance", Map.of("type", "array", "items", workerItem),
                "translationTargets", Map.of("type", "array", "items", Map.of("type", "string")),
                "operatorWarnings", Map.of("type", "array", "items", Map.of("type", "string"))
            ),
            List.of(
                "tbmTitle", "tbmSummary", "tbmItems", "commonPpe",
                "workerGuidance", "translationTargets", "operatorWarnings"
            )
        );
    }

    private static Map<String, Object> objectSchema(
        Map<String, Object> properties,
        List<String> required
    ) {
        return Map.of(
            "type", "object",
            "additionalProperties", false,
            "properties", properties,
            "required", required
        );
    }

    private static Map<String, Object> boundedArraySchema(Object items, int maxItems) {
        return Map.of(
            "type", "array",
            "items", items,
            "maxItems", maxItems
        );
    }

    static String computeGuidanceVersion(
        ObjectMapper objectMapper,
        String prompt,
        Map<String, Object> schema
    ) {
        try {
            String canonicalSchema = objectMapper.copy()
                .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true)
                .writeValueAsString(schema);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String hash = HexFormat.of().formatHex(
                digest.digest((prompt + "\n" + canonicalSchema).getBytes(StandardCharsets.UTF_8))
            );
            return GUIDANCE_VERSION_PREFIX + "-" + hash.substring(0, 16);
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("현장 안내 버전을 계산할 수 없습니다.", exception);
        }
    }

    static void validateGuidance(JsonNode guidance, List<Map<String, Object>> workers) {
        if (guidance == null || !guidance.isObject()) {
            throw new IllegalStateException("현장 안내가 JSON 객체가 아닙니다.");
        }

        validateMaxItems(guidance, "tbmItems", 8);
        validateMaxItems(guidance, "commonPpe", 6);

        Map<Long, Map<String, Object>> expectedById = new LinkedHashMap<>();
        Set<String> expectedLanguages = new LinkedHashSet<>();
        expectedLanguages.add("ko");
        for (Map<String, Object> worker : workers) {
            Object workerIdValue = worker.get("worker_id");
            if (!(workerIdValue instanceof Number workerIdNumber)) {
                throw new IllegalStateException("배정 작업자 정보에 유효한 작업자 ID가 없습니다.");
            }
            long workerId = workerIdNumber.longValue();
            if (expectedById.put(workerId, worker) != null) {
                throw new IllegalStateException("배정 작업자 명단에 중복된 작업자 ID가 있습니다.");
            }
            expectedLanguages.add(Objects.toString(worker.get("language"), "ko"));
        }

        JsonNode workerGuidance = requireArray(guidance, "workerGuidance");
        if (workerGuidance.size() != expectedById.size()) {
            throw new IllegalStateException("작업자별 안내 개수가 배정 작업자 수와 일치하지 않습니다.");
        }

        Set<Long> actualIds = new HashSet<>();
        for (JsonNode item : workerGuidance) {
            JsonNode workerIdNode = item.get("workerId");
            if (workerIdNode == null || !workerIdNode.isIntegralNumber() || !workerIdNode.canConvertToLong()) {
                throw new IllegalStateException("작업자별 안내에 유효한 작업자 ID가 없습니다.");
            }
            long workerId = workerIdNode.longValue();
            if (!actualIds.add(workerId)) {
                throw new IllegalStateException("작업자별 안내에 중복된 작업자 ID가 있습니다.");
            }

            Map<String, Object> expected = expectedById.get(workerId);
            if (expected == null) {
                throw new IllegalStateException("작업자별 안내에 배정되지 않은 작업자 ID가 있습니다.");
            }
            if (!Objects.equals(item.path("workerName").asText(), Objects.toString(expected.get("name"), ""))) {
                throw new IllegalStateException("작업자별 안내의 작업자 이름이 배정 명단과 일치하지 않습니다.");
            }
            if (!Objects.equals(item.path("language").asText(), Objects.toString(expected.get("language"), "ko"))) {
                throw new IllegalStateException("작업자별 안내의 언어가 배정 명단과 일치하지 않습니다.");
            }

            validateMaxItems(item, "requiredPpe", 6);
            validateMaxItems(item, "checks", 4);
            validateMaxItems(item, "warnings", 2);
        }

        if (!actualIds.equals(expectedById.keySet())) {
            throw new IllegalStateException("작업자별 안내의 작업자 ID가 배정 명단과 일치하지 않습니다.");
        }

        JsonNode translationTargets = requireArray(guidance, "translationTargets");
        Set<String> actualLanguages = new LinkedHashSet<>();
        for (JsonNode language : translationTargets) {
            if (!language.isTextual() || language.asText().isBlank()) {
                throw new IllegalStateException("번역 대상 언어 코드가 유효하지 않습니다.");
            }
            if (!actualLanguages.add(language.asText())) {
                throw new IllegalStateException("번역 대상 언어 코드가 중복되었습니다.");
            }
        }
        if (!actualLanguages.equals(expectedLanguages)) {
            throw new IllegalStateException("번역 대상 언어가 배정 작업자의 언어와 일치하지 않습니다.");
        }
    }

    private static void validateMaxItems(JsonNode object, String field, int maxItems) {
        JsonNode array = requireArray(object, field);
        if (array.size() > maxItems) {
            throw new IllegalStateException(field + " 항목 수가 최대 " + maxItems + "개를 초과했습니다.");
        }
    }

    private static JsonNode requireArray(JsonNode object, String field) {
        JsonNode array = object.get(field);
        if (array == null || !array.isArray()) {
            throw new IllegalStateException(field + " 필드가 배열이 아닙니다.");
        }
        return array;
    }

    private long createRun(long permitId) {
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO model_runs
                (model_name, model_version, input_type, input_ref_id, status, started_at, output_payload)
                VALUES (?, ?, 'permit_field_guidance', ?, 'running', CURRENT_TIMESTAMP(6), JSON_OBJECT())
                """,
            List.of(model, guidanceVersion, permitId)
        );
    }

    Map<String, Object> loadCachedGuidance(long permitId, List<Map<String, Object>> workers) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT mr.output_payload
                  FROM model_runs mr
                  JOIN work_permits wp ON wp.id = mr.input_ref_id
                 WHERE mr.input_type = 'permit_field_guidance'
                   AND mr.input_ref_id = ?
                   AND mr.model_name = ?
                   AND mr.model_version = ?
                   AND mr.status = 'finished'
                   AND mr.finished_at >= wp.updated_at
                   AND NOT EXISTS (
                       SELECT 1 FROM permit_analysis_results par
                        WHERE par.permit_id = ? AND par.created_at > mr.finished_at
                   )
                   AND NOT EXISTS (
                       SELECT 1 FROM work_permit_workers wpw
                        WHERE wpw.permit_id = ? AND wpw.assigned_at > mr.finished_at
                   )
                   AND NOT EXISTS (
                       SELECT 1
                         FROM work_permit_workers wpw
                         JOIN users u ON u.id = wpw.user_id
                        WHERE wpw.permit_id = ? AND u.updated_at > mr.finished_at
                   )
                 ORDER BY mr.finished_at DESC
                 LIMIT 1
                """,
            permitId,
            model,
            guidanceVersion,
            permitId,
            permitId,
            permitId
        );
        if (rows.isEmpty()) return null;
        try {
            JsonNode cached = objectMapper.readTree(String.valueOf(rows.get(0).get("output_payload")));
            validateGuidance(cached, workers);
            return objectMapper.convertValue(cached, new TypeReference<>() {});
        } catch (IOException | RuntimeException exception) {
            return null;
        }
    }

    private void finishRun(long runId, JsonNode guidance) {
        jdbcTemplate.update(
            "UPDATE model_runs SET status = 'finished', finished_at = CURRENT_TIMESTAMP(6), output_payload = ? WHERE id = ?",
            guidance.toString(), runId
        );
    }

    private void failRun(long runId, String message) {
        jdbcTemplate.update(
            "UPDATE model_runs SET status = 'failed', finished_at = CURRENT_TIMESTAMP(6), error_message = ? WHERE id = ?",
            message, runId
        );
    }

    private String extractOutputText(JsonNode response) {
        if (response == null) throw new IllegalStateException("OpenAI 응답이 비어 있습니다.");
        for (JsonNode output : response.path("output")) {
            for (JsonNode content : output.path("content")) {
                if ("output_text".equals(content.path("type").asText())) {
                    return content.path("text").asText();
                }
                if ("refusal".equals(content.path("type").asText())) {
                    throw new IllegalStateException("모델이 생성을 거절했습니다: " + content.path("refusal").asText());
                }
            }
        }
        throw new IllegalStateException("OpenAI 응답에서 현장 안내를 찾을 수 없습니다.");
    }

    private String openAiErrorMessage(RestClientResponseException exception) {
        try {
            JsonNode body = objectMapper.readTree(exception.getResponseBodyAsString(StandardCharsets.UTF_8));
            String detail = body.path("error").path("message").asText();
            if (!detail.isBlank()) return "OpenAI API 오류: " + detail;
        } catch (Exception ignored) {
            // 상태 코드만 포함한 메시지로 대체합니다.
        }
        return "OpenAI API 호출에 실패했습니다 (HTTP " + exception.getStatusCode().value() + ").";
    }

    private String safeMessage(Exception exception) {
        return exception.getMessage() == null || exception.getMessage().isBlank()
            ? exception.getClass().getSimpleName()
            : exception.getMessage();
    }
}
