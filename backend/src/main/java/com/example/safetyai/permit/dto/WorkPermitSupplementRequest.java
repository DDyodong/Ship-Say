package com.example.safetyai.permit.dto;

import jakarta.validation.constraints.NotBlank;

public record WorkPermitSupplementRequest(
    @NotBlank String note
) {
}
