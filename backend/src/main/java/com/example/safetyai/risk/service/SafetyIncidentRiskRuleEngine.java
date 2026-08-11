package com.example.safetyai.risk.service;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class SafetyIncidentRiskRuleEngine {
    public static final String POLICY_VERSION = "HO-SAFETY-INCIDENT-1.0";

    public Result evaluate(Assessment assessment) {
        int impact = level(assessment.impactLevel()) * 8;
        int likelihood = level(assessment.likelihoodLevel()) * 5;
        int exposure = level(assessment.exposureLevel()) * 4;
        int urgency = level(assessment.urgencyLevel()) * 3;
        int score = Math.min(100, impact + likelihood + exposure + urgency);
        if (assessment.criticalCondition()) {
            score = Math.max(80, score);
        }

        String severity = score >= 80 ? "critical"
            : score >= 60 ? "high"
            : score >= 30 ? "medium" : "low";
        String priority = score >= 80 ? "P1"
            : score >= 60 ? "P2"
            : score >= 30 ? "P3" : "P4";

        Map<String, Integer> factors = new LinkedHashMap<>();
        factors.put("impact", impact);
        factors.put("likelihood", likelihood);
        factors.put("exposure", exposure);
        factors.put("urgency", urgency);
        return new Result(score, severity, priority, factors, POLICY_VERSION);
    }

    private int level(int value) {
        return Math.max(1, Math.min(5, value));
    }

    public record Assessment(
        int impactLevel,
        int likelihoodLevel,
        int exposureLevel,
        int urgencyLevel,
        boolean criticalCondition
    ) {
    }

    public record Result(
        int score,
        String severity,
        String priority,
        Map<String, Integer> factors,
        String policyVersion
    ) {
    }
}
