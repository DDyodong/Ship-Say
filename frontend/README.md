# Smart Shipyard AI Safety 프론트엔드

React·Vite 기반의 작업자/관리자 안전 관제 웹 애플리케이션입니다.

## 실행

Node.js 20 이상과 npm이 필요합니다.

```powershell
npm ci
npm run dev
```

터미널에 표시되는 `http://localhost:5173` 주소를 브라우저에서 엽니다.

## 환경 설정

`.env.example`을 참고해 `.env.local`을 생성합니다.

```dotenv
VITE_API_BASE_URL=http://localhost:8180
VITE_KAKAO_JS_KEY=
VITE_FIREBASE_API_KEY=
VITE_CAMERA01_HLS_URL=
```

Docker Compose 밖에서 백엔드를 직접 실행하면 `VITE_API_BASE_URL=http://localhost:8080`을 사용합니다.

## npm 스크립트

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | Vite 개발 서버 |
| `npm run build` | 용접 데모 CSV 동기화 후 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 로컬 확인 |
| `npm run sync:welding-data` | AI 폴더의 CSV를 프론트 생성 데이터로 복사 |

## 화면 구성

- 로그인 및 역할 선택: 현장 작업자 / 관리자
- 현장 작업자: 오늘의 작업, TBM 브리핑, 조치 체크리스트, 위험 신고
- 관리자: 통합 관제, 영상 감시, 허가서 분석, 위험 예측, 기준 정보, 감사 로그

## 데이터 표시 기준

- 회원·허가서·신고·PPE 점검은 백엔드 API를 사용합니다.
- 용접 데모는 `ai/robot_anomaly_agent` CSV를 공통 입력 스키마로 재생합니다.
- 기타 디지털 트윈은 설비 프로필·시나리오 검증 데이터를 사용합니다. 현장 센서·위치 데이터를 연결하면 동일 스키마로 교체해 재검증할 수 있습니다.
