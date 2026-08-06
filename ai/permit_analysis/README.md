# 작업허가서 분석 서비스

팀원이 개발한 작업허가서 파서와 규칙 엔진을 Safety AI Control에서 호출할 수 있도록
FastAPI로 감싼 서비스입니다. API 키 없이 PDF 파싱, 단일허가 규칙 판정, SIMOPS
충돌 분석을 수행합니다.

## 실행

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m uvicorn main:app --host 127.0.0.1 --port 8001
```

헬스 체크는 `GET /health`, 분석은 multipart `POST /v1/analyze`입니다.

`existing_permits_json`에는 기존 분석 결과의 `parsed_permit` 배열을 전달합니다.
현재 운영 계약은 PDF 한 파일에 작업허가서 한 건만 허용합니다.

