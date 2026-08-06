package com.example.safetyai.permit.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDateTime;
import java.util.List;

public record WorkPermitRequest(
    String permitNo,
    @NotNull Long siteId,
    Long blockId,
    String workType,
    String workTitle,
    String workContent,
    Integer workerCount,
    String equipment,
    LocalDateTime startTime,
    LocalDateTime endTime,
    Double gpsLat,
    Double gpsLng,
    Boolean isHighRisk,
    String status,
    List<Long> fileIds,
    List<Long> workerIds
) {
    public WorkPermitRequest {
        if (isHighRisk == null) {
            isHighRisk = false;
        }
        if (status == null || status.isBlank()) {
            status = "draft";
        }
    }
}
