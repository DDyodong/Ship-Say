package com.example.safetyai.risk.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.dto.SafetyEventActionRequest;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SafetyEventNotificationTest {
    @Mock
    private SafetyEventRepository repository;
    @Mock
    private AuthService authService;
    @Mock
    private NotificationService notificationService;

    private SafetyEventService service;

    @BeforeEach
    void setUp() {
        service = new SafetyEventService(repository, authService, notificationService);
        when(authService.requireUserId("Bearer admin")).thenReturn(7L);
        when(repository.updateReportStatus(125L, 7L, "resolved", "난간 보강 완료"))
            .thenReturn(true);
    }

    @Test
    void schedulesReporterNotificationOnlyAfterConfirmedStatusSave() {
        SafetyEventActionRequest request = new SafetyEventActionRequest(
            "resolved", "난간 보강 완료", true
        );

        Map<String, Object> response = service.updateReportStatus("Bearer admin", 125L, request);

        assertEquals(true, response.get("notificationScheduled"));
        ArgumentCaptor<Runnable> action = ArgumentCaptor.forClass(Runnable.class);
        verify(notificationService).afterCommit(action.capture());
        action.getValue().run();
        verify(notificationService).notifyReportStatus(7L, 125L, "resolved", "난간 보강 완료");
    }

    @Test
    void doesNotScheduleReporterNotificationWhenManagerUnchecksIt() {
        SafetyEventActionRequest request = new SafetyEventActionRequest(
            "resolved", "난간 보강 완료", false
        );

        Map<String, Object> response = service.updateReportStatus("Bearer admin", 125L, request);

        assertEquals(false, response.get("notificationScheduled"));
        verify(notificationService, never()).afterCommit(any(Runnable.class));
        verify(notificationService, never()).notifyReportStatus(any(Long.class), any(Long.class), any(), any());
    }
}
