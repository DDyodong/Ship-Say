# Safety AI Control

조선소·산업 현장의 안전 데이터를 통합 관리하는 AI 안전 관제 시스템입니다. 작업자는 작업 전 점검과 위험 신고를 수행하고, 관리자는 위험 이벤트·작업허가·AI 분석 결과를 조회하고 관리할 수 있습니다.

## 주요 기능

- 사번별 사전 지정 역할을 적용한 회원가입, 사원 확인, 로그인·로그아웃
- DB 세션 기반 Bearer 토큰 인증 및 역할별 접근 제어
- 작업허가서, 안전 이벤트, 위험 점수 관리
- AI 모델 실행 및 작업허가 분석 결과 저장
- 게시글·댓글 및 파일 업로드·다운로드
- 관리자용 안전 현황 대시보드
- `/worker/app` 작업자 웹과 관리자 관제·작업 배정 화면

## 한 번에 실행

Docker Desktop을 실행한 뒤 프로젝트 루트에서 다음 명령 하나로 MySQL, 작업허가서 분석 서비스, 백엔드, 프론트엔드를 모두 실행합니다.

```powershell
npm run dev
```

실행 후 프론트엔드는 `http://localhost:5173`, Docker 백엔드는 `http://localhost:8180`에서 열립니다. Windows 예약 포트와 충돌하지 않도록 컨테이너의 8080 포트를 호스트 8180에 연결합니다. 백그라운드 실행과 종료는 다음 명령을 사용합니다.

```powershell
npm run dev:detached
npm run dev:down
```

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Backend | Java 17, Spring Boot 3.3.5, Spring Web, Spring Security, Spring Data JPA |
| Permit AI | Python 3.11, FastAPI, pdfplumber, 규칙 기반 SIMOPS 엔진 |
| Database | MySQL 8.4, Flyway |
| Frontend | React 18, Vite 6, Lucide React |
| Build | Gradle Wrapper, npm |

## 프로젝트 구조

```text
.
├── backend/                       # Spring Boot 애플리케이션
│   └── src/main/resources/
│       └── db/migration/          # Flyway 마이그레이션
├── frontend/                      # React/Vite 프런트엔드
│   └── src/
│       ├── api/                   # API 클라이언트
│       ├── components/            # 공통 UI와 레이아웃
│       └── pages/                 # 인증·작업자·관리자 화면
├── ai/permit_analysis/            # 작업허가서 PDF·규칙·SIMOPS 분석 API
├── compose.yml                    # 로컬 MySQL 구성
├── API_SPEC.md                    # API와 접근 권한 명세
├── db_design.md                   # 데이터베이스 설계 문서
└── schema.sql                     # 전체 스키마 참고본
```

## 로컬 실행

### 1. 사전 요구사항

- Java 17
- Node.js와 npm
- Docker Desktop 또는 별도의 MySQL 8 인스턴스

### 2. MySQL 실행

프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
docker compose up -d mysql
```

기본 연결 정보는 다음과 같습니다.

| 항목 | 기본값 |
| --- | --- |
| Host | `localhost` |
| Port | `3307` |
| Database | `safety_smartyard_control` |
| Username | `admin123` |
| Password | `admin123` |

별도 DB를 사용하려면 백엔드 실행 전에 환경변수를 설정합니다.

```powershell
$env:DB_URL="jdbc:mysql://localhost:3307/safety_smartyard_control?useUnicode=true&characterEncoding=UTF-8&serverTimezone=UTC"
$env:DB_USERNAME="admin123"
$env:DB_PASSWORD="admin123"
```

### 3. 백엔드 실행

```powershell
.\gradlew.bat :backend:bootRun
```

백엔드는 기본적으로 `http://localhost:8080`에서 실행되며, 시작 시 Flyway가 DB 마이그레이션을 적용합니다.

정상 실행 여부는 다음 API로 확인할 수 있습니다.

```text
GET http://localhost:8080/api/health
```

### 4. 프런트엔드 실행

새 터미널에서 실행합니다.

```powershell
cd frontend
npm install
npm run dev
```

프런트엔드는 기본적으로 `http://localhost:8080`의 API를 호출합니다. 다른 주소를 사용한다면 `frontend/.env.local`에 다음 값을 지정합니다.

```dotenv
VITE_API_BASE_URL=http://localhost:8080
VITE_FIREBASE_API_KEY=your_restricted_firebase_web_api_key
```

### 5. Firebase 푸시 알림

Firebase Admin SDK 인증키는 저장소에 복사하거나 커밋하지 않습니다. 로컬에서는 백엔드를 실행하기 전에 인증키의 절대 경로를 환경변수로 지정합니다.

```powershell
$env:FIREBASE_ENABLED="true"
$env:FIREBASE_PROJECT_ID="aivle25"
$env:FIREBASE_CREDENTIALS_PATH="C:\path\to\aivle25-firebase-adminsdk.json"
.\gradlew.bat :backend:bootRun
```

