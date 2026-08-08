package com.example.safetyai.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class GlobalExceptionHandlerTest {
    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void emptyQueryResultReturnsNotFound() {
        ResponseEntity<Map<String, Object>> response = handler.handleNotFound(
            new EmptyResultDataAccessException(1)
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).containsEntry("message", "요청한 리소스를 찾을 수 없습니다.");
    }

    @Test
    void apiExceptionResponseUsesTheStatusAndMessageItWasThrownWith() {
        // EXC-002: 서비스 계층에서 던진 ApiException은 자신이 지정한
        // HttpStatus·메시지 그대로 응답에 반영되어야 한다(예: 409 상태 충돌).
        ApiException exception = new ApiException(HttpStatus.CONFLICT, "이미 삭제된 허가서입니다.");

        ResponseEntity<Map<String, Object>> response = handler.handleApiException(exception);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).containsEntry("message", "이미 삭제된 허가서입니다.");
    }

    @Test
    void duplicateKeyExceptionMapsToConflict() {
        ResponseEntity<Map<String, Object>> response = handler.handleDuplicateKey(
            new DuplicateKeyException("unique key violation")
        );

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).containsEntry("message", "이미 존재하는 데이터입니다.");
    }
}
