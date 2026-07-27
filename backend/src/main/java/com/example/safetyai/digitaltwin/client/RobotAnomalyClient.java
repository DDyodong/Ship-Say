package com.example.safetyai.digitaltwin.client;

import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.RobotAnomalyAnalysis;
import com.example.safetyai.digitaltwin.dto.DigitalTwinDtos.RobotTelemetry;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class RobotAnomalyClient {
    private static final Logger log = LoggerFactory.getLogger(RobotAnomalyClient.class);
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final boolean enabled;
    private final String predictUrl;
    private final Duration requestTimeout;

    public RobotAnomalyClient(
        ObjectMapper objectMapper,
        @Value("${app.ai.robot-anomaly.enabled:true}") boolean enabled,
        @Value("${app.ai.robot-anomaly.base-url:http://127.0.0.1:8000}") String baseUrl,
        @Value("${app.ai.robot-anomaly.connect-timeout-ms:1000}") long connectTimeoutMs,
        @Value("${app.ai.robot-anomaly.request-timeout-ms:1500}") long requestTimeoutMs
    ) {
        this.objectMapper = objectMapper;
        this.enabled = enabled;
        this.predictUrl = baseUrl.replaceAll("/+$", "") + "/predict";
        this.requestTimeout = Duration.ofMillis(requestTimeoutMs);
        this.httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofMillis(connectTimeoutMs))
            .build();
    }

    public Optional<RobotAnomalyAnalysis> analyze(RobotTelemetry value) {
        if (!enabled) return Optional.empty();
        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("assetCode", value.assetCode());
            payload.put("recordedAt", value.recordedAt());
            payload.put("operatingState", value.operatingState());
            payload.put("voltage", value.voltage());
            payload.put("current_amp", value.currentAmp());
            payload.put("wire_feed", value.wireFeed());
            payload.put("travel_speed", value.travelSpeed());
            payload.put("torque_percent", value.torquePercent());
            payload.put("temperature_c", value.temperatureC());
            payload.put("gas_flow", value.gasFlow());

            HttpRequest request = HttpRequest.newBuilder(URI.create(predictUrl))
                .timeout(requestTimeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(objectMapper.writeValueAsString(payload)))
                .build();
            HttpResponse<String> response = httpClient.send(
                request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("Robot anomaly API returned HTTP {}", response.statusCode());
                return Optional.empty();
            }
            PredictionResponse result = objectMapper.readValue(
                response.body(), PredictionResponse.class);
            return Optional.of(new RobotAnomalyAnalysis(
                true, result.isAnomaly(), result.candidate(), result.confirmed(),
                result.anomalyType(), result.severity(), result.reasonSensor(),
                result.detectionSource(), result.anomalyScore(), result.anomalyThreshold(),
                result.consecutiveCount(), result.modelVersion()));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return Optional.empty();
        } catch (Exception exception) {
            log.debug("Robot anomaly API is unavailable: {}", exception.getMessage());
            return Optional.empty();
        }
    }

    public record PredictionResponse(
        boolean isAnomaly, boolean candidate, boolean confirmed, String anomalyType,
        String severity, String reasonSensor, String detectionSource, double anomalyScore,
        double anomalyThreshold, int consecutiveCount, String modelVersion
    ) {}
}
