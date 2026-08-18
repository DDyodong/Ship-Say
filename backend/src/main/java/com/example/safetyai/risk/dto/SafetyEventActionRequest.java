package com.example.safetyai.risk.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SafetyEventActionRequest(
    @NotBlank @Pattern(regexp = "confirmed|in_progress|action_requested|resolved") String status,
    @Size(max = 2000) String comment,
    Boolean notifyReporter,
    Long targetUserId
) {
    public SafetyEventActionRequest(String status, String comment, Boolean notifyReporter) {
        this(status, comment, notifyReporter, null);
    }
}
