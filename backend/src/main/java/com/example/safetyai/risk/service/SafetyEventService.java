package com.example.safetyai.risk.service;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.risk.dto.CreateSafetyEventRequest;
import com.example.safetyai.risk.dto.SafetyEventActionRequest;
import com.example.safetyai.risk.dto.SafetyEventAnalysisRequest;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import java.time.Year;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SafetyEventService {
    private static final Map<String, String> EVENT_TYPES = eventTypes();

    private final SafetyEventRepository safetyEventRepository;
    private final AuthService authService;

    public SafetyEventService(SafetyEventRepository safetyEventRepository, AuthService authService) {
        this.safetyEventRepository = safetyEventRepository;
        this.authService = authService;
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

    public List<Map<String, Object>> getWorkerReports(String status) {
        return safetyEventRepository.findWorkerReports(status);
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
            throw new ApiException(HttpStatus.NOT_FOUND, "작업자 위험 신고를 찾을 수 없습니다.");
        }
        return Map.of("id", eventId, "analysisStatus", "completed");
    }

    @Transactional
    public Map<String, Object> updateReportStatus(
        String authorization,
        long eventId,
        SafetyEventActionRequest request
    ) {
        long actorId = authService.requireUserId(authorization);
        boolean updated = safetyEventRepository.updateReportStatus(
            eventId,
            actorId,
            request.status(),
            request.comment() == null ? "" : request.comment().trim()
        );
        if (!updated) {
            throw new ApiException(HttpStatus.NOT_FOUND, "작업자 위험 신고를 찾을 수 없습니다.");
        }
        return Map.of("id", eventId, "status", request.status());
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
