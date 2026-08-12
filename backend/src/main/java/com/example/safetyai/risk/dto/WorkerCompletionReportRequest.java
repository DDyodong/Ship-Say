package com.example.safetyai.risk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record WorkerCompletionReportRequest(
    @NotBlank @Size(max = 2000) String comment
) {
}
