package com.example.safetyai.worker.service;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

@Component
public class PpeImageAnalysisClient {
    private final RestClient restClient;
    private final String apiKey;

    public PpeImageAnalysisClient(
        RestClient.Builder builder,
        @Value("${app.ai.ppe-image.base-url:http://127.0.0.1:8000}") String baseUrl,
        @Value("${app.ai.ppe-image.api-key:}") String apiKey,
        @Value("${app.ai.ppe-image.connect-timeout-ms:3000}") long connectTimeoutMs,
        @Value("${app.ai.ppe-image.request-timeout-ms:180000}") long requestTimeoutMs
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(requestTimeoutMs));
        this.restClient = builder.baseUrl(baseUrl).requestFactory(requestFactory).build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
    }

    public AnalysisResult analyze(Resource image, String originalName) throws IOException {
        if (apiKey.isBlank()) {
            throw new IllegalStateException("PPE_IMAGE_API_KEY is not configured.");
        }
        byte[] content;
        try (var input = image.getInputStream()) {
            content = input.readAllBytes();
        }
        ByteArrayResource filePart = new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return originalName == null || originalName.isBlank() ? "ppe-image.jpg" : originalName;
            }
        };
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", filePart);

        AnalysisResult response = restClient.post()
            .uri("/infer/image")
            .header("X-API-Key", apiKey)
            .contentType(MediaType.MULTIPART_FORM_DATA)
            .body(body)
            .retrieve()
            .body(AnalysisResult.class);
        if (response == null) {
            throw new IOException("PPE image inference returned an empty response.");
        }
        return response;
    }

    public record AnalysisResult(
        String status,
        Boolean helmetOn,
        Double helmetConfidence,
        Boolean harnessOn,
        Boolean weldingMaskOn,
        String model,
        String message,
        String reasonCode,
        List<String> missingItems
    ) {
    }
}
