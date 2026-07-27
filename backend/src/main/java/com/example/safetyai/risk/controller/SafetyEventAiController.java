package com.example.safetyai.risk.controller;

import com.example.safetyai.risk.dto.SafetyEventAnalysisRequest;
import com.example.safetyai.risk.service.SafetyEventService;
import jakarta.validation.Valid;
import java.util.Map;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/safety-events")
public class SafetyEventAiController {
    private final SafetyEventService safetyEventService;

    public SafetyEventAiController(SafetyEventService safetyEventService) {
        this.safetyEventService = safetyEventService;
    }

    @PostMapping("/{id}/analysis")
    public Map<String, Object> saveAnalysis(
        @PathVariable long id,
        @Valid @RequestBody SafetyEventAnalysisRequest request
    ) {
        return safetyEventService.saveAiAnalysis(id, request);
    }
}
