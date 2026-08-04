package com.example.safetyai.notification.controller;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @PostMapping("/devices")
    public Map<String, Object> registerDevice(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @Valid @RequestBody DeviceTokenRequest request
    ) {
        requireUser(user);
        return notificationService.registerDevice(
            user.id(),
            request.fid(),
            request.platform(),
            request.deviceName()
        );
    }

    @GetMapping("/devices/status")
    public Map<String, Object> deviceStatus(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user
    ) {
        requireUser(user);
        return notificationService.deviceStatus(user.id());
    }

    @GetMapping("/today")
    public List<Map<String, Object>> today(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user
    ) {
        requireUser(user);
        return notificationService.findToday(user.id());
    }

    @PostMapping("/{notificationId}/acknowledge")
    public Map<String, Object> acknowledge(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @PathVariable long notificationId
    ) {
        requireUser(user);
        return notificationService.acknowledge(user.id(), notificationId);
    }

    @PostMapping("/safety-events/{eventId}/test")
    public NotificationService.SendResult sendSafetyEventTest(
        @AuthenticationPrincipal AuthService.AuthenticatedUser user,
        @PathVariable long eventId
    ) {
        requireUser(user);
        return notificationService.sendSafetyEventTest(user.id(), eventId);
    }

    private void requireUser(AuthService.AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
    }

    public record DeviceTokenRequest(
        @NotBlank @Size(max = 128) String fid,
        @Size(max = 30) String platform,
        @Size(max = 160) String deviceName
    ) {
    }
}
