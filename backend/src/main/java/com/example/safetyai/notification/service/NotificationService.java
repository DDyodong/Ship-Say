package com.example.safetyai.notification.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private final JdbcTemplate jdbcTemplate;
    private final ObjectProvider<FirebaseMessaging> firebaseMessagingProvider;

    public NotificationService(
        JdbcTemplate jdbcTemplate,
        ObjectProvider<FirebaseMessaging> firebaseMessagingProvider
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.firebaseMessagingProvider = firebaseMessagingProvider;
    }

    public Map<String, Object> registerDevice(
        long userId,
        String fid,
        String platform,
        String deviceName
    ) {
        String normalizedPlatform = platform == null || platform.isBlank() ? "web" : platform.trim();
        String normalizedDeviceName = deviceName == null || deviceName.isBlank() ? null : deviceName.trim();
        jdbcTemplate.update(
            """
                INSERT INTO fcm_installations
                    (user_id, fid, platform, device_name, active, last_seen_at)
                VALUES (?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP(6))
                ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id),
                    platform = VALUES(platform),
                    device_name = VALUES(device_name),
                    active = TRUE,
                    last_seen_at = CURRENT_TIMESTAMP(6),
                    updated_at = CURRENT_TIMESTAMP(6)
                """,
            userId,
            fid.trim(),
            normalizedPlatform,
            normalizedDeviceName
        );

        Long id = jdbcTemplate.queryForObject(
            "SELECT id FROM fcm_installations WHERE fid = ?",
            Long.class,
            fid.trim()
        );
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", id);
        response.put("platform", normalizedPlatform);
        response.put("active", true);
        return response;
    }

    public Map<String, Object> deviceStatus(long userId) {
        Integer activeCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fcm_installations WHERE user_id = ? AND active = TRUE",
            Integer.class,
            userId
        );
        return Map.of("activeDeviceCount", activeCount == null ? 0 : activeCount);
    }

    public SendResult sendToUser(long userId, String title, String body, String url) {
        FirebaseMessaging firebaseMessaging = firebaseMessagingProvider.getIfAvailable();
        if (firebaseMessaging == null) {
            throw new ApiException(
                HttpStatus.SERVICE_UNAVAILABLE,
                "Firebase 발송 설정이 활성화되지 않았습니다."
            );
        }

        List<Map<String, Object>> devices = jdbcTemplate.queryForList(
            """
                SELECT id, fid
                  FROM fcm_installations
                 WHERE user_id = ? AND active = TRUE
                 ORDER BY last_seen_at DESC
                """,
            userId
        );
        if (devices.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "대상 사용자의 등록된 알림 기기가 없습니다.");
        }

        int sent = 0;
        int failed = 0;
        String targetUrl = url == null || url.isBlank() ? "/worker/work" : url.trim();
        for (Map<String, Object> device : devices) {
            long deviceId = ((Number) device.get("id")).longValue();
            String fid = String.valueOf(device.get("fid"));
            long notificationId = createNotificationLog(userId, title, body);
            Message message = Message.builder()
                .setFid(fid)
                .putData("title", title)
                .putData("body", body)
                .putData("url", targetUrl)
                .build();
            try {
                firebaseMessaging.send(message);
                jdbcTemplate.update(
                    "UPDATE notifications SET status = 'sent', sent_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
                    notificationId
                );
                sent++;
            } catch (FirebaseMessagingException exception) {
                jdbcTemplate.update(
                    "UPDATE notifications SET status = 'failed' WHERE id = ?",
                    notificationId
                );
                deactivateInvalidToken(deviceId, exception.getMessagingErrorCode());
                failed++;
            }
        }
        return new SendResult(devices.size(), sent, failed);
    }

    private long createNotificationLog(long userId, String title, String body) {
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO notifications (user_id, channel, title, message, status)
                VALUES (?, 'fcm', ?, ?, 'pending')
                """,
            Arrays.asList(userId, title, body)
        );
    }

    private void deactivateInvalidToken(long deviceId, MessagingErrorCode errorCode) {
        if (errorCode == MessagingErrorCode.UNREGISTERED || errorCode == MessagingErrorCode.INVALID_ARGUMENT) {
            jdbcTemplate.update(
                "UPDATE fcm_installations SET active = FALSE, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
                deviceId
            );
        }
    }

    public record SendResult(int requested, int sent, int failed) {
    }
}
