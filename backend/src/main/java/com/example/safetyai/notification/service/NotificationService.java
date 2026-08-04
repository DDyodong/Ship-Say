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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class NotificationService {
    private static final ZoneId KOREA_TIME = ZoneId.of("Asia/Seoul");
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

    public List<Map<String, Object>> findToday(long userId) {
        LocalDateTime startUtc = LocalDate.now(KOREA_TIME)
            .atStartOfDay(KOREA_TIME)
            .withZoneSameInstant(ZoneOffset.UTC)
            .toLocalDateTime();
        return jdbcTemplate.queryForList(
            """
                SELECT id,
                       event_id AS eventId,
                       title,
                       message,
                       sent_at AS sentAt,
                       acknowledged_at AS acknowledgedAt,
                       created_at AS createdAt
                  FROM notifications
                 WHERE user_id = ?
                   AND status = 'sent'
                   AND created_at >= ?
                 ORDER BY created_at DESC, id DESC
                """,
            userId,
            startUtc
        );
    }

    public Map<String, Object> acknowledge(long userId, long notificationId) {
        int updated = jdbcTemplate.update(
            """
                UPDATE notifications
                   SET acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP(6))
                 WHERE id = ? AND user_id = ? AND status = 'sent'
                """,
            notificationId,
            userId
        );
        if (updated == 0) {
            throw new ApiException(HttpStatus.NOT_FOUND, "확인할 알림을 찾을 수 없습니다.");
        }
        return Map.of("id", notificationId, "acknowledged", true);
    }

    public SendResult sendSafetyEventTest(long userId, long eventId) {
        List<Map<String, Object>> events = jdbcTemplate.queryForList(
            """
                SELECT se.title,
                       CONCAT('SR-', DATE_FORMAT(se.event_time, '%Y'), '-', LPAD(se.id, 6, '0')) AS report_no
                  FROM safety_events se
                 WHERE se.id = ?
                   AND (se.reporter_id = ? OR se.target_user_id = ?)
                   AND se.source_type IN ('user_report', 'ai_ppe', 'system_alert')
                """,
            eventId,
            userId,
            userId
        );
        if (events.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "본인의 안전 이벤트를 찾을 수 없습니다.");
        }
        Map<String, Object> event = events.get(0);
        String reportNo = String.valueOf(event.get("report_no"));
        String eventTitle = String.valueOf(event.get("title"));
        return sendToUser(
            userId,
            eventId,
            "안전 이벤트 알림",
            reportNo + " · " + eventTitle,
            "/worker/work"
        );
    }

    public SendResult sendToUser(
        long userId,
        Long eventId,
        String title,
        String body,
        String url
    ) {
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
            long notificationId = createNotificationLog(eventId, userId, title, body);
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

    private long createNotificationLog(Long eventId, long userId, String title, String body) {
        return JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO notifications (event_id, user_id, channel, title, message, status)
                VALUES (?, ?, 'fcm', ?, ?, 'pending')
                """,
            Arrays.asList(eventId, userId, title, body)
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
