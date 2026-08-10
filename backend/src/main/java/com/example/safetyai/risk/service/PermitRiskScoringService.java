package com.example.safetyai.risk.service;

import com.example.safetyai.common.util.JdbcInsert;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

// 작업허가서 단위 "종합 위험 점수"를 규칙 기반 가중합으로 계산해 risk_scores에 저장한다.
//
// PPE는 별도 가중치로 넣지 않는다 — 안전모·하네스 착용은 그라데이션이 있는 "위험 요인"이
// 아니라 지켜야만 하는 최소 기준이고, 미착용이 확인되면 이미 PersonalCheckAiController가
// ai_ppe safety_event를 만들어 접수한다. 그 이벤트가 안전이벤트 신호로 이미 잡히기 때문에,
// PPE 미착용 개수를 따로 또 점수화하면 같은 위반을 두 번 세게 된다.
//
// 지금 이미 실데이터로 채워지는 2개 신호원만 합산한다 — SHAP·신경망 같은 학습 모델은
// 쓰지 않는다. 이유: 사고 이력이 거의 없는 초기 단계라 지도학습 모델을 검증할 라벨
// 데이터 자체가 없고, 안전 시스템은 "왜 이 점수가 나왔는지" 설명 가능해야 감사(Audit)에
// 대응할 수 있기 때문. 로봇/설비 이상 신호는 의도적으로 뺐다 — DigitalTwinService의
// 텔레메트리가 아직 실제 로봇 하드웨어가 아니라 시뮬레이터라서, 실데이터가 아닌 값을
// 종합 점수에 섞으면 점수 자체의 신뢰도가 오염된다.
//
// score 0~100, risk_level은 safety_events.severity와 동일한 표기(low/medium/high/critical)를
// 그대로 따른다. factors JSON에는 신호별 (점수/만점/근거)를 남겨 감사·화면 설명에 재사용한다.
@Service
public class PermitRiskScoringService {
    public static final String MODEL_NAME = "permit-rule-engine-v1";

    private static final int PERMIT_MAX = 45;
    private static final int EVENT_MAX = 55;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public PermitRiskScoringService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> recompute(long permitId) {
        Factor permit = permitFactor(permitId);
        Factor events = eventFactor(permitId);

        int score = clamp(permit.points + events.points, 0, 100);
        String riskLevel = levelFromScore(score);

        ObjectNode factors = objectMapper.createObjectNode();
        factors.set("permit", permit.toJson(objectMapper));
        factors.set("safetyEvents", events.toJson(objectMapper));

        long id = JdbcInsert.insert(
            jdbcTemplate,
            """
                INSERT INTO risk_scores (permit_id, score, risk_level, model_name, factors, shap_values)
                VALUES (?, ?, ?, ?, ?, JSON_OBJECT())
                """,
            Arrays.asList(permitId, score, riskLevel, MODEL_NAME, factors.toString())
        );
        return Map.of(
            "id", id,
            "permitId", permitId,
            "score", score,
            "riskLevel", riskLevel,
            "modelName", MODEL_NAME
        );
    }

    // 신호 1: 허가서 자체 위반(rule engine) + 동시작업(SIMOPS) 충돌.
    // overall_risk는 permit_analysis 서비스가 이미 산출한 판정(승인/보류/반려)을 그대로 쓴다.
    private Factor permitFactor(long permitId) {
        List<String> risks = jdbcTemplate.query(
            """
                SELECT JSON_UNQUOTE(JSON_EXTRACT(extracted_data, '$.overall_risk')) AS overall_risk
                  FROM permit_analysis_results
                 WHERE permit_id = ? AND analysis_type = 'permit_rule_simops'
                 ORDER BY created_at DESC
                 LIMIT 1
                """,
            (resultSet, rowNumber) -> resultSet.getString("overall_risk"),
            permitId
        );
        String overallRisk = risks.isEmpty() ? null : risks.get(0);
        int basePoints = switch (overallRisk == null ? "" : overallRisk) {
            case "반려" -> 38;
            case "보류" -> 22;
            default -> 0;
        };

        Integer conflictCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM permit_simops_conflicts WHERE permit_a_id = ? OR permit_b_id = ?",
            Integer.class,
            permitId,
            permitId
        );
        int conflicts = conflictCount == null ? 0 : conflictCount;
        int points = Math.min(PERMIT_MAX, basePoints + conflicts * 4);
        String evidence = (overallRisk == null ? "허가서 분석 대기" : "허가서 판정 " + overallRisk)
            + " · 동시작업 충돌 " + conflicts + "건";
        return new Factor(points, PERMIT_MAX, evidence);
    }

    // 신호 2: 이 허가서에 연결된 미해결 안전 이벤트(작업자 신고 + AI PPE 감지 + 시스템 알림).
    // PPE 미착용은 여기서 잡힌다 — ai_ppe safety_event로 이미 들어오기 때문에 별도 항목을 두지 않는다.
    private Factor eventFactor(long permitId) {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            """
                SELECT severity
                  FROM safety_events
                 WHERE permit_id = ? AND status NOT IN ('resolved', 'closed')
                """,
            permitId
        );
        int points = 0;
        for (Map<String, Object> row : rows) {
            points += switch (String.valueOf(row.get("severity"))) {
                case "critical" -> 40;
                case "high" -> 28;
                case "medium" -> 14;
                case "low" -> 6;
                default -> 10; // unclassified 등
            };
        }
        points = Math.min(EVENT_MAX, points);
        String evidence = rows.isEmpty() ? "미해결 안전 이벤트 없음" : "미해결 안전 이벤트 " + rows.size() + "건";
        return new Factor(points, EVENT_MAX, evidence);
    }

    // safety_events.severity(low/medium/high/critical)와 동일한 표기를 쓴다.
    private String levelFromScore(int score) {
        if (score >= 80) return "critical";
        if (score >= 60) return "high";
        if (score >= 30) return "medium";
        return "low";
    }

    private int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private record Factor(int points, int max, String evidence) {
        ObjectNode toJson(ObjectMapper mapper) {
            ObjectNode node = mapper.createObjectNode();
            node.put("score", points);
            node.put("max", max);
            node.put("evidence", evidence);
            return node;
        }
    }
}