ECS에서는 인증키 JSON을 Base64로 인코딩해 AWS Secrets Manager에 저장하고, 태스크 정의의 비밀 환경변수 `FIREBASE_SERVICE_ACCOUNT_BASE64`로 주입합니다. 일반 환경변수 `FIREBASE_ENABLED=true`, `FIREBASE_PROJECT_ID=aivle25`도 함께 설정해야 합니다.

## 최초 관리자 계정

기본 테스트 관리자 계정 대신 별도 관리자 계정을 사용하려면 백엔드를 처음 실행하기 전에 다음 환경변수를 설정합니다.

```powershell
$env:BOOTSTRAP_ADMIN_USERNAME="admin"
$env:BOOTSTRAP_ADMIN_PASSWORD="change-this-password"
$env:BOOTSTRAP_ADMIN_NAME="관리자"
.\gradlew.bat :backend:bootRun
```

환경변수를 지정하지 않은 개발 환경에서는 테스트 관리자 계정
`aivle` / `aivle123`이 자동으로 생성됩니다. 일반 회원의 역할은 사번별로 미리 지정된 `ADMIN` 또는 `WORKER` 역할을 회원가입 시 자동으로 부여합니다.


## 인증 및 역할

로그인 성공 응답의 `accessToken`을 인증이 필요한 요청에 전달합니다.

```http
Authorization: Bearer {accessToken}
```

| 역할 | 권한 |
| --- | --- |
| `WORKER` | 회원가입 시 기본 부여되는 일반 작업자 권한 |
| `ADMIN` | 전체 관제, 작업허가, 운영 데이터, 기준정보·AI 결과·위험 점수 관리 |
| `AI_SERVICE` | AI 결과와 위험 점수를 등록하는 서비스 계정 |

`AI_SERVICE` 역할은 자동 배정되지 않으므로 관리자가 DB에서 명시적으로 배정해야 합니다. `SAFETY_MANAGER` 역할은 Flyway V8에서 기존 배정 범위를 유지한 채 `ADMIN`으로 통합됩니다. 전체 엔드포인트와 역할별 권한은 [API_SPEC.md](API_SPEC.md)를 참고하세요.

## 테스트와 빌드

## OpenAI TBM 안전용어 표준화·다국어 번역

팀 규칙 모델의 허가서 판정 결과를 표준 한국어 TBM으로 교정하고 배정 작업자의 언어로 번역하려면 백엔드 또는 AWS ECS 태스크에 다음 환경변수를 설정합니다. API 키는 저장소나 프론트엔드 환경변수에 넣지 않습니다.

```dotenv
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5.4-nano
OPENAI_REASONING_EFFORT=none
OPENAI_MAX_OUTPUT_TOKENS=16000
```

허가서가 승인 또는 조건부 승인되면 백그라운드에서 자동 생성됩니다. 관리자는 `POST /api/admin/work-permits/{permitId}/tbm/generate`로 즉시 다시 생성할 수 있습니다. 출력 형식은 구조화 출력 스키마로 고정되며 한국어 표준화본, 실제 안전용어 교정 내역, 대상 언어별 TBM, 작업자 언어별 PPE·확인사항이 `model_runs`에 기록됩니다. 시스템 프롬프트는 `backend/src/main/resources/prompts/work-permit-field-guidance.txt`에서 수정합니다.

언어별 본문은 `tbm_materials`에 저장되고 UTF-8 JSON 파일은 S3의 `uploads/generated/tbm/{permitId}/{sessionId}/{language}.json` 경로에 저장됩니다. 기존 업로드와 동일한 `uploads/*` 권한 범위를 사용합니다. AWS S3를 사용하려면 다음 환경변수와 ECS 태스크 역할의 `s3:PutObject`, `s3:GetObject` 권한을 설정합니다.

```dotenv
FILE_STORAGE_TYPE=s3
S3_BUCKET=your-private-tbm-bucket
S3_REGION=ap-northeast-2
```

S3를 설정하지 않은 로컬 개발 환경에서는 동일한 JSON이 `uploads/generated/tbm/...`에 저장됩니다. 파일 메타데이터는 `files`, 연결 ID는 `tbm_materials.file_id`에 기록되며 관리자와 해당 허가서에 배정된 작업자만 다운로드할 수 있습니다.

백엔드 테스트:

```powershell
.\gradlew.bat :backend:test
```

프런트엔드 프로덕션 빌드:

```powershell
cd frontend
npm run build
```

## 관련 문서

- [API 명세](API_SPEC.md)
- [DB 설계](db_design.md)
- [전체 스키마 참고본](schema.sql)
- [SQL 교차 검증 결과](sql_cross_validation.md)

## 현재 구현 참고사항

- 파일은 기본적으로 백엔드 실행 위치의 `uploads/` 디렉터리에 저장되며, `FILE_STORAGE_TYPE=s3`이면 S3에 저장됩니다.
- 프런트엔드 화면은 역할별 페이지 구조로 분리되어 있으며, 일부 화면은 후속 API 연동과 기능 구현이 필요합니다.
- 운영 배포 전에는 비밀번호·DB 접속 정보의 외부 비밀 저장소 관리, 로그인 제한, 감사 로그 적용을 권장합니다.
