package com.example.safetyai.worker.controller;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ppe-checks")
public class AdminPpeCheckController {
    private final JdbcTemplate jdbcTemplate;

    public AdminPpeCheckController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return jdbcTemplate.query(
            """
                SELECT p.id,
                       p.user_id,
                       u.name AS worker_name,
                       COALESCE(u.employee_no, u.username) AS employee_no,
                       p.permit_id,
                       wp.permit_no,
                       wp.work_title,
                       b.block_code,
                       p.file_id,
                       p.status,
                       p.helmet_on,
                       p.helmet_confidence,
                       p.harness_on,
                       p.welding_mask_on,
                       p.safety_shoes_confirmed,
                       p.workwear_confirmed,
                       p.model_name,
                       p.message,
                       p.checked_at,
                       p.analyzed_at
                  FROM personal_ppe_checks p
                  JOIN users u ON u.id = p.user_id
             LEFT JOIN work_permits wp ON wp.id = p.permit_id
             LEFT JOIN blocks b ON b.id = wp.block_id
                 ORDER BY p.checked_at DESC
                 LIMIT 100
                """,
            (resultSet, rowNumber) -> response(resultSet)
        );
    }

    private Map<String, Object> response(ResultSet row) throws SQLException {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", row.getLong("id"));
        response.put("userId", row.getLong("user_id"));
        response.put("workerName", row.getString("worker_name"));
        response.put("employeeNo", row.getString("employee_no"));
        response.put("permitId", nullableLong(row, "permit_id"));
        response.put("permitNo", row.getString("permit_no"));
        response.put("workTitle", row.getString("work_title"));
        response.put("blockCode", row.getString("block_code"));
        response.put("fileId", row.getLong("file_id"));
        response.put("status", row.getString("status"));
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
