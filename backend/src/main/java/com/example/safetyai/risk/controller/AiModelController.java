package com.example.safetyai.risk.controller;

import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.permit.service.PermitFieldGuidanceService;
import com.example.safetyai.permit.service.TbmMaterialService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai")
public class AiModelController {
    private final JdbcTemplate jdbcTemplate;
    private final PermitFieldGuidanceService fieldGuidanceService;
    private final TbmMaterialService tbmMaterialService;

    public AiModelController(
        JdbcTemplate jdbcTemplate,
        PermitFieldGuidanceService fieldGuidanceService,
        TbmMaterialService tbmMaterialService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.fieldGuidanceService = fieldGuidanceService;
        this.tbmMaterialService = tbmMaterialService;
    }

    @GetMapping("/model-runs")
    public List<Map<String, Object>> modelRuns() {
        return jdbcTemplate.queryForList("SELECT * FROM model_runs ORDER BY id DESC LIMIT 100");
    }

    @PostMapping("/model-runs")
    public Map<String, Object> createModelRun(@Valid @RequestBody ModelRunRequest request) {
        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO model_runs
                (model_name, model_version, input_type, input_ref_id, status, output_payload, error_message)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
            Arrays.asList(
                request.modelName(),
                request.modelVersion(),
                request.inputType(),
                request.inputRefId(),
                request.status(),
                request.outputPayloadJson(),
                request.errorMessage()
            )
        );
        return Map.of("id", id);
    }

    @PostMapping("/work-permits/{permitId}/analysis-results")
    public Map<String, Object> createPermitAnalysis(
        @PathVariable long permitId,
        @Valid @RequestBody PermitAnalysisRequest request
    ) {
        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO permit_analysis_results
                (permit_id, analysis_type, model_name, summary, extracted_data, risk_factors, recommended_conditions, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
            Arrays.asList(
                permitId,
                request.analysisType(),
                request.modelName(),
                request.summary(),
                request.extractedDataJson(),
                request.riskFactorsJson(),
                request.recommendedConditionsJson(),
                request.confidence()
            )
        );
        return Map.of("id", id);
    }

    @PostMapping("/work-permits/{permitId}/field-guidance")
    public Map<String, Object> createFieldGuidance(@PathVariable long permitId) {
        Map<String, Object> guidance = fieldGuidanceService.generate(permitId);
        tbmMaterialService.save(permitId, guidance);
        return guidance;
    }

    public record ModelRunRequest(
        @NotBlank String modelName,
        String modelVersion,
        @NotBlank String inputType,
        Long inputRefId,
        String status,
        String outputPayloadJson,
        String errorMessage
    ) {
        public ModelRunRequest {
            if (status == null || status.isBlank()) {
                status = "finished";
            }
            if (outputPayloadJson == null || outputPayloadJson.isBlank()) {
                outputPayloadJson = "{}";
            }
        }
    }

    public record PermitAnalysisRequest(
        @NotBlank String analysisType,
        String modelName,
        String summary,
        String extractedDataJson,
        String riskFactorsJson,
        String recommendedConditionsJson,
        Double confidence
    ) {
        public PermitAnalysisRequest {
            if (extractedDataJson == null || extractedDataJson.isBlank()) {
                extractedDataJson = "{}";
            }
            if (riskFactorsJson == null || riskFactorsJson.isBlank()) {
                riskFactorsJson = "[]";
            }
            if (recommendedConditionsJson == null || recommendedConditionsJson.isBlank()) {
                recommendedConditionsJson = "[]";
            }
        }
    }
}
