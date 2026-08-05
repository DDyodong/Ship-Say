package com.example.safetyai.notification.controller;

import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AdminNotificationControllerTest {
    @Mock
    private NotificationService notificationService;

    private AdminNotificationController controller;
    private AuthService.AuthenticatedUser admin;

    @BeforeEach
    void setUp() {
        controller = new AdminNotificationController(notificationService);
        admin = new AuthService.AuthenticatedUser(7L, "admin", "관리자", List.of("ADMIN"));
    }

    @Test
    void rejectsDirectSendWithoutFinalConfirmation() {
        AdminNotificationController.ConfirmedNotificationRequest request = request(false);

        assertThrows(ApiException.class, () -> controller.sendConfirmed(admin, request));
        verifyNoInteractions(notificationService);
    }

    @Test
    void delegatesConfirmedDirectSendWithAuthenticatedActor() {
        AdminNotificationController.ConfirmedNotificationRequest request = request(true);
        NotificationService.SendResult expected = new NotificationService.SendResult(
            91L, true, false, 1, 1, 0, "sent"
        );
        when(notificationService.sendConfirmedAdminAlert(
            7L, 42L, 125L, "안전 관리자 알림", "작업을 중지해 주세요.", "/worker/work"
        )).thenReturn(expected);

        NotificationService.SendResult actual = controller.sendConfirmed(admin, request);

        assertSame(expected, actual);
        verify(notificationService).sendConfirmedAdminAlert(
            7L, 42L, 125L, "안전 관리자 알림", "작업을 중지해 주세요.", "/worker/work"
        );
    }

    private AdminNotificationController.ConfirmedNotificationRequest request(boolean confirmed) {
        return new AdminNotificationController.ConfirmedNotificationRequest(
            42L,
            125L,
            "안전 관리자 알림",
            "작업을 중지해 주세요.",
            "/worker/work",
            confirmed
        );
    }
}
