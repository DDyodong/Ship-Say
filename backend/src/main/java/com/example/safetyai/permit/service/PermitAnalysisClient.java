package com.example.safetyai.permit.service;

import com.example.safetyai.common.exception.ApiException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Component
public class PermitAnalysisClient {
    private final ObjectMapper objectMapper;
    private final RestClient restClient;

    public PermitAnalysisClient(
        ObjectMapper objectMapper,
        RestClient.Builder builder,
        @Value("${app.ai.permit-analysis.base-url:http://127.0.0.1:8001}") String baseUrl,
        @Value("${app.ai.permit-analysis.connect-timeout-ms:3000}") long connectTimeoutMs,
        @Value("${app.ai.permit-analysis.request-timeout-ms:120000}") long requestTimeoutMs
    ) {
        this.objectMapper = objectMapper;
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(connectTimeoutMs));
        requestFactory.setReadTimeout(Duration.ofMillis(requestTimeoutMs));
        this.restClient = builder.baseUrl(baseUrl).requestFactory(requestFactory).build();
    }

    public Map<String, Object> analyze(
        Resource pdf,
        String originalName,
        String expectedPermitNo,
        List<Map<String, Object>> existingPermits
    ) throws IOException {
        byte[] content;
        try (var input = pdf.getInputStream()) {
            content = input.readAllBytes();
        }
        ByteArrayResource filePart = new ByteArrayResource(content) {
            @Override
            public String getFilename() {
                return originalName == null || originalName.isBlank() ? "permit.pdf" : originalName;
            }
        };

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", filePart);
        if (expectedPermitNo != null && !expectedPermitNo.isBlank()) {
            body.add("expected_permit_no", expectedPermitNo);
        }
        body.add("existing_permits_json", objectMapper.writeValueAsString(existingPermits));

        try {
            Map<String, Object> response = restClient.post()
                .uri("/v1/analyze")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(new ParameterizedTypeReference<Map<String, Object>>() {});
            if (response == null) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "작업허가서 분석 응답이 비어 있습니다.");
            }
            return response;
        } catch (RestClientResponseException exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, analysisError(exception));
        }
    }

    private String analysisError(RestClientResponseException exception) {
        try {
            Map<String, Object> payload = objectMapper.readValue(
                exception.getResponseBodyAsString(),
                new com.fasterxml.jackson.core.type.TypeReference<>() {}
            );
            Object detail = payload.get("detail");
            if (detail != null && !String.valueOf(detail).isBlank()) {
                return "작업허가서 분석 실패: " + detail;
            }
        } catch (JsonProcessingException ignored) {
            // 응답 본문이 JSON이 아니면 상태 코드 기반 메시지를 사용한다.
        }
        return "작업허가서 분석 서비스 호출에 실패했습니다 (HTTP " + exception.getStatusCode().value() + ").";
    }
}
