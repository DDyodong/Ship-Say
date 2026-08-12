package com.example.safetyai.risk.service;

import com.example.safetyai.file.storage.FileStorage;
import com.example.safetyai.risk.repository.SafetyEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class SafetyReportAnalysisService {
    private static final Logger log = LoggerFactory.getLogger(SafetyReportAnalysisService.class);

    private final SafetyEventRepository repository;
    private final FileStorage fileStorage;
    private final OpenAiSafetyReportAnalysisClient client;
    private final SafetyIncidentRiskRuleEngine ruleEngine;
    private final ObjectMapper objectMapper;
    private final boolean enabled;

    public SafetyReportAnalysisService(
        SafetyEventRepository repository,
        FileStorage fileStorage,
        OpenAiSafetyReportAnalysisClient client,
        SafetyIncidentRiskRuleEngine ruleEngine,
        ObjectMapper objectMapper,
        @Value("${app.ai.safety-report.enabled:true}") boolean enabled
    ) {
        this.repository = repository;
        this.fileStorage = fileStorage;
        this.client = client;
        this.ruleEngine = ruleEngine;
        this.objectMapper = objectMapper;
        this.enabled = enabled;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void analyze(SafetyReportAnalysisRequested request) {
        if (!enabled) return;
        long eventId = request.eventId();
        repository.markAnalysisRunning(eventId);
        log.info("Safety report analysis started: eventId={}", eventId);
        try {
            Map<String, Object> report = repository.findUserReportForAnalysis(eventId);
            Resource image = fileStorage.load(String.valueOf(report.get("storage_key")));
            OpenAiSafetyReportAnalysisClient.Analysis evidence = client.analyze(
                image,
                String.valueOf(report.get("mime_type")),
                String.valueOf(report.get("event_type")),
                String.valueOf(report.get("description"))
            );
            SafetyIncidentRiskRuleEngine.Result result = ruleEngine.evaluate(
                new SafetyIncidentRiskRuleEngine.Assessment(
                    evidence.impactLevel(),
                    evidence.likelihoodLevel(),
                    evidence.exposureLevel(),
                    evidence.urgencyLevel(),
                    evidence.criticalCondition()
                )
            );
            repository.saveAutomatedAnalysis(
                eventId,
                result.severity(),
                evidence.estimatedLocation(),
                result.score(),
                evidence.summary(),
                evidence.recommendedAction(),
                evidence.confidence(),
                client.model(),
                result.priority(),
                result.policyVersion(),
                objectMapper.writeValueAsString(result.factors()),
                objectMapper.writeValueAsString(evidence.observedHazards())
            );
            log.info(
                "Safety report analysis completed: eventId={}, score={}, priority={}, policy={}",
                eventId, result.score(), result.priority(), result.policyVersion()
            );
        } catch (Exception exception) {
            String message = safeMessage(exception);
            repository.markAnalysisFailed(eventId, message);
            log.error("Safety report analysis failed: eventId={}, error={}", eventId, message, exception);
        }
    }

    private String safeMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return "Safety report analysis failed.";
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
