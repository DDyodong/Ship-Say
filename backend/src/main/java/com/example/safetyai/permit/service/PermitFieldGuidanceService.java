package com.example.safetyai.permit.service;

import java.util.Map;

/**
 * 팀 규칙 모델의 판정 결과를 현장용 TBM/PPE 안내로 변환하는 경계입니다.
 * 이 서비스는 승인·보류·반려 판정을 새로 만들거나 변경하지 않습니다.
 */
public interface PermitFieldGuidanceService {
    Map<String, Object> generate(long permitId);
}
