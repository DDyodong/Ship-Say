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
- 파일 저장소: 현재 로컬 디렉터리에 저장합니다. 클라우드 배포 시 S3/Object Storage로 교체하는 구성이 필요합니다.
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
GET  /api/files/{id}                                         소유자 | ADMIN | 허가서 배정 작업자
GET  /api/files/{id}/download                                소유자 | ADMIN | 허가서 배정 작업자

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
DELETE /api/work-permits/{id}/permanent                      ADMIN

GET  /api/worker/tbm/today?language=ko                       WORKER | ADMIN
POST /api/worker/tbm/confirm                                 WORKER | ADMIN
GET  /api/worker/personal-checks/today                       WORKER | ADMIN
POST /api/worker/personal-checks                             WORKER | ADMIN

GET  /api/safety-events                                      ADMIN
GET  /api/safety-events/reports                              ADMIN
GET  /api/safety-events/my                                   WORKER | ADMIN
POST /api/safety-events                                      WORKER | ADMIN
POST /api/safety-events/{id}/actions                         ADMIN

GET  /api/ai/model-runs                                      ADMIN
POST /api/ai/model-runs                                      ADMIN | AI_SERVICE
POST /api/ai/work-permits/{permitId}/analysis-results        ADMIN | AI_SERVICE
POST /api/ai/personal-checks/{id}/result                     ADMIN | AI_SERVICE

GET  /api/risks/scores                                       ADMIN
POST /api/risks/scores                                       ADMIN | AI_SERVICE
POST /api/risks/simulations                                  WORKER | ADMIN

GET  /api/dashboard/summary                                  ADMIN
GET|POST|PATCH /api/digital-twin/**                          ADMIN
```

게시판과 파일 API는 대화형 사용자 역할인 `WORKER`, `ADMIN`만 사용할 수 있습니다. `AI_SERVICE`는 AI 모델 결과와 위험 점수를 등록하는 API에만 접근할 수 있으며, 위에 명시되지 않은 API는 기본적으로 거부됩니다.

인증이 필요한 API는 로그인 응답의 `accessToken`을 아래처럼 전달합니다.

```http
Authorization: Bearer {accessToken}
```

토큰이 없거나 유효하지 않으면 `401 Unauthorized`, 로그인했지만 역할이 부족하면 `403 Forbidden`을 반환합니다.
