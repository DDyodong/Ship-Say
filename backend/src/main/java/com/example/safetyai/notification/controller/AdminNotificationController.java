package com.example.safetyai.notification.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/notifications")
public class AdminNotificationController {
    private final NotificationService notificationService;

    public AdminNotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping("/test")
    public NotificationService.SendResult sendTest(@Valid @RequestBody TestNotificationRequest request) {
        return notificationService.sendToUser(
            request.userId(),
            request.eventId(),
            request.title(),
            request.body(),
            request.url()
        );
    }

    @PostMapping("/send")
    public NotificationService.SendResult sendConfirmed(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @Valid @RequestBody ConfirmedNotificationRequest request
    ) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
        if (!Boolean.TRUE.equals(request.confirmed())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "발송 대상과 내용을 최종 확인해 주세요.");
        }
        return notificationService.sendConfirmedAdminAlert(
            user.id(),
            request.userId(),
            request.eventId(),
            request.title(),
            request.body(),
            request.url()
        );
    }

    public record TestNotificationRequest(
        @NotNull @Positive Long userId,
        @Positive Long eventId,
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 1000) String body,
        @Size(max = 500) String url
    ) {
    }

    public record ConfirmedNotificationRequest(
        @NotNull @Positive Long userId,
        @Positive Long eventId,
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 1000) String body,
        @Size(max = 500) String url,
        @NotNull Boolean confirmed
    ) {
    }
}
