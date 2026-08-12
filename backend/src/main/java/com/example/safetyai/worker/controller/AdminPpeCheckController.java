package com.example.safetyai.worker.controller;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ppe-checks")
public class AdminPpeCheckController {
    private final JdbcTemplate jdbcTemplate;
    private final String storageType;

    public AdminPpeCheckController(
        JdbcTemplate jdbcTemplate,
        @Value("${app.file-storage.type:local}") String storageType
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.storageType = storageType;
    }

    @GetMapping
    public Map<String, Object> list() {
        List<Map<String, Object>> items = jdbcTemplate.query(
            """
                SELECT p.id AS check_id,
                       wpw.user_id,
                       u.name AS worker_name,
                       COALESCE(u.employee_no, u.username) AS employee_no,
                       wp.id AS permit_id,
                       wp.permit_no,
                       wp.work_title,
                       wp.work_type,
                       wp.start_time,
                       wp.end_time,
                       wp.status AS permit_status,
                       s.name AS site_name,
                       b.block_code,
                       p.file_id,
                       p.status,
                       p.passed,
                       p.helmet_on,
                       p.helmet_confidence,
                       p.harness_on,
                       p.welding_mask_on,
                       p.safety_shoes_confirmed,
                       p.workwear_confirmed,
                       p.model_name,
                       p.message,
                       p.checked_at,
                       p.analyzed_at,
                       f.original_name,
                       f.file_size,
                       f.created_at AS stored_at
                  FROM work_permit_workers wpw
                  JOIN work_permits wp ON wp.id = wpw.permit_id
                  JOIN users u ON u.id = wpw.user_id
                  JOIN sites s ON s.id = wp.site_id
             LEFT JOIN blocks b ON b.id = wp.block_id
             LEFT JOIN personal_ppe_checks p
                    ON p.id = (
                       SELECT latest.id
                         FROM personal_ppe_checks latest
                        WHERE latest.permit_id = wpw.permit_id
                          AND latest.user_id = wpw.user_id
                        ORDER BY latest.checked_at DESC
                        LIMIT 1
                    )
             LEFT JOIN files f ON f.id = p.file_id
                 WHERE wp.status IN ('approved', 'conditional_approved')
                 ORDER BY CASE WHEN p.id IS NULL THEN 0 ELSE 1 END,
                          wp.start_time DESC,
                          p.checked_at DESC,
                          wp.id DESC
                 LIMIT 200
                """,
            (resultSet, rowNumber) -> response(resultSet)
        );

        long submitted = items.stream().filter(item -> Boolean.TRUE.equals(item.get("submitted"))).count();
        long passed = items.stream().filter(item -> "passed".equals(item.get("status"))).count();
        long attention = items.stream().filter(item ->
            "retry_required".equals(item.get("status")) || "failed".equals(item.get("status"))
        ).count();
        long pending = items.size() - passed - attention;

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("required", items.size());
        summary.put("submitted", submitted);
        summary.put("passed", passed);
        summary.put("attention", attention);
        summary.put("pending", pending);

        Map<String, Object> storage = new LinkedHashMap<>();
        storage.put("type", storageType);
        storage.put("label", "s3".equalsIgnoreCase(storageType) ? "S3 객체 스토리지" : "서버 파일 저장소");
        storage.put("metadataStore", "보호구 점검 DB");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary);
        result.put("storage", storage);
        result.put("items", items);
        return result;
    }

    private Map<String, Object> response(ResultSet row) throws SQLException {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", nullableLong(row, "check_id"));
        response.put("submitted", row.getObject("check_id") != null);
        response.put("userId", row.getLong("user_id"));
        response.put("workerName", row.getString("worker_name"));
        response.put("employeeNo", row.getString("employee_no"));
        response.put("permitId", row.getLong("permit_id"));
        response.put("permitNo", row.getString("permit_no"));
        response.put("workTitle", row.getString("work_title"));
        response.put("workType", row.getString("work_type"));
        response.put("startTime", row.getObject("start_time"));
        response.put("endTime", row.getObject("end_time"));
        response.put("permitStatus", row.getString("permit_status"));
        response.put("siteName", row.getString("site_name"));
        response.put("blockCode", row.getString("block_code"));
        response.put("fileId", nullableLong(row, "file_id"));
        response.put("status", row.getString("status"));
        response.put("passed", nullableBoolean(row, "passed"));
        response.put("helmetOn", nullableBoolean(row, "helmet_on"));
        response.put("helmetConfidence", row.getObject("helmet_confidence"));
        response.put("harnessOn", nullableBoolean(row, "harness_on"));
        response.put("weldingMaskOn", nullableBoolean(row, "welding_mask_on"));
        response.put("safetyShoesConfirmed", row.getBoolean("safety_shoes_confirmed"));
        response.put("workwearConfirmed", row.getBoolean("workwear_confirmed"));
        response.put("model", row.getString("model_name"));
        response.put("message", row.getString("message"));
        response.put("checkedAt", row.getObject("checked_at"));
        response.put("analyzedAt", row.getObject("analyzed_at"));
        response.put("originalName", row.getString("original_name"));
        response.put("fileSize", row.getObject("file_size"));
        response.put("storedAt", row.getObject("stored_at"));
        return response;
    }

    private Long nullableLong(ResultSet row, String column) throws SQLException {
        long value = row.getLong(column);
        return row.wasNull() ? null : value;
    }

    private Boolean nullableBoolean(ResultSet row, String column) throws SQLException {
        boolean value = row.getBoolean(column);
        return row.wasNull() ? null : value;
    }
}
