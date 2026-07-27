package com.example.safetyai.risk.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SafetyEventAnalysisRequest(
    @NotBlank String estimatedLocation,
    @NotBlank @Pattern(regexp = "low|medium|high|critical") String severity,
    @Min(0) @Max(100) int riskScore,
    @NotBlank String summary,
    @NotBlank String recommendedAction,
    @DecimalMin("0.0") @DecimalMax("1.0") double confidence,
    @NotBlank String modelVersion
) {
}
