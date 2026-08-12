package com.example.safetyai.risk.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class OpenAiSafetyReportAnalysisClient {
    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final String apiKey;
    private final String model;

    public OpenAiSafetyReportAnalysisClient(
        RestClient.Builder builder,
        ObjectMapper objectMapper,
        @Value("${app.ai.openai.api-key:}") String apiKey,
        @Value("${app.ai.openai.base-url:https://api.openai.com/v1}") String baseUrl,
        @Value("${app.ai.openai.model:gpt-5.4-nano}") String model,
        @Value("${app.ai.openai.connect-timeout-ms:5000}") long connectTimeoutMs,
        @Value("${app.ai.openai.read-timeout-ms:120000}") long readTimeoutMs
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMs));
        this.restClient = builder.baseUrl(baseUrl).requestFactory(requestFactory).build();
        this.objectMapper = objectMapper;
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model;
    }

    public Analysis analyze(
        Resource image,
        String mimeType,
        String eventType,
        String description
    ) throws IOException {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("OPENAI_API_KEY is not configured.");
        }
        String safeMimeType = mimeType == null || !mimeType.startsWith("image/")
            ? "image/jpeg" : mimeType;
        String dataUrl;
        try (var input = image.getInputStream()) {
            dataUrl = "data:" + safeMimeType + ";base64," + Base64.getEncoder().encodeToString(input.readAllBytes());
        }

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("model", model);
        request.put("instructions", """
            You analyze shipyard safety incident reports. Extract observable risk evidence only.
            Do not calculate a final risk score. Rate impact, likelihood, worker exposure, and urgency
            from 1 (lowest) to 5 (highest). Set criticalCondition only for an immediate threat to life,
            active fire/explosion, electrocution, asphyxiation, uncontrolled fall, or unconscious person.
            When evidence is uncertain, use conservative but evidence-based ratings and state uncertainty.
            Return Korean summary and recommended action.
            """);
        request.put("input", List.of(Map.of(
            "role", "user",
            "content", List.of(
                Map.of("type", "input_text", "text", "신고 유형: " + eventType + "\n신고 내용: " + description),
                Map.of("type", "input_image", "image_url", dataUrl, "detail", "high")
            )
        )));
        request.put("max_output_tokens", 1200);
        request.put("text", Map.of(
            "verbosity", "low",
            "format", Map.of(
                "type", "json_schema",
                "name", "safety_incident_evidence",
                "strict", true,
                "schema", outputSchema()
            )
        ));

        JsonNode response = restClient.post()
            .uri("/responses")
            .contentType(MediaType.APPLICATION_JSON)
            .headers(headers -> headers.setBearerAuth(apiKey))
            .body(request)
            .retrieve()
            .body(JsonNode.class);
        String output = extractOutputText(response);
        return objectMapper.readValue(output, Analysis.class);
    }

    private Map<String, Object> outputSchema() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("estimatedLocation", Map.of("type", "string"));
        properties.put("impactLevel", levelSchema());
        properties.put("likelihoodLevel", levelSchema());
        properties.put("exposureLevel", levelSchema());
        properties.put("urgencyLevel", levelSchema());
        properties.put("criticalCondition", Map.of("type", "boolean"));
        properties.put("observedHazards", Map.of(
            "type", "array", "items", Map.of("type", "string"), "maxItems", 6
        ));
        properties.put("summary", Map.of("type", "string"));
        properties.put("recommendedAction", Map.of("type", "string"));
        properties.put("confidence", Map.of("type", "number", "minimum", 0, "maximum", 1));
        return Map.of(
            "type", "object",
            "additionalProperties", false,
            "properties", properties,
            "required", List.copyOf(properties.keySet())
        );
    }

    private Map<String, Object> levelSchema() {
        return Map.of("type", "integer", "minimum", 1, "maximum", 5);
    }

    private String extractOutputText(JsonNode response) {
        if (response == null) throw new IllegalStateException("OpenAI response is empty.");
        for (JsonNode output : response.path("output")) {
            for (JsonNode content : output.path("content")) {
                if ("output_text".equals(content.path("type").asText())) {
                    return content.path("text").asText();
                }
                if ("refusal".equals(content.path("type").asText())) {
                    throw new IllegalStateException("OpenAI refused the safety analysis.");
                }
            }
        }
        throw new IllegalStateException("OpenAI analysis output was not found.");
    }

    public String model() {
        return model;
    }

    public record Analysis(
        String estimatedLocation,
        int impactLevel,
        int likelihoodLevel,
        int exposureLevel,
        int urgencyLevel,
        boolean criticalCondition,
        List<String> observedHazards,
        String summary,
        String recommendedAction,
        double confidence
    ) {
    }
}
