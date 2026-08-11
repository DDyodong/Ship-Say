package com.example.safetyai.risk.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class SafetyIncidentRiskRuleEngineTest {
    private final SafetyIncidentRiskRuleEngine engine = new SafetyIncidentRiskRuleEngine();

    @Test
    void calculatesDeterministicWeightedScore() {
        SafetyIncidentRiskRuleEngine.Result result = engine.evaluate(
            new SafetyIncidentRiskRuleEngine.Assessment(5, 4, 3, 5, false)
        );

        assertEquals(87, result.score());
        assertEquals("critical", result.severity());
        assertEquals("P1", result.priority());
        assertEquals("HO-SAFETY-INCIDENT-1.0", result.policyVersion());
    }

    @Test
    void criticalConditionEnforcesP1Minimum() {
        SafetyIncidentRiskRuleEngine.Result result = engine.evaluate(
            new SafetyIncidentRiskRuleEngine.Assessment(1, 1, 1, 1, true)
        );

        assertEquals(80, result.score());
        assertEquals("critical", result.severity());
        assertEquals("P1", result.priority());
    }
}
