package com.example.safetyai.risk.service;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.notification.service.NotificationService;
import com.example.safetyai.risk.dto.CreateSafetyEventRequest;
import com.example.safetyai.risk.dto.SafetyEventActionRequest;
import com.example.safetyai.risk.dto.SafetyEventAnalysisRequest;
import com.example.safetyai.risk.dto.WorkerCompletionReportRequest;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import java.time.Year;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SafetyEventService {
    private static final Logger log = LoggerFactory.getLogger(SafetyEventService.class);
    private static final Map<String, String> EVENT_TYPES = eventTypes();

    private final SafetyEventRepository safetyEventRepository;
    private final AuthService authService;
    private final NotificationService notificationService;
    private final PermitRiskScoringService riskScoringService;
    private final JdbcTemplate jdbcTemplate;
    private final ApplicationEventPublisher eventPublisher;

    public SafetyEventService(
        SafetyEventRepository safetyEventRepository,
        AuthService authService,
        NotificationService notificationService,
        PermitRiskScoringService riskScoringService,
        JdbcTemplate jdbcTemplate,
        ApplicationEventPublisher eventPublisher
    ) {
        this.safetyEventRepository = safetyEventRepository;
        this.authService = authService;
        this.notificationService = notificationService;
        this.riskScoringService = riskScoringService;
        this.jdbcTemplate = jdbcTemplate;
        this.eventPublisher = eventPublisher;
    }

    @Transactional
    public Map<String, Object> createUserReport(String authorization, CreateSafetyEventRequest request) {
        long reporterId = authService.requireUserId(authorization);
        String eventType = request.eventType().trim().toUpperCase();
        String eventName = EVENT_TYPES.get(eventType);
        if (eventName == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "지원하지 않는 위험 유형입니다.");
        }
        if (!safetyEventRepository.isOwnedSafetyReportFile(request.fileId(), reporterId)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "본인이 업로드한 위험 신고 사진을 선택해 주세요.");
        }

        long id = safetyEventRepository.createUserReport(
            reporterId,
            eventType,
            request.fileId(),
            eventName + " 신고",
            request.description().trim()
        );
        eventPublisher.publishEvent(new SafetyReportAnalysisRequested(id));
        String reportNo = "SR-" + Year.now().getValue() + "-" + String.format("%06d", id);
        return Map.of(
            "id", id,
            "reportNo", reportNo,
            "status", "received",
            "message", "위험 신고가 접수되었습니다."
        );
    }

    public List<Map<String, Object>> getMyReports(String authorization) {
        long reporterId = authService.requireUserId(authorization);
        return safetyEventRepository.findMyReports(reporterId);
    }

    public List<Map<String, Object>> getAll(String status) {
        return safetyEventRepository.findAll(status);
    }

    public List<Map<String, Object>> getWorkerReports(String status, String sourceType) {
        return safetyEventRepository.findWorkerReports(status, sourceType);
    }

    public List<Map<String, Object>> getActionHistory(long eventId) {
        return safetyEventRepository.findActionHistory(eventId);
    }

    public Map<String, Object> requestAnalysis(long eventId) {
        safetyEventRepository.resetAnalysis(eventId);
        eventPublisher.publishEvent(new SafetyReportAnalysisRequested(eventId));
        return Map.of("id", eventId, "analysisStatus", "pending");
    }

    @Transactional
    public Map<String, Object> saveAiAnalysis(long eventId, SafetyEventAnalysisRequest request) {
        boolean updated = safetyEventRepository.saveAiAnalysis(
            eventId,
            request.severity(),
            request.estimatedLocation().trim(),
            request.riskScore(),
            request.summary().trim(),
            request.recommendedAction().trim(),
            request.confidence(),
            request.modelVersion().trim()
        );
        if (!updated) {
            throw new ApiException(HttpStatus.NOT_FOUND, "안전 이벤트를 찾을 수 없습니다.");
        }
        recomputeRiskScoreSafely(eventId);
        return Map.of("id", eventId, "analysisStatus", "completed");
    }

    @Transactional
    public Map<String, Object> updateReportStatus(
        String authorization,
        long eventId,
        SafetyEventActionRequest request
    ) {
        long actorId = authService.requireUserId(authorization);
        SafetyEventRepository.WorkflowTarget target = safetyEventRepository.findWorkflowTargetForUpdate(eventId);
        if (target == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "안전 이벤트를 찾을 수 없습니다.");
        }
        boolean userReport = "user_report".equals(target.sourceType());
        boolean validTransition = userReport
            ? ("action_requested".equals(request.status())
                ? List.of("received", "confirmed", "in_progress").contains(target.status())
                : "resolved".equals(request.status()) && "completion_reported".equals(target.status()))
            : isLegacyAdminTransition(target.status(), request.status());
        if (!validTransition) {
            throw new ApiException(HttpStatus.CONFLICT, "현재 처리 단계에서는 해당 상태로 변경할 수 없습니다.");
        }
        boolean updated = safetyEventRepository.updateReportStatus(
            eventId,
            actorId,
            request.status(),
            request.comment() == null ? "" : request.comment().trim()
        );
        if (!updated) {
            throw new ApiException(HttpStatus.NOT_FOUND, "안전 이벤트를 찾을 수 없습니다.");
        }
        recomputeRiskScoreSafely(eventId);
        boolean notificationScheduled = Boolean.TRUE.equals(request.notifyReporter());
        if (notificationScheduled) {
            String comment = request.comment() == null ? "" : request.comment().trim();
            notificationService.afterCommit(
                () -> notificationService.notifyReportStatus(
                    actorId,
                    eventId,
                    request.status(),
                    comment
                )
            );
        }
        return Map.of(
            "id", eventId,
            "status", request.status(),
            "notificationScheduled", notificationScheduled
        );
    }

    @Transactional
    public Map<String, Object> reportWorkerCompletion(
        String authorization,
        long eventId,
        WorkerCompletionReportRequest request
    ) {
        long reporterId = authService.requireUserId(authorization);
        boolean updated = safetyEventRepository.reportWorkerCompletion(
            eventId,
            reporterId,
            request.comment().trim()
        );
        if (!updated) {
            throw new ApiException(
                HttpStatus.CONFLICT,
                "본인에게 조치 요청된 신고만 완료 보고할 수 있습니다."
            );
        }
        recomputeRiskScoreSafely(eventId);
        return Map.of(
            "id", eventId,
            "status", "completion_reported"
        );
    }

    private boolean isLegacyAdminTransition(String currentStatus, String requestedStatus) {
        List<String> steps = List.of("received", "confirmed", "in_progress", "resolved");
        int currentIndex = steps.indexOf(currentStatus);
        return currentIndex >= 0
            && currentIndex < steps.size() - 1
            && steps.get(currentIndex + 1).equals(requestedStatus);
    }

    @Transactional
    public Map<String, Object> deleteResolved(long eventId) {
        SafetyEventRepository.DeletionTarget target = safetyEventRepository.findDeletionTargetForUpdate(eventId);
        if (target == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "안전 이벤트를 찾을 수 없습니다.");
        }
        if (!"resolved".equals(target.status())) {
            throw new ApiException(HttpStatus.CONFLICT, "처리 완료된 안전 이벤트만 삭제할 수 있습니다.");
        }
        if (!safetyEventRepository.deleteResolved(eventId)) {
            throw new ApiException(HttpStatus.CONFLICT, "안전 이벤트 상태가 변경되어 삭제할 수 없습니다.");
        }
        recomputePermitRiskSafely(target.permitId(), eventId);
        return Map.of("id", eventId, "deleted", true);
    }

    // 이벤트에 연결된 허가서가 있을 때만 재계산한다(permit_id가 없는 이벤트도 있음).
    // 재계산 실패로 이벤트 처리 자체가 실패해서는 안 되므로 예외를 삼킨다.
    private void recomputeRiskScoreSafely(long eventId) {
        try {
            Long permitId = jdbcTemplate.queryForObject(
                "SELECT permit_id FROM safety_events WHERE id = ?",
                Long.class,
                eventId
            );
            if (permitId != null) {
                riskScoringService.recompute(permitId);
            }
        } catch (EmptyResultDataAccessException exception) {
            // 조회 시점에 이미 삭제된 경우 — 무시
        } catch (Exception exception) {
            log.warn("Risk score recompute failed after safety event {}: {}", eventId, exception.getMessage());
        }
    }

    private void recomputePermitRiskSafely(Long permitId, long eventId) {
        if (permitId == null) {
            return;
        }
        try {
            riskScoringService.recompute(permitId);
        } catch (Exception exception) {
            log.warn("Risk score recompute failed after deleting safety event {}: {}", eventId, exception.getMessage());
        }
    }

    private static Map<String, String> eventTypes() {
        Map<String, String> types = new LinkedHashMap<>();
        types.put("FALL_HEIGHT", "추락·고소작업 위험");
        types.put("PPE_MISSING", "보호구 미착용");
        types.put("FIRE_EXPLOSION", "화재·폭발 위험");
        types.put("EQUIPMENT_FAILURE", "장비·설비 이상");
        types.put("COLLISION_PINCH", "충돌·협착 위험");
        types.put("FALLING_OBJECT_LIFTING", "낙하물·중량물 위험");
        types.put("ELECTRICAL", "감전·전기 위험");
        types.put("ASPHYXIATION_GAS", "질식·유해가스 위험");
        types.put("HAZARDOUS_LEAK", "위험물·화학물질 누출");
        types.put("DANGER_ZONE_ACCESS", "위험구역 접근");
        types.put("HOUSEKEEPING", "통로·정리정돈 불량");
        types.put("OTHER", "기타");
        return Map.copyOf(types);
    }
}
