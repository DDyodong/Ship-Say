package com.example.safetyai.permit.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.permit.dto.WorkPermitRequest;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
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
    void requestDefaultsRemainStable() {
        WorkPermitRequest request = new WorkPermitRequest(
            null, 1L, null, null, null, null, null, null,
            null, null, null, null, null, " ", null, null
        );

        assertThat(request.isHighRisk()).isFalse();
        assertThat(request.status()).isEqualTo("draft");
    }

    private AuthService.AuthenticatedUser user(long id, String role) {
        return new AuthService.AuthenticatedUser(id, "user" + id, "User " + id, List.of(role));
    }

    private WorkPermitRequest requestWithoutRelations() {
        return new WorkPermitRequest(
            "P-10", 1L, null, "welding", "Title", "Content", 2, null,
            null, null, null, null, false, "draft", null, null
        );
    }
}
