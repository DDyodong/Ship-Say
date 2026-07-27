package com.example.safetyai.common.exception;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.Test;
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
}
