package com.example.safetyai.permit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.permit.dto.WorkPermitDecisionRequest;
import com.example.safetyai.permit.dto.WorkPermitRequest;
import com.example.safetyai.permit.dto.WorkPermitSupplementRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;

@ExtendWith(MockitoExtension.class)
class WorkPermitServiceTest {
    private static final String ADMIN_LIST_SQL =
        "SELECT * FROM work_permits WHERE status <> 'deleted' ORDER BY created_at DESC";

    @Mock
    private JdbcTemplate jdbcTemplate;

    @Mock
    private AuthService authService;

    @Mock
    private PermitAnalysisService permitAnalysisService;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    @Mock
    private ObjectMapper objectMapper;

    @InjectMocks
    private WorkPermitService workPermitService;

    @Test
    void adminListWithoutStatusExcludesDeletedPermits() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        List<Map<String, Object>> permits = List.of(Map.of("id", 10L));
        when(jdbcTemplate.queryForList(ADMIN_LIST_SQL)).thenReturn(permits);

        assertThat(workPermitService.list(admin, " ")).isSameAs(permits);
        verify(jdbcTemplate).queryForList(ADMIN_LIST_SQL);
    }

    @Test
    void unauthenticatedTodayRequestIsRejectedBeforeQuerying() {
        assertThatThrownBy(() -> workPermitService.today(null))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
                assertThat(exception.getMessage()).isEqualTo("로그인이 필요합니다.");
            });
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void unassignedWorkerCannotViewPermit() {
        AuthService.AuthenticatedUser worker = user(7L, "WORKER");
        when(jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM work_permit_workers WHERE permit_id = ? AND user_id = ?",
            Integer.class,
            10L,
            7L
        )).thenReturn(0);

        assertThatThrownBy(() -> workPermitService.get(worker, 10L))
            .isInstanceOfSatisfying(ApiException.class, exception -> {
                assertThat(exception.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
                assertThat(exception.getMessage()).isEqualTo("배정된 작업허가서만 조회할 수 있습니다.");
            });
    }

    @Test
    void assignedWorkerCanViewPermit() {
        // PERMIT-002: work_permit_workers에 배정된 WORKER는 담당 허가서를 조회할 수 있어야 한다.
        AuthService.AuthenticatedUser worker = user(7L, "WORKER");
        when(jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM work_permit_workers WHERE permit_id = ? AND user_id = ?",
            Integer.class,
            10L,
            7L
        )).thenReturn(1);
        Map<String, Object> permitRow = new HashMap<>(Map.of("id", 10L, "status", "approved"));
        when(jdbcTemplate.queryForMap("SELECT * FROM work_permits WHERE id = ?", 10L))
            .thenReturn(permitRow);
        // get()이 조회하는 파일/분석결과/분석실행/SIMOPS충돌/위험점수/배정작업자 목록은
        // 이 테스트의 관심사가 아니므로 공통 빈 목록으로 응답한다.
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class))).thenReturn(List.of());

        Map<String, Object> response = workPermitService.get(worker, 10L);

        assertThat(response).containsEntry("id", 10L).containsEntry("status", "approved");
        assertThat(response)
            .containsKeys("files", "analysisResults", "analysisRun", "simopsConflicts", "riskScores", "assignedWorkers");
    }

    @Test
    void updateClearsStaleAnalysisData() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));
        when(jdbcTemplate.queryForList(
            "SELECT applicant_id, status FROM work_permits WHERE id = ?",
            10L
        )).thenReturn(List.of(Map.of("applicant_id", 2L, "status", "draft")));
        when(permitAnalysisService.queue(10L)).thenReturn(Map.of("status", "queued"));

        Map<String, Object> response = workPermitService.update(
            "Bearer token",
            10L,
            requestWithoutRelations()
        );

        assertThat(response).containsEntry("id", 10L).containsEntry("status", "pending_review");
        verify(jdbcTemplate).update("DELETE FROM risk_simulations WHERE permit_id = ?", 10L);
        verify(jdbcTemplate).update("DELETE FROM risk_scores WHERE permit_id = ?", 10L);
        verify(jdbcTemplate).update("DELETE FROM similar_accident_results WHERE permit_id = ?", 10L);
        verify(jdbcTemplate).update("DELETE FROM permit_analysis_results WHERE permit_id = ?", 10L);
    }

    @Test
    void permanentDeleteDetachesSafetyEventsAndPpeChecksBeforeDeletingPermit() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));
        when(jdbcTemplate.queryForList(
            "SELECT applicant_id, status FROM work_permits WHERE id = ?",
            10L
        )).thenReturn(List.of(Map.of("applicant_id", 2L, "status", "deleted")));
        when(jdbcTemplate.queryForObject(
            "SELECT permit_no FROM work_permits WHERE id = ?",
            String.class,
            10L
        )).thenReturn("PTW-2026-10");
        when(jdbcTemplate.update(
            argThat(sql -> sql.contains("UPDATE safety_events")),
            eq(10L),
            eq("PTW-2026-10"),
            eq(10L)
        )).thenReturn(2);

        Map<String, Object> response = workPermitService.permanentDelete("Bearer token", 10L);

        assertThat(response)
            .containsEntry("deleted", true)
            .containsEntry("id", 10L)
            .containsEntry("detachedEvents", 2);
        InOrder deletionOrder = inOrder(jdbcTemplate);
        deletionOrder.verify(jdbcTemplate).update(
            argThat(sql -> sql.contains("UPDATE safety_events") && sql.contains("detachedPermitNo")),
            eq(10L),
            eq("PTW-2026-10"),
            eq(10L)
        );
        deletionOrder.verify(jdbcTemplate)
            .update("UPDATE personal_ppe_checks SET permit_id = NULL WHERE permit_id = ?", 10L);
        deletionOrder.verify(jdbcTemplate).update("DELETE FROM work_permits WHERE id = ?", 10L);
    }

    @Test
    void decideRejectsNonAdminUser() {
        AuthService.AuthenticatedUser worker = user(7L, "WORKER");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(worker));

        assertThatThrownBy(() -> workPermitService.decide(
            "Bearer token", 10L, new WorkPermitDecisionRequest("approved", null)
        )).isInstanceOfSatisfying(ApiException.class, exception -> {
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(exception.getMessage()).isEqualTo("허가서를 승인할 권한이 없습니다.");
        });
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void decideRejectsUnknownDecisionValue() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));

        assertThatThrownBy(() -> workPermitService.decide(
            "Bearer token", 10L, new WorkPermitDecisionRequest("보류중", null)
        )).isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void decideRejectsWhenPermitAlreadyDeleted() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));
        when(jdbcTemplate.queryForList("SELECT status FROM work_permits WHERE id = ?", 10L))
            .thenReturn(List.of(Map.of("status", "deleted")));

        assertThatThrownBy(() -> workPermitService.decide(
            "Bearer token", 10L, new WorkPermitDecisionRequest("approved", null)
        )).isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void decideUpdatesStatusForValidDecision() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));
        when(jdbcTemplate.queryForList("SELECT status FROM work_permits WHERE id = ?", 10L))
            .thenReturn(List.of(Map.of("status", "pending_review")));

        Map<String, Object> response = workPermitService.decide(
            "Bearer token", 10L, new WorkPermitDecisionRequest("conditional_approved", "환기 확인 필요")
        );

        assertThat(response).containsEntry("id", 10L).containsEntry("status", "conditional_approved");
        verify(jdbcTemplate).update(anyString(), eq("conditional_approved"), eq("환기 확인 필요"), eq(1L), eq(10L));
        verify(eventPublisher).publishEvent(new FieldGuidanceRequested(10L));
    }

    @Test
    void requestSupplementRequiresAdmin() {
        AuthService.AuthenticatedUser worker = user(7L, "WORKER");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(worker));

        assertThatThrownBy(() -> workPermitService.requestSupplement(
            "Bearer token", 10L, new WorkPermitSupplementRequest("가스농도 재측정 필요")
        )).isInstanceOfSatisfying(ApiException.class, exception ->
            assertThat(exception.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));
        verifyNoInteractions(jdbcTemplate);
    }

    @Test
    void requestSupplementStoresNoteAndStatus() {
        AuthService.AuthenticatedUser admin = user(1L, "ADMIN");
        when(authService.authenticateBearer("Bearer token")).thenReturn(Optional.of(admin));
        when(jdbcTemplate.queryForList("SELECT status FROM work_permits WHERE id = ?", 10L))
            .thenReturn(List.of(Map.of("status", "pending_review")));

        Map<String, Object> response = workPermitService.requestSupplement(
            "Bearer token", 10L, new WorkPermitSupplementRequest("가스농도 재측정 필요")
        );

        assertThat(response)
            .containsEntry("id", 10L)
            .containsEntry("status", "supplement_requested")
            .containsEntry("note", "가스농도 재측정 필요");
        verify(jdbcTemplate).update(anyString(), eq("가스농도 재측정 필요"), eq(1L), eq(10L));
    }

    @Test
    void requestDefaultsRemainStable() {
        // permitNo, siteId, blockId, workType, supplementaryWork, workTitle, workContent, workerCount,
        // equipment, startTime, endTime, gpsLat, gpsLng, isHighRisk, status, fileIds, workerIds
        WorkPermitRequest request = new WorkPermitRequest(
            null, 1L, null, null, null, null, null, null,
            null, null, null, null, null, null, " ", null, null
        );

        assertThat(request.isHighRisk()).isFalse();
        assertThat(request.status()).isEqualTo("draft");
        assertThat(request.supplementaryWork()).isEmpty();
    }

    private AuthService.AuthenticatedUser user(long id, String role) {
        return new AuthService.AuthenticatedUser(id, "user" + id, "User " + id, List.of(role));
    }

    private WorkPermitRequest requestWithoutRelations() {
        // permitNo, siteId, blockId, workType, supplementaryWork, workTitle, workContent, workerCount,
        // equipment, startTime, endTime, gpsLat, gpsLng, isHighRisk, status, fileIds, workerIds
        return new WorkPermitRequest(
            "P-10", 1L, null, "welding", null, "Title", "Content", 2,
            null, null, null, null, null, false, "draft", null, null
        );
    }
}
