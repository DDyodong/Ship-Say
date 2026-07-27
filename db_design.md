# 현장 안전 AI 관제 DB 구조 초안

## 요구사항과 기존 ERD 매칭

기존 ERD의 큰 방향은 요구사항과 맞습니다.

- `UserInfo`: 로그인, 사용자/작업자 정보
- `FileInfo`: 작업허가서 PDF, 현장 사진/영상, TTS 음성 등 파일 저장
- `WorkPermitInfo`: 작업허가서, 작업 구역, 작업 시간, 작업자 수, GPS/위험 여부
- `TbmLogInfo`: TBM 브리핑 기록
- `RuleInfo`, `RuleCheckInfo`: 안전 기준, 조건 점검 결과
- `BlockInfo`, `DangerZoneInfo`: 현장 블록, 위험 구역, ROI/폴리곤
- `SafetyEventInfo`: 위험 신고, PPE 위반, 감지 이벤트
- `RiskSimulationInfo`: 위험도 예측, What-if 시뮬레이션

다만 요구사항을 그대로 구현하려면 아래 테이블이 추가로 필요합니다.

- 권한 관리: 역할, 사용자-역할 매핑
- 작업허가서 분석: PDF 파싱 결과, LLM 요약/조건, 유사사고 검색 결과
- 승인 워크플로우: 승인 단계, 승인자, 승인/반려 이력
- TBM 브리핑: 브리핑 세션, 체크리스트 템플릿/항목/응답, TTS 파일
- 영상 감시: 카메라, 영상 프레임/스냅샷, AI 탐지 이벤트, 미식별 작업자 마스킹
- 알림/신고: 푸시/SNS/WebSocket 알림 이력, 사용자 신고
- 모델 운영: AI 추론 작업, 모델 버전, 신뢰도/근거 저장
- 감사 로그: 로그인, 권한 변경, 승인 처리, 위험 이벤트 처리 이력

## 추천 엔티티 구조

### 1. 사용자/권한

- `users`: 사용자, 작업자, 관리자 공통 계정
- `roles`: 관리자, 작업자, AI 서비스 역할
- `user_roles`: 사용자별 역할 매핑
- `auth_sessions`: JWT refresh/session 관리가 필요할 경우

현재 애플리케이션은 JWT가 아닌 DB 세션 기반 Bearer 토큰을 사용합니다. 원본 토큰은 클라이언트에만 반환하고 서버에는 SHA-256 해시를 저장합니다.

역할별 책임은 다음과 같습니다.

| 역할 | 책임 |
| --- | --- |
| `WORKER` | 일반 작업자 기능과 본인 데이터 처리 |
| `ADMIN` | 전체 관제, 작업허가, AI·위험 분석, 기준정보 변경과 운영 기능 관리 |
| `AI_SERVICE` | AI 모델 결과 및 위험 점수 등록 |

`roles`는 역할 정의, `user_roles`는 사용자별 역할과 선택적인 사업장 범위를 저장합니다. 역할 정의는 Flyway 마이그레이션으로 생성하지만 사용자 역할 배정은 별도 관리 작업으로 처리합니다.

### 2. 현장/공간

- `sites`: 사업장/현장
- `blocks`: 현장 내 작업 블록
- `danger_zones`: 위험 구역, ROI, 폴리곤
- `cameras`: CCTV/RTSP/엣지 카메라 정보

### 3. 파일/문서

- `files`: PDF, 이미지, 영상, 음성, 마스킹 결과물 공통 저장
- `work_permits`: 작업허가서 메인
- `work_permit_files`: 작업허가서와 파일 연결
- `permit_analysis_results`: 허가서 LLM/AI 분석 결과
- `similar_accident_results`: 유사 사고 검색 결과

### 4. 안전 기준/체크

- `safety_rules`: 안전 기준 원문, 쉬운 설명, 언어
- `rule_checks`: 허가서/작업/ROI 기준 충족 여부
- `checklist_templates`: 체크리스트 템플릿
- `checklist_items`: 체크리스트 항목
- `checklist_responses`: 작업자 확인 결과

### 5. TBM 브리핑

- `tbm_sessions`: 작업 전 TBM 세션
- `tbm_materials`: 브리핑 요약, 번역, 쉬운 설명, TTS 파일
- `tbm_attendance`: 참석/확인 작업자

### 6. 승인 워크플로우

- `approval_flows`: 허가서별 승인 흐름
- `approval_steps`: 단계별 승인자, 상태, 코멘트

### 7. 영상 감시/이벤트

- `vision_detections`: PPE 위반, 작업자 미식별, ROI 침입 등 AI 탐지 결과
- `safety_events`: 신고/탐지/시스템 이벤트 통합
- `event_actions`: 이벤트 처리 이력

### 8. 위험 예측/시뮬레이션

- `risk_scores`: 허가서/구역/이벤트별 위험 점수
- `risk_simulations`: 2.5D, What-if 재계산 결과

### 9. 알림/운영

- `notifications`: 앱 푸시, SNS, WebSocket, 관리자 알림 이력
- `model_runs`: AI 모델 추론 작업 로그
- `audit_logs`: 관리자 작업, 권한 변경, 승인 처리 감사 로그

## 핵심 관계

- `sites 1:N blocks`
- `blocks 1:N danger_zones`
- `sites 1:N cameras`
- `users 1:N work_permits` as applicant
- `work_permits N:M files` through `work_permit_files`
- `work_permits 1:N permit_analysis_results`
- `work_permits 1:N rule_checks`
- `work_permits 1:N tbm_sessions`
- `work_permits 1:N approval_flows`
- `cameras 1:N vision_detections`
- `vision_detections 1:1 or N:1 safety_events`
- `safety_events 1:N notifications`
- `work_permits / blocks / danger_zones 1:N risk_scores`

## 설계 판단

- AI 결과물은 정형 컬럼과 MySQL `JSON`을 같이 둡니다. 모델 출력 포맷이 계속 바뀔 가능성이 높기 때문입니다.
- 파일은 전부 `files`에 모으고, 각 기능 테이블에서 FK로 연결합니다.
- 체크리스트는 템플릿/항목/응답을 분리해야 관리자 조건 변경과 작업자 응답 저장이 깔끔합니다.
- 승인 워크플로우는 허가서 상태 하나로 처리하지 말고 단계 테이블을 분리하는 편이 좋습니다.
- 위험 이벤트는 사용자가 신고한 것과 AI가 탐지한 것을 `safety_events`로 통합하면 대시보드/알림이 단순해집니다.
