package com.example.safetyai.risk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SafetyEventActionRequest(
    @NotBlank @Pattern(regexp = "received|confirmed|in_progress|resolved") String status,
    @Size(max = 2000) String comment
) {
}
