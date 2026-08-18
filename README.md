# Safety AI Control

조선소 작업허가, 안전 신고, PPE 점검, 알림과 디지털 트윈 시나리오를 하나의 작업자·관리자 웹에서 관리하는 PoC입니다.

## 현재 데이터 범위

| 구분 | 현재 상태 |
| --- | --- |
| 회원·권한, 작업허가, 안전 신고, PPE 점검 | 백엔드·DB API 연결 |
| 작업허가서 PDF·SIMOPS 분석 | FastAPI 분석 서비스 연결 |
| 용접 로봇·품질 데모 | 보유 CSV 데이터 재생 |
| 기타 공장 설비, 작업자 위치, 위험 예측 | 검증 데이터 연결, 현장 입력 스키마로 교체 가능 |

검증 화면은 `VALIDATION DATA`, `INPUT DATA READY`, `향후 데이터 연동 대상` 표시로 현재 입력 소스를 구분합니다. 현장 데이터를 연결하면 동일 스키마·규칙·예측 파이프라인에서 교체해 재검증할 수 있습니다.

## 주요 기능

- 사번 확인, 회원가입, 로그인·로그아웃과 역할별 접근 제어
- 작업허가서 PDF 등록, AI 초안, 규칙 판정, SIMOPS 충돌 분석
- 작업자 TBM, PPE 점검, 위험 신고와 관리자 조치 워크플로
- CCTV HLS 영상 모니터링
- 공장·도크 설비 디지털 트윈 시나리오
- Firebase 푸시 알림, 파일 로컬/S3 저장
- OpenAI 기반 TBM 안전용어 표준화와 12개 언어 번역

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Backend | Java 17, Spring Boot 3.3.5, Spring Security, Spring Data JPA |
| Permit AI | Python 3.11, FastAPI, pdfplumber, 규칙 기반 SIMOPS 엔진 |
| Database | MySQL 8.4, Flyway |
| Frontend | React 18, Vite 6, Three.js, HLS.js |
| Build | Gradle Wrapper, npm, Docker Compose |

## 프로젝트 구조

```text
.
├── backend/                       # Spring Boot API
├── frontend/                      # React/Vite 웹
├── ai/permit_analysis/             # 작업허가 PDF·SIMOPS 분석 API
├── ai/robot_anomaly_agent/         # 용접 로봇 모델·검증 데이터
├── compose.yml                    # 로컬 통합 실행
├── API_SPEC.md                    # API·권한 명세
└── db_design.md                   # DB 설계
```

## 통합 실행

필요한 환경은 Docker Desktop, Node.js 20 이상, npm입니다. 프로젝트 루트에서 다음 명령을 실행하면 MySQL, 작업허가 분석 API, 백엔드, 프론트엔드가 함께 기동됩니다.

```powershell
npm run dev
```

| 서비스 | 주소 |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:8180` |
| MySQL | `localhost:3307` |

```powershell
npm run dev:detached  # 백그라운드 실행
npm run dev:logs      # 로그
npm run dev:down      # 종료
```

## 개별 실행

### MySQL

```powershell
docker compose up -d mysql
```

로컬 Compose 기본값은 DB `safety_smartyard_control`, 사용자 `admin123`, 비밀번호 `admin123`입니다. 로컬 개발용으로만 사용하고 배포 환경에서는 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`를 별도로 주입합니다.

### Backend

```powershell
.\gradlew.bat :backend:bootRun
```

- 기본 주소: `http://localhost:8080`
- 헬스 체크: `GET http://localhost:8080/api/health`
- 시작 시 Flyway 마이그레이션 적용

### Frontend

```powershell
cd frontend
npm ci
npm run dev
```

`frontend/.env.local`에서 API·지도·Firebase·카메라 설정을 덮어쓸 수 있습니다. 사용 가능한 항목은 [frontend/.env.example](frontend/.env.example)을 참고하세요.

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_KAKAO_JS_KEY=
VITE_FIREBASE_API_KEY=
VITE_CAMERA01_HLS_URL=
```

## 인증과 권한

로그인 성공 후 응답의 `accessToken`을 요청 헤더에 전달합니다.

```http
Authorization: Bearer {accessToken}
```

| 역할 | 범위 |
| --- | --- |
| `WORKER` | 본인 작업, TBM, PPE 점검, 안전 신고 |
| `ADMIN` | 관제, 작업허가, 조치 워크플로, 기준정보 |
| `AI_SERVICE` | AI 결과·위험 점수 등록용 서비스 계정 |

백엔드를 Compose 밖에서 직접 실행할 때는 관리자 계정을 다음 환경변수로 설정할 수 있습니다.

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME="admin"
$env:BOOTSTRAP_ADMIN_PASSWORD="change-this-password"
$env:BOOTSTRAP_ADMIN_NAME="관리자"
```

배포 환경에서는 테스트 계정과 기본 비밀번호를 사용하지 않습니다. 전체 API 권한은 [API_SPEC.md](API_SPEC.md)에서 확인합니다.

## 안전 신고 조치 워크플로

```text
접수(received)
→ 관리자 조치 요청(action_requested)
→ 작업자 조치 완료 보고(completion_reported)
→ 관리자 최종 확인(resolved)
```

- 작업자는 본인 신고의 조치 완료만 보고할 수 있습니다.
- 관리자는 작업자의 완료 보고 후 최종 처리합니다.
- 상태·작성자·내용·시각은 관리자 처리 이력에 남습니다.

## OpenAI TBM 표준화·번역

작업허가서 판정 결과를 한국어 TBM으로 정리하고 앱 지원 언어로 번역하려면 백엔드에 다음 환경변수를 설정합니다. API 키는 저장소나 프론트엔드 환경변수에 넣지 않습니다.

```dotenv
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-nano
OPENAI_REASONING_EFFORT=none
OPENAI_MAX_OUTPUT_TOKENS=16000
```

번역 결과는 `tbm_materials`와 파일 저장소에 저장됩니다. S3를 사용하려면 `FILE_STORAGE_TYPE=s3`, `S3_BUCKET`, `S3_REGION`을 설정합니다.

## Firebase 푸시 알림

Firebase Admin SDK 인증키는 저장소에 커밋하지 않습니다.

```powershell
$env:FIREBASE_ENABLED="true"
$env:FIREBASE_PROJECT_ID="aivle25"
$env:FIREBASE_CREDENTIALS_PATH="C:\path\to\firebase-adminsdk.json"
```

ECS에서는 `FIREBASE_SERVICE_ACCOUNT_BASE64` 비밀 환경변수를 사용합니다.

## 테스트·빌드

```powershell
# 작업허가 분석 AI
.\ai\permit_analysis\.venv\Scripts\python.exe -m pytest ai\permit_analysis\tests -q

# Backend
.\gradlew.bat :backend:test

# Frontend
cd frontend
npm run build
```

## 관련 문서

- [Frontend 안내](frontend/README.md)
- [API 명세](API_SPEC.md)
- [DB 설계](db_design.md)
- [전체 스키마 참고본](schema.sql)
- [SQL 교차 검증 결과](sql_cross_validation.md)

## 배포 전 확인

- DB·관리자·외부 API 비밀값을 비밀 저장소에서 주입합니다.
- `VALIDATION DATA`는 현재 연결된 검증용 입력 소스를 의미합니다.
- 현장 설비·작업자 데이터는 게이트웨이 연동 후 동일 입력 스키마로 교체해 검증합니다.
