package com.example.safetyai.permit.service;

// 허가서가 승인/조건부승인되었을 때 발행되는 이벤트. 리스너가 백그라운드에서
// OpenAI 현장 안내(TBM 안내문·보호구·작업자별 확인사항)를 미리 생성해 캐시해 둔다.
// 워커 앱은 이 캐시를 조회만 하고, 직접 생성을 트리거하지 않는다 — 승인 클릭이나
// 작업자의 "오늘 작업" 로딩이 OpenAI 응답 시간만큼 느려지는 걸 막기 위함이다.
public record FieldGuidanceRequested(long permitId) {
}
