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
import org.springframework.web.client.ResourceAccessException;
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
            // 분석 서비스가 응답은 했지만 4xx로 거절한 경우(예: PDF 양식을 못 읽음)는
            // 우리 쪽 요청/입력 문제이지 인프라 장애가 아니므로 422로 내려준다.
            // 서비스가 아예 죽었거나 5xx를 준 경우에만 502(Bad Gateway)를 유지한다.
            HttpStatus mappedStatus = exception.getStatusCode().is4xxClientError()
                ? HttpStatus.UNPROCESSABLE_ENTITY
                : HttpStatus.BAD_GATEWAY;
            throw new ApiException(mappedStatus, analysisError(exception));
        } catch (ResourceAccessException exception) {
            // 분석 서비스에 연결 자체가 안 되는 경우(다운·타임아웃). 응답이 없어 위
            // RestClientResponseException으로는 안 잡히므로 별도로 처리하지 않으면
            // 502 대신 스택트레이스가 그대로 노출되는 500으로 새어나간다.
            throw new ApiException(HttpStatus.BAD_GATEWAY, "작업허가서 분석 서비스에 연결하지 못했습니다.");
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
