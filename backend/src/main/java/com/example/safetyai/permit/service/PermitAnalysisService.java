package com.example.safetyai.permit.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.file.storage.FileStorage;
import com.example.safetyai.risk.service.PermitRiskScoringService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class PermitAnalysisService {
    static final String MODEL_NAME = "ptw-rule-engine";
    static final String MODEL_VERSION = "2026.08.06";
    static final String INPUT_TYPE = "permit_analysis";

    private static final Logger log = LoggerFactory.getLogger(PermitAnalysisService.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final FileStorage fileStorage;
    private final PermitAnalysisClient client;
    private final ApplicationEventPublisher eventPublisher;
    private final PermitRiskScoringService riskScoringService;
    private final boolean enabled;

    public PermitAnalysisService(
        JdbcTemplate jdbcTemplate,
        ObjectMapper objectMapper,
        FileStorage fileStorage,
        PermitAnalysisClient client,
        ApplicationEventPublisher eventPublisher,
        PermitRiskScoringService riskScoringService,
        @Value("${app.ai.permit-analysis.enabled:true}") boolean enabled
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.fileStorage = fileStorage;
        this.client = client;
        this.eventPublisher = eventPublisher;
        this.riskScoringService = riskScoringService;
        this.enabled = enabled;
    }

    public Map<String, Object> queue(long permitId) {
        if (!enabled) {
            return Map.of("permitId", permitId, "status", "disabled");
        }
        Integer exists = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM work_permits WHERE id = ? AND status <> 'deleted'",
            Integer.class,
            permitId
        );
        if (exists == null || exists == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "분석할 작업허가서를 찾을 수 없습니다.");
        }
        long runId = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO model_runs
                (model_name, model_version, input_type, input_ref_id, status, output_payload)
                VALUES (?, ?, ?, ?, 'queued', JSON_OBJECT())
                """,
            List.of(MODEL_NAME, MODEL_VERSION, INPUT_TYPE, permitId)
        );
        eventPublisher.publishEvent(new PermitAnalysisRequested(permitId, runId));
        return Map.of("permitId", permitId, "runId", runId, "status", "queued");
    }

    // 허가서를 아직 만들기 전에, 업로드만 된 PDF를 곧바로 파싱해서 허가서 번호/작업명/작업
    // 유형/작업 내용 초안을 돌려준다. 여기서는 아무것도 DB에 저장하지 않는다 — 관리자가 검토·수정한
    // 뒤 실제로 "등록" 버튼을 눌러야 work_permits row가 생기고, 그때 이 파일이 fileIds로 연결된다.
    public Map<String, Object> parseDraft(long fileId) {
        Map<String, Object> file;
        try {
            file = jdbcTemplate.queryForMap(
                "SELECT storage_key, original_name FROM files WHERE id = ? AND file_type = 'permit'",
                fileId
            );
        } catch (EmptyResultDataAccessException exception) {
            throw new ApiException(HttpStatus.NOT_FOUND, "업로드한 허가서 PDF를 찾을 수 없습니다.");
        }
        Map<String, Object> response;
        try {
            Resource resource = fileStorage.load(String.valueOf(file.get("storage_key")));
            response = client.analyze(resource, String.valueOf(file.get("original_name")), null, List.of());
        } catch (IOException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "허가서 PDF를 읽지 못했습니다.");
        }
        return toDraftFields(response);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> toDraftFields(Map<String, Object> response) {
        Map<String, Object> parsed = response.get("parsed_permit") instanceof Map<?, ?> map
            ? (Map<String, Object>) map
            : Map.of();
        Map<String, Object> period = parsed.get("period") instanceof Map<?, ?> periodMap
            ? (Map<String, Object>) periodMap
            : Map.of();

        List<String> mainWorks = asStringList(parsed.get("main_works"));
        List<String> conditions = asStringList(parsed.get("conditions"));
        String formType = trimToNull(parsed.get("form_type"));
        String workType = formType != null ? formType + " 작업" : "일반 작업";

        List<String> titleParts = !mainWorks.isEmpty() ? mainWorks : conditions;
        String workTitle = !titleParts.isEmpty() ? String.join("·", titleParts) + " 작업" : workType;

        Map<String, Object> draft = new LinkedHashMap<>();
        draft.put("permitNo", trimToNull(parsed.get("permit_id")));
        draft.put("workType", workType);
        draft.put("workTitle", workTitle);
        draft.put("workContent", trimToNull(parsed.get("work_summary")));
        draft.put("startTime", period.get("start"));
        draft.put("endTime", period.get("end"));
        draft.put("zone", trimToNull(parsed.get("zone")));
        draft.put("warnings", parsed.getOrDefault("parse_warnings", List.of()));
        draft.put("summary", response.get("summary"));
        return draft;
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private List<String> asStringList(Object value) {
        if (!(value instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(String::valueOf).filter(item -> !item.isBlank()).toList();
    }

    @Async("permitAnalysisExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void analyze(PermitAnalysisRequested event) {
        jdbcTemplate.update(
            "UPDATE model_runs SET status = 'running', started_at = CURRENT_TIMESTAMP(6), error_message = NULL WHERE id = ?",
            event.runId()
        );
        try {
            Map<String, Object> permitFile = loadPermitFile(event.permitId());
            Resource resource = fileStorage.load(String.valueOf(permitFile.get("storage_key")));
            Map<String, Object> response = client.analyze(
                resource,
                String.valueOf(permitFile.get("original_name")),
                String.valueOf(permitFile.get("permit_no")),
                loadExistingPermitSnapshots(event.permitId())
            );
            saveResult(event.permitId(), response);
            finishRun(event.runId(), response);
            recomputeRiskScoreSafely(event.permitId());
        } catch (Exception exception) {
            String message = safeMessage(exception);
            log.warn("Work permit analysis failed for permit {}: {}", event.permitId(), message);
            failRun(event.runId(), message);
        }
    }

    private Map<String, Object> loadPermitFile(long permitId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT wp.permit_no, f.storage_key, f.original_name
                  FROM work_permits wp
                  JOIN work_permit_files wpf ON wpf.permit_id = wp.id
                  JOIN files f ON f.id = wpf.file_id
                 WHERE wp.id = ?
                   AND wp.status <> 'deleted'
                   AND f.file_type = 'permit'
                 ORDER BY wpf.created_at DESC
                 LIMIT 1
                """,
            permitId
        );
        if (rows.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "작업허가서 PDF가 연결되지 않았습니다.");
        }
        return rows.get(0);
    }

    private List<Map<String, Object>> loadExistingPermitSnapshots(long permitId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT wp.permit_no, par.extracted_data
                  FROM work_permits wp
                  JOIN permit_analysis_results par
                    ON par.id = (
                        SELECT par2.id
                          FROM permit_analysis_results par2
                         WHERE par2.permit_id = wp.id
                           AND par2.analysis_type = 'permit_rule_simops'
                         ORDER BY par2.created_at DESC
                         LIMIT 1
                    )
                 WHERE wp.id <> ?
                   AND wp.status <> 'deleted'
                """,
            permitId
        );
        List<Map<String, Object>> snapshots = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            Map<String, Object> extracted = jsonObject(row.get("extracted_data"));
            Object parsed = extracted.get("parsed_permit");
            if (!(parsed instanceof Map<?, ?> parsedMap)) {
                continue;
            }
            Map<String, Object> snapshot = new LinkedHashMap<>();
            parsedMap.forEach((key, value) -> snapshot.put(String.valueOf(key), value));
            snapshot.put("permit_id", String.valueOf(row.get("permit_no")));
            snapshots.add(snapshot);
        }
        return snapshots;
    }

    private void saveResult(long permitId, Map<String, Object> response) throws JsonProcessingException {
        Map<String, Object> extracted = new LinkedHashMap<>();
        extracted.put("schema_version", response.get("schema_version"));
        extracted.put("engine", response.get("engine"));
        extracted.put("engine_version", response.get("engine_version"));
        extracted.put("decision", response.get("decision"));
        extracted.put("overall_risk", response.get("overall_risk"));
        extracted.put("permit_number_matches", response.get("permit_number_matches"));
        extracted.put("expected_permit_no", response.get("expected_permit_no"));
        extracted.put("parsed_permit", response.get("parsed_permit"));
        extracted.put("pair_conflicts", response.getOrDefault("pair_conflicts", List.of()));

        List<Object> riskFactors = new ArrayList<>();
        addRiskFactors(riskFactors, response.get("permit_violations"), "permit_violation");
        addRiskFactors(riskFactors, response.get("pair_conflicts"), "simops_conflict");

        JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO permit_analysis_results
                (permit_id, analysis_type, model_name, summary, extracted_data,
                 risk_factors, recommended_conditions, confidence)
                VALUES (?, 'permit_rule_simops', ?, ?, ?, ?, ?, NULL)
                """,
            Arrays.asList(
                permitId,
                response.get("engine") + ":" + response.get("engine_version"),
                response.get("summary"),
                objectMapper.writeValueAsString(extracted),
                objectMapper.writeValueAsString(riskFactors),
                objectMapper.writeValueAsString(response.getOrDefault("recommended_conditions", List.of()))
            )
        );
        replaceSimopsConflicts(permitId, response.get("pair_conflicts"));
    }

    private void replaceSimopsConflicts(long permitId, Object rawConflicts) throws JsonProcessingException {
        jdbcTemplate.update(
            "DELETE FROM permit_simops_conflicts WHERE permit_a_id = ? OR permit_b_id = ?",
            permitId,
            permitId
        );
        if (!(rawConflicts instanceof List<?> conflicts)) {
            return;
        }
        for (Object item : conflicts) {
            if (!(item instanceof Map<?, ?> conflict)) {
                continue;
            }
            Object rawPermits = conflict.get("permits");
            if (!(rawPermits instanceof List<?> permitNumbers) || permitNumbers.size() < 2) {
                continue;
            }
            List<Map<String, Object>> counterparts = jdbcTemplate.queryForList(
                """
                    SELECT id
                      FROM work_permits
                     WHERE permit_no IN (?, ?)
                       AND id <> ?
                       AND status <> 'deleted'
                     LIMIT 1
                    """,
                String.valueOf(permitNumbers.get(0)),
                String.valueOf(permitNumbers.get(1)),
                permitId
            );
            if (counterparts.isEmpty()) {
                continue;
            }
            long counterpartId = ((Number) counterparts.get(0).get("id")).longValue();
            long permitA = Math.min(permitId, counterpartId);
            long permitB = Math.max(permitId, counterpartId);
            Object workTypes = conflict.containsKey("work_types") ? conflict.get("work_types") : List.of();
            jdbcTemplate.update(
                """
                    INSERT INTO permit_simops_conflicts
                    (permit_a_id, permit_b_id, rule_code, risk, reason, legal_ref, work_types, zone_relation)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                      risk = VALUES(risk), reason = VALUES(reason), legal_ref = VALUES(legal_ref),
                      work_types = VALUES(work_types), zone_relation = VALUES(zone_relation),
                      detected_at = CURRENT_TIMESTAMP(6)
                    """,
                permitA,
                permitB,
                String.valueOf(conflict.get("rule_id")),
                String.valueOf(conflict.get("risk")),
                String.valueOf(conflict.get("reason")),
                conflict.get("legal_ref"),
                objectMapper.writeValueAsString(workTypes),
                conflict.get("zone_relation")
            );
        }
    }

    private void addRiskFactors(List<Object> target, Object raw, String type) {
        if (!(raw instanceof List<?> items)) {
            return;
        }
        for (Object item : items) {
            if (item instanceof Map<?, ?> itemMap) {
                Map<String, Object> value = new LinkedHashMap<>();
                value.put("type", type);
                itemMap.forEach((key, field) -> value.put(String.valueOf(key), field));
                target.add(value);
            }
        }
    }

    private Map<String, Object> jsonObject(Object value) {
        if (value == null) {
            return Map.of();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, Object> normalized = new LinkedHashMap<>();
            map.forEach((key, item) -> normalized.put(String.valueOf(key), item));
            return normalized;
        }
        try {
            return objectMapper.readValue(String.valueOf(value), new TypeReference<>() {});
        } catch (JsonProcessingException exception) {
            return Map.of();
        }
    }

    private void finishRun(long runId, Map<String, Object> response) throws JsonProcessingException {
        jdbcTemplate.update(
            """
                UPDATE model_runs
                   SET status = 'finished', finished_at = CURRENT_TIMESTAMP(6),
                       output_payload = ?, error_message = NULL
                 WHERE id = ?
                """,
            objectMapper.writeValueAsString(response),
            runId
        );
    }

    // 허가서 분석 자체는 이미 성공했으므로, 종합 위험 점수 재계산이 실패해도 이 model_run을
    // 실패로 되돌리지 않는다 — 다음 트리거(PPE 점검·안전 이벤트) 때 다시 계산될 기회가 있다.
    private void recomputeRiskScoreSafely(long permitId) {
        try {
            riskScoringService.recompute(permitId);
        } catch (Exception exception) {
            log.warn("Risk score recompute failed for permit {}: {}", permitId, exception.getMessage());
        }
    }

    private void failRun(long runId, String message) {
        jdbcTemplate.update(
            """
                UPDATE model_runs
                   SET status = 'failed', finished_at = CURRENT_TIMESTAMP(6),
                       error_message = ?
                 WHERE id = ?
                """,
            message,
            runId
        );
    }

    private String safeMessage(Exception exception) {
        if (exception instanceof ApiException apiException) {
            return apiException.getMessage();
        }
        if (exception instanceof IOException) {
            return "작업허가서 파일 또는 분석 서비스에 접근하지 못했습니다: " + exception.getMessage();
        }
        String message = exception.getMessage();
        return message == null || message.isBlank() ? exception.getClass().getSimpleName() : message;
    }
}
