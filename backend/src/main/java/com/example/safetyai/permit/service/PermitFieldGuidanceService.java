package com.example.safetyai.permit.service;

import java.util.Map;
import java.util.Optional;

/**
 * 팀 규칙 모델의 판정 결과를 현장용 TBM/PPE 안내로 변환하는 경계입니다.
 * 이 서비스는 승인·보류·반려 판정을 새로 만들거나 변경하지 않습니다.
 */
public interface PermitFieldGuidanceService {
    Map<String, Object> generate(long permitId);

    // generate()와 달리 새로 생성을 트리거하지 않고 이미 캐시된 결과만 조회한다.
    // 워커 앱처럼 응답 지연을 감수할 수 없는 곳에서 사용한다.
    Optional<Map<String, Object>> peekCached(long permitId);
}
