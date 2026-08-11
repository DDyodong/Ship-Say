# API Spec

## 필수 기능 대비 현재 상태

- 회원가입/로그인: `users`, `auth_sessions` 테이블로 구현 가능하며 API를 추가했습니다.
- 게시판: 기존 DB에 테이블이 없어 `board_posts`, `board_post_comments`, `board_post_files`를 추가했습니다.
- 파일 업로드: `files` 테이블을 사용하며 로컬 저장소와 DB 메타데이터 저장 API를 추가했습니다.
- AI 결과 연동: `model_runs`, `permit_analysis_results`, `risk_scores`에 모델 실행/분석/위험도 결과를 저장하는 API를 추가했습니다.
- 대시보드/시연: `work_permits`, `safety_events`, `risk_scores` 기반 요약 API를 추가했습니다.

## 추가로 있으면 좋은 것

- 인증은 DB 세션 기반 Bearer 토큰을 사용하고 역할별 접근 제어를 적용합니다. 운영 확장 시 토큰 회전, 로그인 rate limit, 감사 로그를 추가할 수 있습니다.
- 게시판 운영 기능: 게시글 수정/삭제, 공지 고정, 검색, 페이지네이션, 관리자 숨김 처리가 추가되면 좋습니다.
- 파일 저장소: 기본값은 로컬이며 `FILE_STORAGE_TYPE=s3`, `S3_BUCKET` 설정 시 업로드 파일과 다국어 TBM JSON을 S3에 저장합니다.
- AI 비동기 처리: 모델 호출이 오래 걸릴 수 있으므로 큐, 상태 업데이트, 재시도, 실패 로그가 있으면 안정적입니다.
- 테스트 데이터/시드: 발표 시연을 위해 사이트, 사용자, 작업허가, 위험 이벤트 샘플 데이터가 필요합니다.

## 역할

- `PUBLIC`: 인증 불필요
- `AUTHENTICATED`: 역할과 관계없이 로그인 필요
- `WORKER`: 회원가입 시 기본 부여되는 일반 작업자
- `ADMIN`: 전체 관제, 작업허가, 분석 결과 조회 및 기준정보 변경
- `AI_SERVICE`: AI 결과 등록 전용 기계 계정

## 주요 엔드포인트와 권한

```text
GET  /api/health                                             PUBLIC

POST /api/auth/register                                      PUBLIC
POST /api/auth/employees/verify                              PUBLIC
GET  /api/auth/usernames/{username}/availability             PUBLIC
POST /api/auth/login                                         PUBLIC
POST /api/auth/logout                                        AUTHENTICATED

POST /api/files                                              WORKER | ADMIN
GET  /api/files/{id}                                         소유자 | ADMIN | 관련 허가서 배정 작업자
GET  /api/files/{id}/download                                소유자 | ADMIN | 관련 허가서 배정 작업자

GET  /api/board/posts?category=general                       WORKER | ADMIN
GET  /api/board/posts/{id}                                   WORKER | ADMIN
POST /api/board/posts                                        WORKER | ADMIN
POST /api/board/posts/{id}/comments                          WORKER | ADMIN

GET  /api/master/sites                                       WORKER | ADMIN
POST /api/master/sites                                       ADMIN
GET  /api/master/blocks                                      WORKER | ADMIN
GET  /api/master/cameras                                     WORKER | ADMIN

GET  /api/work-permits                                       WORKER | ADMIN
GET  /api/work-permits/{id}                                  WORKER | ADMIN
GET  /api/work-permits/today                                 WORKER | ADMIN
GET  /api/admin/workers                                      ADMIN
POST /api/work-permits                                       ADMIN
PUT  /api/work-permits/{id}                                  ADMIN
DELETE /api/work-permits/{id}                                ADMIN
GET  /api/work-permits/trash                                 ADMIN
POST /api/work-permits/{id}/restore                          ADMIN
POST /api/work-permits/{id}/analyze                          ADMIN
POST /api/admin/work-permits/{id}/tbm/generate               ADMIN
DELETE /api/work-permits/{id}/permanent                      ADMIN

GET  /api/worker/tbm/today?language=ko                       WORKER | ADMIN
POST /api/worker/tbm/confirm                                 WORKER | ADMIN
GET  /api/worker/personal-checks/today                       WORKER | ADMIN
POST /api/worker/personal-checks                             WORKER | ADMIN (202 Accepted)
GET  /api/admin/ppe-checks                                   ADMIN

POST /api/notifications/devices                             WORKER | ADMIN
GET  /api/notifications/devices/status                      WORKER | ADMIN
POST /api/admin/notifications/test                          ADMIN
POST /api/admin/notifications/send                          ADMIN

GET  /api/safety-events                                      ADMIN
GET  /api/safety-events/reports?status=&sourceType=          ADMIN
GET  /api/safety-events/my                                   WORKER | ADMIN
POST /api/safety-events                                      WORKER | ADMIN
POST /api/safety-events/{id}/actions                         ADMIN
DELETE /api/safety-events/{id}                               ADMIN (처리 완료 상태만)

GET  /api/ai/model-runs                                      ADMIN
POST /api/ai/model-runs                                      ADMIN | AI_SERVICE
POST /api/ai/work-permits/{permitId}/analysis-results        ADMIN | AI_SERVICE
POST /api/ai/work-permits/{permitId}/field-guidance          ADMIN | AI_SERVICE
POST /api/ai/personal-checks/{id}/result                     ADMIN | AI_SERVICE

GET  /api/risks/scores                                       ADMIN
POST /api/risks/scores                                       ADMIN | AI_SERVICE
POST /api/risks/simulations                                  WORKER | ADMIN

GET  /api/dashboard/summary                                  ADMIN
GET|POST|PATCH /api/digital-twin/**                          ADMIN
```

