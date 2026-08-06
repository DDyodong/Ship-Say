package com.example.safetyai.permit.service;

import com.example.safetyai.auth.service.AuthService;
import com.example.safetyai.common.exception.ApiException;
import com.example.safetyai.common.util.JdbcInsert;
import com.example.safetyai.permit.dto.WorkPermitRequest;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WorkPermitService {
    private final JdbcTemplate jdbcTemplate;
    private final AuthService authService;
    private final PermitAnalysisService permitAnalysisService;

    public WorkPermitService(
        JdbcTemplate jdbcTemplate,
        AuthService authService,
        PermitAnalysisService permitAnalysisService
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.authService = authService;
        this.permitAnalysisService = permitAnalysisService;
    }

    public List<Map<String, Object>> list(AuthService.AuthenticatedUser user, String status) {
        requireAuthenticated(user);
        boolean hasStatus = status != null && !status.isBlank();
        if (isAdmin(user)) {
            if (!hasStatus) {
                return jdbcTemplate.queryForList(
                    "SELECT * FROM work_permits WHERE status <> 'deleted' ORDER BY created_at DESC"
                );
            }
            return jdbcTemplate.queryForList(
                "SELECT * FROM work_permits WHERE status = ? ORDER BY created_at DESC",
                status
            );
        }
        if (!hasStatus) {
            return jdbcTemplate.queryForList(
                """
                    SELECT wp.*
                      FROM work_permits wp
                      JOIN work_permit_workers wpw ON wpw.permit_id = wp.id
                     WHERE wpw.user_id = ?
                       AND wp.status <> 'deleted'
                     ORDER BY wp.created_at DESC
                    """,
                user.id()
            );
        }
        return jdbcTemplate.queryForList(
            """
                SELECT wp.*
                  FROM work_permits wp
                  JOIN work_permit_workers wpw ON wpw.permit_id = wp.id
                 WHERE wpw.user_id = ?
                   AND wp.status = ?
                 ORDER BY wp.created_at DESC
                """,
            user.id(),
            status
        );
    }

    public Map<String, Object> today(AuthService.AuthenticatedUser user) {
        requireAuthenticated(user);
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT wp.*, s.name AS site_name, b.block_code,
                       (SELECT par.recommended_conditions
                          FROM permit_analysis_results par
                         WHERE par.permit_id = wp.id
                         ORDER BY par.created_at DESC
                         LIMIT 1) AS recommended_conditions
                  FROM work_permits wp
                  JOIN sites s ON s.id = wp.site_id
             LEFT JOIN blocks b ON b.id = wp.block_id
                 WHERE wp.status NOT IN ('rejected', 'deleted')
                   AND (
                       ? = 1
                       OR EXISTS (
                           SELECT 1
                             FROM work_permit_workers wpw
                            WHERE wpw.permit_id = wp.id
                              AND wpw.user_id = ?
                       )
                   )
                   AND (
                       DATE(wp.created_at) = CURRENT_DATE
                       OR (wp.start_time < CURRENT_DATE + INTERVAL 1 DAY
                           AND COALESCE(wp.end_time, wp.start_time) >= CURRENT_DATE)
                   )
                 ORDER BY CASE WHEN wp.start_time IS NULL THEN 1 ELSE 0 END,
                          wp.start_time DESC,
                          wp.created_at DESC
                 LIMIT 1
                """,
            isAdmin(user) ? 1 : 0,
            user.id()
        );
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    public Map<String, Object> get(AuthService.AuthenticatedUser user, long id) {
        requireCanView(user, id);
        Map<String, Object> permit = jdbcTemplate.queryForMap(
            "SELECT * FROM work_permits WHERE id = ?",
            id
        );
        permit.put("files", jdbcTemplate.queryForList(
            """
                SELECT f.id, f.original_name, f.file_type, f.file_size, pf.purpose
                FROM work_permit_files pf
                JOIN files f ON f.id = pf.file_id
                WHERE pf.permit_id = ?
                """,
            id
        ));
        permit.put("analysisResults", jdbcTemplate.queryForList(
            """
                SELECT *
                  FROM permit_analysis_results
                 WHERE permit_id = ?
                   AND analysis_type = 'permit_rule_simops'
                 ORDER BY created_at DESC
                """,
            id
        ));
        List<Map<String, Object>> analysisRuns = jdbcTemplate.queryForList(
            """
                SELECT id, model_name, model_version, status, started_at, finished_at, error_message
                  FROM model_runs
                 WHERE input_type = 'permit_analysis'
                   AND input_ref_id = ?
                 ORDER BY id DESC
                 LIMIT 1
                """,
            id
        );
        permit.put("analysisRun", analysisRuns.isEmpty() ? Map.of() : analysisRuns.get(0));
        permit.put("simopsConflicts", jdbcTemplate.queryForList(
            """
                SELECT psc.id, psc.rule_code, psc.risk, psc.reason, psc.legal_ref,
                       psc.work_types, psc.zone_relation, psc.detected_at,
                       CASE WHEN psc.permit_a_id = ? THEN other_b.id ELSE other_a.id END AS counterpart_id,
                       CASE WHEN psc.permit_a_id = ? THEN other_b.permit_no ELSE other_a.permit_no END AS counterpart_permit_no,
                       CASE WHEN psc.permit_a_id = ? THEN other_b.work_title ELSE other_a.work_title END AS counterpart_work_title
                  FROM permit_simops_conflicts psc
                  JOIN work_permits other_a ON other_a.id = psc.permit_a_id
                  JOIN work_permits other_b ON other_b.id = psc.permit_b_id
                 WHERE psc.permit_a_id = ? OR psc.permit_b_id = ?
                 ORDER BY CASE psc.risk WHEN '반려' THEN 0 WHEN '보류' THEN 1 ELSE 2 END,
                          psc.detected_at DESC
                """,
            id,
            id,
            id,
            id,
            id
        ));
        permit.put("riskScores", jdbcTemplate.queryForList(
            "SELECT * FROM risk_scores WHERE permit_id = ? ORDER BY created_at DESC",
            id
        ));
        permit.put("assignedWorkers", jdbcTemplate.queryForList(
            """
                SELECT u.id, u.username, u.name, u.employee_no
                  FROM work_permit_workers wpw
                  JOIN users u ON u.id = wpw.user_id
                 WHERE wpw.permit_id = ?
                 ORDER BY u.name, u.id
                """,
            id
        ));
        return permit;
    }

    @Transactional
    public Map<String, Object> create(String authorization, WorkPermitRequest request) {
        long userId = authService.requireUserId(authorization);
        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO work_permits
                (permit_no, site_id, block_id, applicant_id, work_type, work_title, work_content,
                 worker_count, equipment, start_time, end_time, gps_lat, gps_lng, is_high_risk, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
            Arrays.asList(
                request.permitNo(),
                request.siteId(),
                request.blockId(),
                userId,
                request.workType(),
                request.workTitle(),
                request.workContent(),
                request.workerCount(),
                request.equipment(),
                request.startTime(),
                request.endTime(),
                request.gpsLat(),
                request.gpsLng(),
                request.isHighRisk(),
                request.status()
            )
        );
        linkFiles(id, userId, request.fileIds());
        replaceAssignedWorkers(id, request.workerIds());
        Map<String, Object> analysis = permitAnalysisService.queue(id);
        return Map.of("id", id, "analysis", analysis);
    }

    public List<Map<String, Object>> trash() {
        return jdbcTemplate.queryForList(
            "SELECT * FROM work_permits WHERE status = 'deleted' ORDER BY updated_at DESC"
        );
    }

    @Transactional
    public Map<String, Object> update(String authorization, long id, WorkPermitRequest request) {
        AuthService.AuthenticatedUser user = authenticate(authorization);
        requireAuthorizedPermitUser(
            user,
            id,
            false,
            "수정할 허가서를 찾을 수 없습니다.",
            "허가서를 수정할 권한이 없습니다."
        );

        jdbcTemplate.update(
            """
                UPDATE work_permits
                   SET permit_no = ?, site_id = ?, block_id = ?, work_type = ?, work_title = ?,
                       work_content = ?, worker_count = ?, equipment = ?, start_time = ?, end_time = ?,
                       gps_lat = ?, gps_lng = ?, is_high_risk = ?, status = 'pending_review',
                       updated_at = CURRENT_TIMESTAMP(6)
                 WHERE id = ?
                """,
            request.permitNo(),
            request.siteId(),
            request.blockId(),
            request.workType(),
            request.workTitle(),
            request.workContent(),
            request.workerCount(),
            request.equipment(),
            request.startTime(),
            request.endTime(),
            request.gpsLat(),
            request.gpsLng(),
            request.isHighRisk(),
            id
        );

        if (request.fileIds() != null) {
            replaceFiles(id, user.id(), request.fileIds());
        }
        if (request.workerIds() != null) {
            replaceAssignedWorkers(id, request.workerIds());
        }
        clearAnalysisData(id);
        Map<String, Object> analysis = permitAnalysisService.queue(id);
        return Map.of("id", id, "status", "pending_review", "analysis", analysis);
    }

    @Transactional
    public Map<String, Object> delete(String authorization, long id) {
        requireAuthorizedPermitUser(authenticate(authorization), id, false);
        jdbcTemplate.update(
            "UPDATE work_permits SET status = 'deleted', updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
            id
        );
        jdbcTemplate.update(
            "DELETE FROM permit_simops_conflicts WHERE permit_a_id = ? OR permit_b_id = ?",
            id,
            id
        );
        return Map.of("id", id, "status", "deleted");
    }

    @Transactional
    public Map<String, Object> restore(String authorization, long id) {
        requireAuthorizedPermitUser(authenticate(authorization), id, true);
        jdbcTemplate.update(
            "UPDATE work_permits SET status = 'pending_review', updated_at = CURRENT_TIMESTAMP(6) WHERE id = ?",
            id
        );
        Map<String, Object> analysis = permitAnalysisService.queue(id);
        return Map.of("id", id, "status", "pending_review", "analysis", analysis);
    }

    public Map<String, Object> requestAnalysis(long id) {
        return permitAnalysisService.queue(id);
    }

    @Transactional
    public Map<String, Object> permanentDelete(String authorization, long id) {
        requireAuthorizedPermitUser(authenticate(authorization), id, true);
        Integer linkedEvents = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM safety_events WHERE permit_id = ?",
            Integer.class,
            id
        );
        if (linkedEvents != null && linkedEvents > 0) {
            throw new ApiException(HttpStatus.CONFLICT, "안전 이벤트에 연결된 허가서는 영구 삭제할 수 없습니다.");
        }

        clearAnalysisData(id);
        jdbcTemplate.update("DELETE FROM work_permits WHERE id = ?", id);
        return Map.of("deleted", true, "id", id);
    }

    private AuthService.AuthenticatedUser authenticate(String authorization) {
        return authService.authenticateBearer(authorization)
            .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
    }

    private void requireAuthorizedPermitUser(
        AuthService.AuthenticatedUser user,
        long id,
        boolean mustBeDeleted
    ) {
        requireAuthorizedPermitUser(
            user,
            id,
            mustBeDeleted,
            "허가서를 찾을 수 없습니다.",
            "허가서를 관리할 권한이 없습니다."
        );
    }

    private void requireAuthorizedPermitUser(
        AuthService.AuthenticatedUser user,
        long id,
        boolean mustBeDeleted,
        String notFoundMessage,
        String forbiddenMessage
    ) {
        List<Map<String, Object>> permits = jdbcTemplate.queryForList(
            "SELECT applicant_id, status FROM work_permits WHERE id = ?",
            id
        );
        if (permits.isEmpty()) {
            throw new ApiException(HttpStatus.NOT_FOUND, notFoundMessage);
        }

        Map<String, Object> permit = permits.get(0);
        long applicantId = ((Number) permit.get("applicant_id")).longValue();
        if (applicantId != user.id() && !isAdmin(user)) {
            throw new ApiException(HttpStatus.FORBIDDEN, forbiddenMessage);
        }
        if (mustBeDeleted && !"deleted".equals(permit.get("status"))) {
            throw new ApiException(HttpStatus.CONFLICT, "보관함에 있는 허가서만 처리할 수 있습니다.");
        }
    }

    private void requireAuthenticated(AuthService.AuthenticatedUser user) {
        if (user == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        }
    }

    private void requireCanView(AuthService.AuthenticatedUser user, long permitId) {
        requireAuthenticated(user);
        if (isAdmin(user)) {
            return;
        }
        Integer assigned = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM work_permit_workers WHERE permit_id = ? AND user_id = ?",
            Integer.class,
            permitId,
            user.id()
        );
        if (assigned == null || assigned == 0) {
            throw new ApiException(HttpStatus.FORBIDDEN, "배정된 작업허가서만 조회할 수 있습니다.");
        }
    }

    private void replaceFiles(long permitId, long userId, List<Long> fileIds) {
        jdbcTemplate.update("DELETE FROM work_permit_files WHERE permit_id = ?", permitId);
        linkFiles(permitId, userId, fileIds);
    }

    private void linkFiles(long permitId, long userId, List<Long> fileIds) {
        if (fileIds == null) {
            return;
        }
        for (Long fileId : fileIds) {
            int linked = jdbcTemplate.update(
                """
                    INSERT INTO work_permit_files (permit_id, file_id, purpose)
                    SELECT ?, id, 'permit' FROM files
                    WHERE id = ? AND uploaded_by = ? AND file_type = 'permit'
                    """,
                permitId,
                fileId,
                userId
            );
            if (linked != 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "업로드한 허가서 파일을 찾을 수 없습니다.");
            }
        }
    }

    private void replaceAssignedWorkers(long permitId, List<Long> workerIds) {
        jdbcTemplate.update("DELETE FROM work_permit_workers WHERE permit_id = ?", permitId);
        if (workerIds == null) {
            return;
        }
        for (Long workerId : workerIds.stream().distinct().toList()) {
            if (workerId == null) {
                continue;
            }
            int assigned = jdbcTemplate.update(
                """
                    INSERT INTO work_permit_workers (permit_id, user_id)
                    SELECT ?, u.id
                      FROM users u
                      JOIN user_roles ur ON ur.user_id = u.id
                      JOIN roles r ON r.id = ur.role_id
                     WHERE u.id = ?
                       AND u.status = 'active'
                       AND r.role_code = 'WORKER'
                    """,
                permitId,
                workerId
            );
            if (assigned != 1) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "유효한 작업자만 허가서에 배정할 수 있습니다.");
            }
        }
    }

    private void clearAnalysisData(long permitId) {
        jdbcTemplate.update(
            "DELETE FROM permit_simops_conflicts WHERE permit_a_id = ? OR permit_b_id = ?",
            permitId,
            permitId
        );
        jdbcTemplate.update("DELETE FROM risk_simulations WHERE permit_id = ?", permitId);
        jdbcTemplate.update("DELETE FROM risk_scores WHERE permit_id = ?", permitId);
        jdbcTemplate.update("DELETE FROM similar_accident_results WHERE permit_id = ?", permitId);
        jdbcTemplate.update("DELETE FROM permit_analysis_results WHERE permit_id = ?", permitId);
    }

    private boolean isAdmin(AuthService.AuthenticatedUser user) {
        return user.roles().contains("ADMIN");
    }
}
