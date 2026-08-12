package com.example.safetyai.risk.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.dto.SafetyEventActionRequest;
import com.example.safetyai.risk.dto.WorkerCompletionReportRequest;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class SafetyEventWorkflowTest {
    @Mock SafetyEventRepository repository;
    @Mock AuthService authService;
    @Mock NotificationService notificationService;
    @Mock PermitRiskScoringService riskScoringService;
    @Mock JdbcTemplate jdbcTemplate;
    @Mock ApplicationEventPublisher eventPublisher;

    private SafetyEventService service;

    @BeforeEach
    void setUp() {
        service = new SafetyEventService(
            repository, authService, notificationService,
            riskScoringService, jdbcTemplate, eventPublisher
        );
    }

    @Test
    void managerRequestsActionFromReceivedReport() {
        when(authService.requireUserId("Bearer admin")).thenReturn(7L);
        when(repository.findWorkflowTargetForUpdate(125L))
            .thenReturn(new SafetyEventRepository.WorkflowTarget("received", "user_report"));
        when(repository.updateReportStatus(125L, 7L, "action_requested", "remove hazard"))
            .thenReturn(true);

        var result = service.updateReportStatus(
            "Bearer admin", 125L,
            new SafetyEventActionRequest("action_requested", "remove hazard", false)
        );

        assertEquals("action_requested", result.get("status"));
    }

    @Test
    void reporterSubmitsCompletionReport() {
        when(authService.requireUserId("Bearer worker")).thenReturn(11L);
        when(repository.reportWorkerCompletion(125L, 11L, "completed safely"))
            .thenReturn(true);

        var result = service.reportWorkerCompletion(
            "Bearer worker", 125L,
            new WorkerCompletionReportRequest("completed safely")
        );

        assertEquals("completion_reported", result.get("status"));
        verify(repository).reportWorkerCompletion(125L, 11L, "completed safely");
    }

    @Test
    void managerCannotResolveBeforeWorkerCompletionReport() {
        when(authService.requireUserId("Bearer admin")).thenReturn(7L);
        when(repository.findWorkflowTargetForUpdate(125L))
            .thenReturn(new SafetyEventRepository.WorkflowTarget("action_requested", "user_report"));

        assertThrows(ApiException.class, () -> service.updateReportStatus(
            "Bearer admin", 125L,
            new SafetyEventActionRequest("resolved", "final review", false)
        ));
    }
}