게시판과 파일 API는 대화형 사용자 역할인 `WORKER`, `ADMIN`만 사용할 수 있습니다. `AI_SERVICE`는 AI 모델 결과와 위험 점수를 등록하는 API에만 접근할 수 있으며, 위에 명시되지 않은 API는 기본적으로 거부됩니다.

작업허가서를 등록하거나 PDF를 교체하면 작업허가서 분석이 자동으로 대기열에 들어갑니다. `POST /api/work-permits/{id}/analyze`는 실패한 분석이나 최신 규칙 재적용을 위한 관리자 재실행 API이며, 상태는 작업허가서 상세 응답의 `analysisRun`에서 `queued`, `running`, `finished`, `failed`로 확인합니다.

작업자의 보호구 제출 API는 사진, 안전화 확인, 안전복 확인을 저장한 뒤 `202 Accepted`로 즉시 응답합니다. 안전모(Helmet), 하네스(Harness), 용접면(Welding mask)의 YOLO 탐지 결과는 작업자 응답에 포함하지 않고 관리자용 `/api/admin/ppe-checks`에서만 제공합니다.

YOLO 이미지 결과는 아래처럼 보호구 점검 결과 API로 전달합니다. `status=retry_required`, `reasonCode=PPE_MISSING`, `missingItems`가 한 개 이상인 경우에만 `source_type=ai_ppe` 안전 이벤트가 자동 생성됩니다. 사람 미검출(`NO_CLEAR_WORKER`)이나 여러 명 감지(`MULTIPLE_WORKERS`)는 재촬영 사유이며 안전 이벤트를 생성하지 않습니다. 같은 `personal-check` ID의 콜백이 재전송되어도 이벤트는 한 건만 유지됩니다.

```json
{
  "status": "retry_required",
  "helmetOn": true,
  "helmetConfidence": 0.97,
  "harnessOn": false,
  "weldingMaskOn": null,
  "model": "yardops-ppe-image-v1",
  "message": "Required PPE was not detected: harness.",
  "reasonCode": "PPE_MISSING",
  "missingItems": ["harness"]
}
```

관리자 이벤트 목록은 `sourceType=user_report` 또는 `sourceType=ai_ppe`로 구분 조회할 수 있습니다.

인증이 필요한 API는 로그인 응답의 `accessToken`을 아래처럼 전달합니다.

```http
Authorization: Bearer {accessToken}
```

토큰이 없거나 유효하지 않으면 `401 Unauthorized`, 로그인했지만 역할이 부족하면 `403 Forbidden`을 반환합니다.
