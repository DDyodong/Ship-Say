package com.example.safetyai.digitaltwin.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDateTime;
import java.util.List;

public final class DigitalTwinDtos {
    private DigitalTwinDtos() {}

    public record Facility(long id, String code, String name, String type, String status,
                           String riskLevel, int progressPercent, double mapX, double mapY,
                           double mapWidth, double mapHeight) {}

    public record Asset(long id, String code, String name, String type, String modelName,
                        String status, double positionX, double positionY, double positionZ) {}

    public record AxisAngles(double s, double l, double u, double r, double b, double t) {}

    public record RobotTelemetry(
        long assetId, String assetCode, String assetName, String modelName, LocalDateTime recordedAt,
        String operatingState, boolean servoOn, String jobName, String seamNo, double progressPercent,
        double voltage, double currentAmp, double wireFeed, double travelSpeed, double torquePercent,
        double temperatureC, double gasFlow, AxisAngles axes, String scenarioType,
        String riskLevel, String alarmCode
    ) {}

    public record ProcessStep(String code, String name, String status, int progressPercent) {}

    public record Alarm(long id, String assetCode, String alarmCode, String severity, String title,
                        String description, String status, LocalDateTime occurredAt,
                        LocalDateTime acknowledgedAt) {}

    public record YardSnapshot(String siteCode, String siteName, LocalDateTime generatedAt,
                               int runningFacilities, int warningFacilities, int openAlarms,
                               List<Facility> facilities) {}

    public record ShopSnapshot(Facility facility, LocalDateTime generatedAt, String dataSource,
                               String activeScenario, double blockPositionPercent,
                               List<ProcessStep> process, List<Asset> assets,
                               List<RobotTelemetry> robots, List<Alarm> alarms) {}

    public record ScenarioRequest(@NotBlank String type, @Min(10) @Max(300) Integer durationSeconds) {
        public ScenarioRequest {
            if (durationSeconds == null) durationSeconds = 30;
        }
    }

    public record ScenarioResult(long id, String facilityCode, String type, int durationSeconds,
                                 LocalDateTime startedAt, LocalDateTime endsAt) {}

    public record ScenarioState(long id, String type, LocalDateTime startedAt, LocalDateTime endsAt) {
        public static ScenarioState normal() {
            LocalDateTime now = LocalDateTime.now();
            return new ScenarioState(0, "NORMAL", now, now);
        }
    }

    public record HistoryPoint(String assetCode, String scenarioType, String operatingState,
                               double currentAmp, double voltage, double torquePercent,
                               double temperatureC, double gasFlow, String riskLevel,
                               LocalDateTime recordedAt) {}
}
