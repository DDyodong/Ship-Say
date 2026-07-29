package com.example.safetyai.permit.controller;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/workers")
public class AdminWorkerController {
    private final JdbcTemplate jdbcTemplate;

    public AdminWorkerController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        return jdbcTemplate.queryForList(
            """
                SELECT DISTINCT u.id, u.username, u.name, u.employee_no
                  FROM users u
                  JOIN user_roles ur ON ur.user_id = u.id
                  JOIN roles r ON r.id = ur.role_id
                 WHERE u.status = 'active'
                   AND r.role_code = 'WORKER'
                 ORDER BY u.name, u.id
                """
        );
    }
}
