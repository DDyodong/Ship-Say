package com.example.safetyai.worker.service;

import com.example.safetyai.file.storage.FileStorage;
import com.example.safetyai.worker.controller.PersonalCheckAiController;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Service
public class PpeImageAnalysisService {
    private static final Logger log = LoggerFactory.getLogger(PpeImageAnalysisService.class);

    private final JdbcTemplate jdbcTemplate;
    private final FileStorage fileStorage;
    private final PpeImageAnalysisClient client;
    private final PersonalCheckAiController resultController;
    private final boolean enabled;

    public PpeImageAnalysisService(
        JdbcTemplate jdbcTemplate,
        FileStorage fileStorage,
        PpeImageAnalysisClient client,
        PersonalCheckAiController resultController,
        @Value("${app.ai.ppe-image.enabled:false}") boolean enabled
    ) {
        this.jdbcTemplate = jdbcTemplate;
        this.fileStorage = fileStorage;
        this.client = client;
        this.resultController = resultController;
        this.enabled = enabled;
    }

    @Async("ppeImageAnalysisExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void analyze(PpeImageAnalysisRequested event) {
        if (!enabled) return;
        try {
            Map<String, Object> file = loadFile(event.ppeCheckId());
            Resource image = fileStorage.load(String.valueOf(file.get("storage_key")));
            PpeImageAnalysisClient.AnalysisResult result = client.analyze(
                image,
                String.valueOf(file.get("original_name"))
            );
            resultController.applyResult(
                event.ppeCheckId(),
                new PersonalCheckAiController.AnalysisResultRequest(
                    result.status(), result.helmetOn(), result.helmetConfidence(),
                    result.harnessOn(), result.weldingMaskOn(), result.model(),
                    result.message(), result.reasonCode(), result.missingItems()
                )
            );
        } catch (Exception exception) {
            String message = safeMessage(exception);
            log.warn("PPE image analysis failed for check {}: {}", event.ppeCheckId(), message);
            jdbcTemplate.update(
                """
                    UPDATE personal_ppe_checks
                       SET status = 'failed', message = ?, analyzed_at = CURRENT_TIMESTAMP(6)
                     WHERE id = ? AND status = 'pending_analysis'
                    """,
                message,
                event.ppeCheckId()
            );
        }
    }

    private Map<String, Object> loadFile(long ppeCheckId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT f.storage_key, f.original_name
                  FROM personal_ppe_checks p
                  JOIN files f ON f.id = p.file_id
                 WHERE p.id = ?
                   AND f.file_type = 'ppe_check'
                """,
            ppeCheckId
        );
        if (rows.isEmpty()) throw new IllegalStateException("PPE image file was not found.");
        return rows.get(0);
    }

    private String safeMessage(Exception exception) {
        String message = exception.getMessage();
        if (message == null || message.isBlank()) return "PPE image analysis failed.";
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
