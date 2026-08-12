package com.example.safetyai.notification.service;

import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingException;
import com.google.firebase.messaging.Message;
import com.google.firebase.messaging.MessagingErrorCode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class NotificationService {
    private static final ZoneId KOREA_TIME = ZoneId.of("Asia/Seoul");
    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

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
                       notification_type AS notificationType,
                       title,
                       message,
                       target_url AS targetUrl,
                       push_status AS pushStatus,
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
        return deliver(userId, eventId, null, "manual", null, title, body, url);
    }

    public SendResult sendConfirmedAdminAlert(
        long actorId,
        long userId,
        Long eventId,
        String title,
        String body,
        String url
    ) {
        requireActiveWorker(userId);
        return deliver(userId, eventId, actorId, "admin_confirmed", null, title, body, url);
    }

    public SendResult notifyPpeRetry(
        long ppeCheckId,
        Long eventId,
        List<String> missingItems
    ) {
        List<Long> userIds = jdbcTemplate.queryForList(
            "SELECT user_id FROM personal_ppe_checks WHERE id = ?",
            Long.class,
            ppeCheckId
        );
        if (userIds.isEmpty()) {
            return SendResult.skipped();
        }
        String missingLabels = missingItems == null ? "보호구" : missingItems.stream()
            .map(this::ppeLabel)
            .distinct()
            .reduce((left, right) -> left + ", " + right)
            .orElse("보호구");
        return deliver(
            userIds.get(0),
            eventId,
            null,
            "ppe_retry",
            "ppe-retry:" + ppeCheckId,
            "보호구 사진 재촬영 요청",
            missingLabels + " 착용이 확인되지 않았습니다. 보호구를 확인한 후 사진을 다시 제출해 주세요.",
            "/worker/check"
        );
    }

    public SendResult notifyReportStatus(
        long actorId,
        long eventId,
        String status,
        String comment
    ) {
        List<Map<String, Object>> reports = jdbcTemplate.queryForList(
            """
                SELECT reporter_id, title
                  FROM safety_events
                 WHERE id = ?
                   AND source_type = 'user_report'
                   AND reporter_id IS NOT NULL
                """,
            eventId
        );
        if (reports.isEmpty()) {
            return SendResult.skipped();
        }
        Map<String, Object> report = reports.get(0);
        long reporterId = ((Number) report.get("reporter_id")).longValue();
        String reportTitle = String.valueOf(report.get("title"));
        String detail = comment == null || comment.isBlank() ? "" : " 처리 내용: " + comment.trim();
        return deliver(
            reporterId,
            eventId,
            actorId,
            "report_status",
            "report-status:" + eventId + ":" + status,
            "안전 신고 처리 상태 안내",
            "신고하신 '" + reportTitle + "' 건이 '" + statusLabel(status) + "' 단계로 변경되었습니다." + detail,
            "/worker/report?eventId=" + eventId
        );
    }

    public void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    runSafely(action);
                }
            });
            return;
        }
        runSafely(action);
    }

    private void runSafely(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException exception) {
            log.warn("Safety notification delivery failed after the business transaction completed", exception);
        }
    }

    private SendResult deliver(
        long userId,
        Long eventId,
        Long actorId,
        String notificationType,
        String dedupeKey,
        String title,
        String body,
        String url
    ) {
        Long existingId = findByDedupeKey(dedupeKey);
        if (existingId != null) {
            return SendResult.duplicate(existingId);
        }

        String targetUrl = url == null || url.isBlank() ? "/worker/work" : url.trim();
        long notificationId;
        try {
            notificationId = JdbcInsert.insert(
                jdbcTemplate,
                """
                    INSERT INTO notifications
                        (event_id, user_id, actor_id, channel, notification_type, dedupe_key,
                         title, message, target_url, status, sent_at)
                    VALUES (?, ?, ?, 'in_app_fcm', ?, ?, ?, ?, ?, 'sent', CURRENT_TIMESTAMP(6))
                    """,
                Arrays.asList(
                    eventId,
                    userId,
                    actorId,
                    notificationType,
                    dedupeKey,
                    title,
                    body,
                    targetUrl
                )
            );
        } catch (DuplicateKeyException exception) {
            Long duplicateId = findByDedupeKey(dedupeKey);
            if (duplicateId != null) {
                return SendResult.duplicate(duplicateId);
            }
            throw exception;
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
        FirebaseMessaging firebaseMessaging = firebaseMessagingProvider.getIfAvailable();
        if (firebaseMessaging == null) {
            updatePushResult(notificationId, "not_configured", 0, 0);
            writeAudit(actorId, notificationId, userId, eventId, notificationType, "not_configured");
            return new SendResult(notificationId, true, false, 0, 0, 0, "not_configured");
        }
        if (devices.isEmpty()) {
            updatePushResult(notificationId, "no_device", 0, 0);
            writeAudit(actorId, notificationId, userId, eventId, notificationType, "no_device");
            return new SendResult(notificationId, true, false, 0, 0, 0, "no_device");
        }

        int sent = 0;
        int failed = 0;
        for (Map<String, Object> device : devices) {
            long deviceId = ((Number) device.get("id")).longValue();
            String fid = String.valueOf(device.get("fid"));
            Message message = Message.builder()
                .setFid(fid)
                .putData("notificationId", String.valueOf(notificationId))
                .putData("title", title)
                .putData("body", body)
                .putData("url", targetUrl)
                .build();
            try {
                firebaseMessaging.send(message);
                sent++;
            } catch (FirebaseMessagingException exception) {
                deactivateInvalidToken(deviceId, exception.getMessagingErrorCode());
                failed++;
            }
        }
        String pushStatus = failed == 0 ? "sent" : sent == 0 ? "failed" : "partial";
        updatePushResult(notificationId, pushStatus, sent, failed);
        writeAudit(actorId, notificationId, userId, eventId, notificationType, pushStatus);
        return new SendResult(notificationId, true, false, devices.size(), sent, failed, pushStatus);
    }

    private Long findByDedupeKey(String dedupeKey) {
        if (dedupeKey == null || dedupeKey.isBlank()) {
            return null;
        }
        List<Long> ids = jdbcTemplate.queryForList(
            "SELECT id FROM notifications WHERE dedupe_key = ? LIMIT 1",
            Long.class,
            dedupeKey
        );
        return ids.isEmpty() ? null : ids.get(0);
    }

    private void requireActiveWorker(long userId) {
        Integer count = jdbcTemplate.queryForObject(
            """
                SELECT COUNT(*)
                  FROM users u
                  JOIN user_roles ur ON ur.user_id = u.id
                  JOIN roles r ON r.id = ur.role_id
                 WHERE u.id = ?
                   AND u.status = 'active'
                   AND r.role_code = 'WORKER'
                """,
            Integer.class,
            userId
        );
        if (count == null || count == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "활성 작업자 계정만 알림 대상으로 선택할 수 있습니다.");
        }
    }

    private void updatePushResult(long notificationId, String status, int sent, int failed) {
        jdbcTemplate.update(
            """
                UPDATE notifications
                   SET push_status = ?, push_sent_count = ?, push_failed_count = ?
                 WHERE id = ?
                """,
            status,
            sent,
            failed,
            notificationId
        );
    }

    private void writeAudit(
        Long actorId,
        long notificationId,
        long userId,
        Long eventId,
        String notificationType,
        String pushStatus
    ) {
        jdbcTemplate.update(
            """
                INSERT INTO audit_logs
                    (actor_id, action, target_table, target_id, after_data)
                VALUES (?, 'NOTIFICATION_SENT', 'notifications', ?,
                        JSON_OBJECT('userId', ?, 'eventId', ?, 'notificationType', ?, 'pushStatus', ?))
                """,
            actorId,
            notificationId,
            userId,
            eventId,
            notificationType,
            pushStatus
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

    private String ppeLabel(String value) {
        return switch (value == null ? "" : value) {
            case "helmet" -> "안전모";
            case "harness" -> "안전벨트";
            case "welding_mask" -> "용접면";
            default -> "보호구";
        };
    }

    private String statusLabel(String status) {
        return switch (status) {
            case "action_requested" -> "조치 요청";
            case "completion_reported" -> "완료 확인 대기";
            case "confirmed" -> "확인";
            case "in_progress" -> "조치 중";
            case "resolved" -> "처리 완료";
            default -> "접수";
        };
    }

    public record SendResult(
        long notificationId,
        boolean inboxCreated,
        boolean duplicate,
        int requested,
        int sent,
        int failed,
        String pushStatus
    ) {
        public static SendResult skipped() {
            return new SendResult(0, false, false, 0, 0, 0, "skipped");
        }

        public static SendResult duplicate(long notificationId) {
            return new SendResult(notificationId, false, true, 0, 0, 0, "duplicate");
        }
    }
}
