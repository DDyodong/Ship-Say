package com.example.safetyai.worker.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class PersonalCheckNotificationTest {
    @Mock
    private JdbcTemplate jdbcTemplate;
    @Mock
    private SafetyEventRepository safetyEventRepository;
    @Mock
    private NotificationService notificationService;

    private PersonalCheckAiController controller;

    @BeforeEach
    void setUp() {
        controller = new PersonalCheckAiController(
            jdbcTemplate,
            safetyEventRepository,
            notificationService,
            new ObjectMapper()
        );
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(1);
        when(jdbcTemplate.queryForList(anyString(), eq(31L))).thenReturn(List.of(resultRow()));
    }

    @Test
    void schedulesAutomaticRetryNotificationForConfirmedMissingPpe() {
        when(safetyEventRepository.createAiPpeEvent(eq(31L), anyString(), anyString())).thenReturn(77L);
        doAnswer(invocation -> {
            invocation.<Runnable>getArgument(0).run();
            return null;
        }).when(notificationService).afterCommit(any(Runnable.class));
        PersonalCheckAiController.AnalysisResultRequest request = request(
            "retry_required", "PPE_MISSING", List.of("harness")
        );

        Map<String, Object> response = controller.applyResult(31L, request);

        assertEquals(77L, response.get("safetyEventId"));
        verify(notificationService).notifyPpeRetry(31L, 77L, List.of("harness"));
    }

    @Test
    void doesNotNotifyWhenRetryReasonIsNotMissingPpe() {
        PersonalCheckAiController.AnalysisResultRequest request = request(
            "retry_required", "NO_CLEAR_WORKER", List.of()
        );

        controller.applyResult(31L, request);

        verify(safetyEventRepository, never()).createAiPpeEvent(any(Long.class), anyString(), anyString());
        verify(notificationService, never()).notifyPpeRetry(any(Long.class), any(), any());
    }

    private PersonalCheckAiController.AnalysisResultRequest request(
        String status,
        String reasonCode,
        List<String> missingItems
    ) {
        return new PersonalCheckAiController.AnalysisResultRequest(
            status,
            true,
            0.98,
            false,
            null,
            "yardops-ppe-image-v1",
            "analysis result",
            reasonCode,
            missingItems
        );
    }

    private Map<String, Object> resultRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", 31L);
        row.put("status", "retry_required");
        row.put("passed", false);
        row.put("helmet_on", true);
        row.put("helmet_confidence", 0.98);
        row.put("harness_on", false);
        row.put("welding_mask_on", null);
        row.put("model_name", "yardops-ppe-image-v1");
        row.put("message", "analysis result");
        row.put("analyzed_at", null);
        return row;
    }
}
