package com.example.safetyai.auth.bootstrap;

import com.example.safetyai.common.util.JdbcInsert;
import java.util.Arrays;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class AdminAccountBootstrap implements ApplicationRunner {
    private final JdbcTemplate jdbcTemplate;
    private final PasswordEncoder passwordEncoder;
    private final String username;
    private final String password;
    private final String name;

    public AdminAccountBootstrap(
        JdbcTemplate jdbcTemplate,
        PasswordEncoder passwordEncoder,
        @Value("${app.bootstrap-admin.username:}") String username,
        @Value("${app.bootstrap-admin.password:}") String password,
        @Value("${app.bootstrap-admin.name:관리자}") String name
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.passwordEncoder = passwordEncoder;
        this.username = username == null ? "" : username.trim().toLowerCase(Locale.ROOT);
        this.password = password == null ? "" : password;
        this.name = name == null || name.isBlank() ? "관리자" : name.trim();
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (username.isBlank() && password.isBlank()) {
            return;
        }
        if (!username.matches("^[A-Za-z0-9._-]{4,30}$")) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_USERNAME가 아이디 규칙에 맞지 않습니다.");
        }
        if (password.length() < 8 || password.length() > 72) {
            throw new IllegalStateException("BOOTSTRAP_ADMIN_PASSWORD는 8~72자여야 합니다.");
        }

        Long userId = jdbcTemplate.query(
            "SELECT id FROM users WHERE username = ?",
            rs -> rs.next() ? rs.getLong("id") : null,
            username
        );
        if (userId == null) {
            userId = JdbcInsert.insert(
                jdbcTemplate,
                """
                    INSERT INTO users (employee_no, username, password_hash, name, status)
                    VALUES (NULL, ?, ?, ?, 'active')
                    """,
                Arrays.asList(username, passwordEncoder.encode(password), name)
            );
        }

        int assigned = jdbcTemplate.update(
            """
                INSERT IGNORE INTO user_roles (user_id, role_id, site_id)
                SELECT ?, id, NULL FROM roles WHERE role_code = 'ADMIN'
                """,
            userId
        );
        Integer hasAdminRole = jdbcTemplate.queryForObject(
            """
                SELECT COUNT(*)
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = ? AND r.role_code = 'ADMIN'
                """,
            Integer.class,
            userId
        );
        if (assigned == 0 && (hasAdminRole == null || hasAdminRole == 0)) {
            throw new IllegalStateException("ADMIN 역할이 준비되지 않았습니다.");
        }
    }
}
