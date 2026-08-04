package com.example.safetyai.notification.controller;

import com.example.safetyai.notification.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
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

    public record TestNotificationRequest(
        @NotNull @Positive Long userId,
        @Positive Long eventId,
        @NotBlank @Size(max = 160) String title,
        @NotBlank @Size(max = 1000) String body,
        @Size(max = 500) String url
    ) {
    }
}
