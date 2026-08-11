package com.example.safetyai.risk.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class SafetyEventDeletionTest {
    @Mock
    private SafetyEventRepository repository;
    @Mock
    private AuthService authService;
    @Mock
    private NotificationService notificationService;
    @Mock
    private PermitRiskScoringService riskScoringService;
    @Mock
    private JdbcTemplate jdbcTemplate;

    private SafetyEventService service;

    @BeforeEach
    void setUp() {
        service = new SafetyEventService(repository, authService, notificationService, riskScoringService, jdbcTemplate);
    }

    @Test
    void deletesOnlyResolvedEventAndRecomputesLinkedPermitRisk() {
        when(repository.findDeletionTargetForUpdate(125L))
            .thenReturn(new SafetyEventRepository.DeletionTarget("resolved", 42L));
        when(repository.deleteResolved(125L)).thenReturn(true);

        Map<String, Object> response = service.deleteResolved(125L);

        assertEquals(true, response.get("deleted"));
        verify(repository).deleteResolved(125L);
        verify(riskScoringService).recompute(42L);
    }

    @Test
    void rejectsEventThatIsNotResolved() {
        when(repository.findDeletionTargetForUpdate(125L))
            .thenReturn(new SafetyEventRepository.DeletionTarget("in_progress", 42L));

        ApiException exception = assertThrows(ApiException.class, () -> service.deleteResolved(125L));

        assertEquals(HttpStatus.CONFLICT, exception.getStatus());
        verify(repository, never()).deleteResolved(125L);
        verify(riskScoringService, never()).recompute(42L);
    }

    @Test
    void returnsNotFoundForMissingEvent() {
        when(repository.findDeletionTargetForUpdate(999L)).thenReturn(null);

        ApiException exception = assertThrows(ApiException.class, () -> service.deleteResolved(999L));

        assertEquals(HttpStatus.NOT_FOUND, exception.getStatus());
        verify(repository, never()).deleteResolved(999L);
    }
}
