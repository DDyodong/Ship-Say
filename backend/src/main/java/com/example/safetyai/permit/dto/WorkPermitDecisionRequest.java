package com.example.safetyai.permit.dto;

import jakarta.validation.constraints.NotBlank;

public record WorkPermitDecisionRequest(
    @NotBlank String decision,
    String note
) {
}
