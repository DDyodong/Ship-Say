package com.example.safetyai.auth.config;

import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
class SecurityTestController {
    @GetMapping({
        "/api/master/sites",
        "/api/dashboard/summary",
        "/api/ai/model-runs",
        "/api/work-permits",
        "/api/work-permits/trash",
        "/api/board/posts",
        "/api/safety-events",
        "/api/safety-events/my",
        "/api/not-configured"
    })
    Map<String, String> get() {
        return Map.of("status", "ok");
    }

    @PostMapping({
        "/api/master/sites",
        "/api/ai/model-runs",
        "/api/work-permits",
        "/api/work-permits/1/restore",
        "/api/safety-events",
        "/api/safety-events/1/actions",
        "/api/risks/simulations"
    })
    Map<String, String> post() {
        return Map.of("status", "ok");
    }

    @PutMapping("/api/work-permits/1")
    Map<String, String> put() {
        return Map.of("status", "ok");
    }

    @DeleteMapping("/api/work-permits/1")
    Map<String, String> delete() {
        return Map.of("status", "ok");
    }
}
