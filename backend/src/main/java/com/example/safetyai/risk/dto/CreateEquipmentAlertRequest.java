package com.example.safetyai.risk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateEquipmentAlertRequest(
    @NotBlank @Size(max = 80) String facilityCode,
    @NotBlank @Size(max = 160) String facilityName,
    @NotBlank @Size(max = 80) String assetCode,
    @NotBlank @Size(max = 160) String assetName,
    @NotBlank @Size(max = 160) String faultPart,
    @NotBlank @Size(max = 500) String faultSymptom,
    @NotBlank @Size(max = 2000) String cause,
    @NotBlank @Size(max = 2000) String recommendedAction,
    @NotBlank @Pattern(regexp = "warning|critical") String severity
) {
}
