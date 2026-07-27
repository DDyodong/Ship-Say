package com.example.safetyai.risk.controller;

import com.example.safetyai.risk.dto.CreateSafetyEventRequest;
import com.example.safetyai.risk.dto.SafetyEventActionRequest;
import com.example.safetyai.risk.service.SafetyEventService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/safety-events")
public class SafetyEventController {
    private final SafetyEventService safetyEventService;

    public SafetyEventController(SafetyEventService safetyEventService) {
        this.safetyEventService = safetyEventService;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(required = false) String status) {
        return safetyEventService.getAll(status);
    }

    @GetMapping("/reports")
    public List<Map<String, Object>> workerReports(@RequestParam(required = false) String status) {
        return safetyEventService.getWorkerReports(status);
    }

    @GetMapping("/my")
    public List<Map<String, Object>> myReports(
        @RequestHeader(value = "Authorization", required = false) String authorization
    ) {
        return safetyEventService.getMyReports(authorization);
    }

    @PostMapping
    public Map<String, Object> create(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @Valid @RequestBody CreateSafetyEventRequest request
    ) {
        return safetyEventService.createUserReport(authorization, request);
    }

    @PostMapping("/{id}/actions")
    public Map<String, Object> updateStatus(
        @RequestHeader(value = "Authorization", required = false) String authorization,
        @PathVariable long id,
        @Valid @RequestBody SafetyEventActionRequest request
    ) {
        return safetyEventService.updateReportStatus(authorization, id, request);
    }

}
